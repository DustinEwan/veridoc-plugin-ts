// `collect`: walk the project for `index.doc.ts` and every other `*.doc.ts`, and
// dynamic-import each between `beginCollection` and `endCollection`. A module that throws on
// import becomes a `skipped` entry carrying the error message; the engine turns that into a
// run failure, because claims must not vanish silently.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  beginCollection,
  endCollection,
  type Registered,
  type RegisteredClaim,
  type RegisteredScenario,
} from "@veridoc/claims";
import type {
  CollectResult,
  DocumentDecl,
  RawClaim,
  ScenarioDecl,
  Skipped,
} from "./protocol.js";
import { claimNames } from "./ids.js";
import { setState, type ProjectState, type VeridocConfig } from "./state.js";

const SKIP_DIRS: Record<string, true> = {
  node_modules: true,
  dist: true,
  target: true,
  out: true,
};

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || entry.name in SKIP_DIRS) continue;
      walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".doc.ts")) {
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
  const documents: DocumentDecl[] = [];
  const concepts: string[] = [];

  for (const file of files) {
    beginCollection(file);
    try {
      // The claim modules are discovered at runtime from the project on disk; a static
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
      for (const document of registered.documents) documents.push(document);
      for (const concept of registered.concepts) {
        if (!concepts.includes(concept)) concepts.push(concept);
      }
    }
  }

  // The id the engine addresses a claim by is `<subject>#<predicate-slug>`, built from the
  // author's own words and nothing else, so every claim is named before any of their referents
  // has resolved. It travels on the claim, keys `scenarios`, and is the only thing `run` is
  // asked for; the engine uses it verbatim rather than re-slugging the predicate (`0006`).
  const claimIds = claimNames(
    claims.map(({ claim }) => ({ subjectName: claim.subject.name, predicate: claim.predicate })),
  );

  const wireClaims: RawClaim[] = claims.map(({ sidecar, claim }, index) => {
    const writtenIn = claim.file.length > 0 ? claim.file : sidecar;
    return {
      id: claimIds[index],
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
      file: relPosix(root, writtenIn),
      line: claim.line,
    };
  });

  const scenarios: Record<string, ScenarioDecl> = {};
  const live = new Map<string, RegisteredScenario>();
  claims.forEach(({ claim }, index) => {
    const scenario = claim.scenario;
    if (scenario === undefined) return;
    const id = claimIds[index];
    scenarios[id] = { given: scenario.given, when: scenario.when, values: scenario.values };
    live.set(id, scenario);
  });

  const state: ProjectState = {
    root,
    config: readConfig(root),
    claims: wireClaims,
    scenarios: live,
    documents,
    concepts,
    referents: new Map(),
  };
  setState(state);

  const result: CollectResult = {
    concepts,
    documents,
    claims: wireClaims,
    scenarios,
    skipped,
  };
  cached = { root, result };
  return result;
}
