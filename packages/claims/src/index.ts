// The authoring vocabulary: every claim, ref, scenario, observable, action, and fixture is a
// real builder call that registers into a module-level registry. The plugin imports each
// sidecar between `beginCollection` and `endCollection` and reads what was registered, so a
// renamed export breaks compilation rather than passing silently.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// ---------------------------------------------------------------------------
// Wire shapes (mirrored by hand; `packages/plugin-ts/test/contract.test.mjs`
// checks them against the committed `docs/schema/vd-1/*.json`).
// ---------------------------------------------------------------------------

export type Kind = "requires" | "ensures" | "invariant" | "witness" | "because";

export type RefToken =
  | { kind: "symbol"; name: string; from: string }
  | { kind: "concept"; name: string };

export interface SatisfiesSpec {
  source: string;
  accepts?: unknown;
  rejects?: unknown;
}

export type Check =
  | { equals: unknown }
  | { contains: unknown }
  | { satisfies: SatisfiesSpec };

export type Asserts =
  | { all: Asserts[] }
  | { any: Asserts[] }
  | { not: Asserts }
  | { obs: string; is: Check };

export interface Artefact {
  path: string;
  sha256: string;
}

export interface Citation {
  store: string;
  id: string;
  turn?: number;
}

export interface Channel {
  scenario?: string;
  asserts?: Asserts;
  artefact?: Artefact;
  citation?: Citation;
}

export interface Selects {
  concept?: string;
  kind?: Kind[];
  referent?: string;
  claims?: string[];
}

export interface ObservableDecl {
  name: string;
  type: string;
}

export interface ActionDecl {
  name: string;
  calls: RefToken;
  produces: string[];
}

export interface DocumentDecl {
  path: string;
  audience: string;
  question: string;
  selects: Selects;
  notApplicable?: string;
}

export interface Skipped {
  file: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Registry.
// ---------------------------------------------------------------------------

/** A claim exactly as the sidecar registered it. `file` is absolute here; the plugin
 * makes it project-relative before it goes on the wire. */
export interface RegisteredClaim {
  kind: Kind;
  subject: RefToken;
  concept: string;
  predicate: string;
  text: string;
  channel: Channel;
  supports: string[];
  file: string;
  line: number;
}

/** The live runner behind an action: it receives the fixture world and the transpiled
 * target module, and returns a record keyed by observable name. */
export type ActionRun = (
  world: unknown,
  target: Record<string, unknown>,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

export interface ActionEntry extends ActionDecl {
  run: ActionRun;
}

export interface FixtureEntry {
  name: string;
  setup: () => unknown | Promise<unknown>;
}

export interface Registered {
  claims: RegisteredClaim[];
  observables: ObservableDecl[];
  actions: ActionEntry[];
  fixtures: FixtureEntry[];
  documents: DocumentDecl[];
  concepts: string[];
}

const registry: Registered = {
  claims: [],
  observables: [],
  actions: [],
  fixtures: [],
  documents: [],
  concepts: [],
};

/** Live predicate functions keyed by their source text, so `satisfies` leaves can be
 * evaluated in-process without re-parsing the author's closure. */
export const predicates = new Map<string, (value: unknown) => boolean>();

let currentSidecar: string | undefined;
let snapshot = { claims: 0, observables: 0, actions: 0, fixtures: 0, documents: 0, concepts: 0 };

/** The plugin calls this before importing each sidecar. */
export function beginCollection(sidecarPath: string): void {
  currentSidecar = sidecarPath;
  snapshot = {
    claims: registry.claims.length,
    observables: registry.observables.length,
    actions: registry.actions.length,
    fixtures: registry.fixtures.length,
    documents: registry.documents.length,
    concepts: registry.concepts.length,
  };
}

/** The plugin calls this after the import settles; it returns what the sidecar added. */
export function endCollection(): Registered {
  const out: Registered = {
    claims: registry.claims.slice(snapshot.claims),
    observables: registry.observables.slice(snapshot.observables),
    actions: registry.actions.slice(snapshot.actions),
    fixtures: registry.fixtures.slice(snapshot.fixtures),
    documents: registry.documents.slice(snapshot.documents),
    concepts: registry.concepts.slice(snapshot.concepts),
  };
  currentSidecar = undefined;
  return out;
}

/** `@veridoc/tree` calls this from `tree()` to report the index fragment. */
export function registerIndex(concepts: string[], documents: DocumentDecl[]): void {
  for (const concept of concepts) {
    if (!registry.concepts.includes(concept)) registry.concepts.push(concept);
  }
  for (const document of documents) registry.documents.push(document);
}

// ---------------------------------------------------------------------------
// Caller location.
// ---------------------------------------------------------------------------

function parseFrame(frame: string): { file: string; line: number } | undefined {
  let f = frame.trim().replace(/^at\s+/, "");
  if (f.startsWith("(")) f = f.slice(1, -1);
  const c1 = f.lastIndexOf(":");
  if (c1 < 0) return undefined;
  const c2 = f.lastIndexOf(":", c1 - 1);
  if (c2 < 0) return undefined;
  const file = f.slice(0, c2);
  const line = Number(f.slice(c2 + 1, c1));
  if (file.length === 0 || !Number.isInteger(line)) return undefined;
  return { file: file.startsWith("file://") ? fileURLToPath(file) : file, line };
}

function callerLocation(): { file: string; line: number } {
  const stack = new Error().stack ?? "";
  for (const raw of stack.split("\n")) {
    const frame = parseFrame(raw);
    if (frame === undefined) continue;
    // Skip frames inside this package's own build output.
    if (frame.file.includes("/@veridoc/claims/") || frame.file.includes("/packages/claims/")) continue;
    return frame;
  }
  return { file: currentSidecar ?? "", line: 0 };
}

// ---------------------------------------------------------------------------
// Import map and call-site reading for `ref`.
// ---------------------------------------------------------------------------

interface CallerFile {
  /** Local binding (exported name, or namespace name) to module specifier. */
  map: Map<string, string>;
  sourceFile: ts.SourceFile | undefined;
}

const callerFileCache = new Map<string, CallerFile>();

function callerFile(file: string): CallerFile {
  const cached = callerFileCache.get(file);
  if (cached !== undefined) return cached;
  const map = new Map<string, string>();
  let sourceFile: ts.SourceFile | undefined;
  try {
    const text = readFileSync(file, "utf8");
    sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      const specifier = ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : "";
      const clause = statement.importClause;
      if (clause === undefined || specifier === "") continue;
      if (clause.name !== undefined) map.set(clause.name.text, specifier);
      const bindings = clause.namedBindings;
      if (bindings === undefined) continue;
      if (ts.isNamespaceImport(bindings)) {
        map.set(bindings.name.text, specifier);
        for (const name of exportsOf(file, specifier)) {
          if (!map.has(name)) map.set(name, specifier);
        }
      } else {
        for (const element of bindings.elements) {
          const exported = element.propertyName ?? element.name;
          map.set(exported.text, specifier);
        }
      }
    }
  } catch {
    // An unreadable caller leaves the map empty; `ref` then reports an empty specifier
    // and `resolve` answers `unresolved`, which is the loud failure.
  }
  const entry: CallerFile = { map, sourceFile };
  callerFileCache.set(file, entry);
  return entry;
}

/**
 * The symbol expression the caller wrote on the given 1-based line: a property access
 * `binding.member` where `binding` is an import binding, or a bare identifier that is an
 * import binding. Reading the call site is what lets a renamed export keep its written
 * name, so `resolve` answers `unresolved` for the name the author wrote instead of the
 * sidecar failing to import.
 */
function symbolAtCallSite(
  sourceFile: ts.SourceFile,
  line: number,
  map: Map<string, string>,
): { name: string; from: string } | undefined {
  let found: { name: string; from: string } | undefined;
  const visit = (node: ts.Node): void => {
    if (found !== undefined) return;
    if (ts.isPropertyAccessExpression(node)) {
      const base = node.expression;
      if (
        ts.isIdentifier(base) &&
        map.has(base.text) &&
        sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1 === line
      ) {
        found = { name: node.name.text, from: map.get(base.text) ?? "" };
        return;
      }
    } else if (
      ts.isIdentifier(node) &&
      !(ts.isCallExpression(node.parent) && node.parent.expression === node) &&
      map.has(node.text) &&
      sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1 === line
    ) {
      found = { name: node.text, from: map.get(node.text) ?? "" };
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return found;
}

/** The exported names of a relative module, read through the compiler API, so a namespace
 * import maps every name it can supply to its specifier. */
function exportsOf(fromFile: string, specifier: string): string[] {
  const names: string[] = [];
  try {
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) return names;
    const target = path.resolve(path.dirname(fromFile), specifier);
    const text = readFileSync(target, "utf8");
    const sourceFile = ts.createSourceFile(target, text, ts.ScriptTarget.Latest, true);
    for (const statement of sourceFile.statements) {
      const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
      const exported = modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      if (!exported) continue;
      if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
        if (statement.name !== undefined) names.push(statement.name.text);
      } else if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
        }
      }
     }
  } catch {
    // An unreadable target contributes no names; the lookup then misses and `resolve`
    // reports the referent unresolved.
  }
  return names;
 }

/** The module specifier comes from the sidecar's own import statements read through the
 * compiler API, so a renamed export produces `unresolved` rather than a silent miss.
 * `ref(namespace.symbol)` keeps the name even when the export is gone: the call-site
 * property access is the name, so the rename surfaces as a bind error, not a crash. */
export function ref(symbol: Function | object | undefined): RefToken {
  const { file, line } = callerLocation();
  const { map, sourceFile } = callerFile(file);
  const written =
    sourceFile === undefined ? undefined : symbolAtCallSite(sourceFile, line, map);
  if (written !== undefined) {
    return { kind: "symbol", name: written.name, from: written.from };
  }
  const name = symbol !== undefined && "name" in symbol ? String(symbol.name) : "";
  return { kind: "symbol", name, from: map.get(name) ?? "" };
}

/** A declared concept as a claim subject. */
export function concept(name: string): RefToken {
  return { kind: "concept", name };
}

export function scenario(id: string): string {
  return id;
}

export function observable(name: string, type: string): ObservableDecl {
  const decl: ObservableDecl = { name, type };
  registry.observables.push(decl);
  return decl;
}

export function action(
  name: string,
  a: { calls: Function; produces: string[]; run: ActionRun },
): ActionDecl {
  const entry: ActionEntry = {
    name,
    calls: ref(a.calls),
    produces: a.produces,
    run: a.run,
  };
  registry.actions.push(entry);
  return { name: entry.name, calls: entry.calls, produces: entry.produces };
}

export function fixture(name: string, setup: () => unknown | Promise<unknown>): { name: string } {
  registry.fixtures.push({ name, setup });
  return { name };
}

export function equals(value: unknown): Check {
  return { equals: value };
}

export function contains(value: unknown): Check {
  return { contains: value };
}

export function satisfies<T>(
  fn: (value: T) => boolean,
  witnesses?: { accepts: T; rejects: T },
): Check {
  const source = fn.toString();
  predicates.set(source, fn as (value: unknown) => boolean);
  const spec: SatisfiesSpec = { source };
  if (witnesses !== undefined) {
    spec.accepts = witnesses.accepts;
    spec.rejects = witnesses.rejects;
  }
  return { satisfies: spec };
}

export function all(...nodes: Asserts[]): Asserts {
  return { all: nodes };
}

export function any(...nodes: Asserts[]): Asserts {
  return { any: nodes };
}

export function not(node: Asserts): Asserts {
  return { not: node };
}

export interface ClaimArgs {
  subject: RefToken;
  concept: string;
  predicate: string;
  text: string;
  supports?: string[];
  scenario?: string;
  asserts?: Asserts;
  artefact?: Artefact;
  citation?: Citation;
}

function register(kind: Kind, args: ClaimArgs): void {
  const where = callerLocation();
  const channel: Channel = {};
  if (args.scenario !== undefined) channel.scenario = args.scenario;
  if (args.asserts !== undefined) channel.asserts = args.asserts;
  if (args.artefact !== undefined) channel.artefact = args.artefact;
  if (args.citation !== undefined) channel.citation = args.citation;
  registry.claims.push({
    kind,
    subject: args.subject,
    concept: args.concept,
    predicate: args.predicate,
    text: args.text,
    channel,
    supports: args.supports ?? [],
    file: where.file,
    line: where.line,
  });
}

export const claim: Record<Kind, (args: ClaimArgs) => void> = {
  requires: (args) => register("requires", args),
  ensures: (args) => register("ensures", args),
  invariant: (args) => register("invariant", args),
  witness: (args) => register("witness", args),
  because: (args) => register("because", args),
};
