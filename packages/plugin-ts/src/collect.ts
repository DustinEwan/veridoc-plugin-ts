// `collect`: walk the project for `index.doc.ts`, every `*.doc.ts`, and every `*.obs.ts`,
// and dynamic-import each between `beginCollection` and `endCollection`. A sidecar that
// throws on import becomes a `skipped` entry carrying the error message; the engine turns
// that into a run failure, because claims must not vanish silently.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  beginCollection,
  endCollection,
  type ActionEntry,
  type FixtureEntry,
  type ObservableDecl,
  type Registered,
  type RegisteredClaim,
} from "@veridoc/claims";
import type { CollectResult, DocumentDecl, RawClaim, Skipped } from "./protocol.js";
import { setState, type ProjectState, type VeridocConfig } from "./state.js";

const SKIP_DIRS: Record<string, true> = {
  node_modules: true,
  dist: true,
  target: true,
  out: true,
};

function isSidecar(name: string): boolean {
  return name === "index.doc.ts" || name.endsWith(".doc.ts") || name.endsWith(".obs.ts");
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || entry.name in SKIP_DIRS) continue;
      walk(full, out);
    } else if (entry.isFile() && isSidecar(entry.name)) {
      out.push(full);
    }
  }
}

export function relPosix(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join("/");
}

/** Make a sidecar's import specifier project-relative when it names a file; a bare
 * package specifier is returned untouched for `resolve` to refuse or accept. */
function normalizeFrom(root: string, specifier: string, sidecarAbs: string): string {
  if (specifier === "") return specifier;
  if (specifier.startsWith(".") || path.isAbsolute(specifier)) {
    return relPosix(root, path.resolve(path.dirname(sidecarAbs), specifier));
  }
  return specifier;
}

function readConfig(root: string): VeridocConfig {
  const file = path.join(root, ".veridoc", "config.json");
  if (!existsSync(file)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof parsed === "object" && parsed !== null && "citationStores" in parsed) {
      const stores = parsed.citationStores;
      if (Array.isArray(stores)) {
        return { citationStores: stores as VeridocConfig["citationStores"] };
      }
    }
    return {};
  } catch {
    return {};
  }
}

let cached: { root: string; result: CollectResult } | undefined;

export async function collect(root: string): Promise<CollectResult> {
  if (cached !== undefined && cached.root === root) return cached.result;

  const files: string[] = [];
  walk(root, files);
  files.sort();
  // `index.doc.ts` first so the index fragment is registered before any sidecar runs.
  files.sort(
    (a, b) =>
      Number(path.basename(b) === "index.doc.ts") -
      Number(path.basename(a) === "index.doc.ts"),
  );

  const skipped: Skipped[] = [];
  const claims: { sidecar: string; claim: RegisteredClaim }[] = [];
  const observables: ObservableDecl[] = [];
  const actions: { sidecar: string; entry: ActionEntry }[] = [];
  const fixtures: FixtureEntry[] = [];
  const documents: DocumentDecl[] = [];
  const concepts: string[] = [];

  for (const file of files) {
    beginCollection(file);
    try {
      // The sidecar paths are discovered at runtime from the project on disk; a static
      // import cannot name them.
      await import(pathToFileURL(file).href);
    } catch (error) {
      skipped.push({
        file: relPosix(root, file),
        reason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      const registered: Registered = endCollection();
      for (const claim of registered.claims) claims.push({ sidecar: file, claim });
      observables.push(...registered.observables);
      for (const entry of registered.actions) actions.push({ sidecar: file, entry });
      fixtures.push(...registered.fixtures);
      for (const document of registered.documents) documents.push(document);
      for (const concept of registered.concepts) {
        if (!concepts.includes(concept)) concepts.push(concept);
      }
    }
  }

  const wireClaims: RawClaim[] = claims.map(({ sidecar, claim }) => {
    const writtenIn = claim.file.length > 0 ? claim.file : sidecar;
    return {
      kind: claim.kind,
      subject:
        claim.subject.kind === "symbol"
          ? {
              kind: "symbol",
              name: claim.subject.name,
              from: normalizeFrom(root, claim.subject.from, writtenIn),
            }
          : claim.subject,
      concept: claim.concept,
      predicate: claim.predicate,
      text: claim.text,
      channel: claim.channel,
      supports: claim.supports,
      file: relPosix(root, writtenIn),
      line: claim.line,
    };
  });

  const wireActions = actions.map(({ sidecar, entry }) => ({
    name: entry.name,
    calls:
      entry.calls.kind === "symbol"
        ? {
            kind: "symbol" as const,
            name: entry.calls.name,
            from: normalizeFrom(root, entry.calls.from, sidecar),
          }
        : entry.calls,
    produces: entry.produces,
  }));

  const state: ProjectState = {
    root,
    config: readConfig(root),
    claims: wireClaims,
    observables,
    actions: actions.map(({ sidecar, entry }, index) => ({
      ...entry,
      calls: wireActions[index].calls,
    })),
    fixtures,
    documents,
    concepts,
    referents: new Map(),
  };
  setState(state);

  const result: CollectResult = {
    concepts,
    documents,
    claims: wireClaims,
    observables,
    actions: wireActions,
    fixtures: fixtures.map((f) => f.name),
    skipped,
  };
  cached = { root, result };
  return result;
}
