// The wire types of the `VeridocPlugin` interface, mirrored by hand from the Rust side.
// `test/contract.test.mjs` compares every literal below against the committed
// `docs/schema/veridoc-1/*.json`, so the TypeScript side cannot drift from the Rust side.

// ---------------------------------------------------------------------------
// Literals.
// ---------------------------------------------------------------------------

export const PROTOCOL_VERSION = "veridoc/1";
export const PLUGIN_NAME = "veridoc-plugin-ts";
export const PLUGIN_VERSION = "0.1.0";
export const LANGUAGES = ["typescript"] as const;

export const CAPABILITIES = [
  "initialization",
  "collect",
  "resolution",
  "derivability",
  "bivalence",
  "execution",
  "citation",
  "surface",
] as const;

export const KINDS = ["requires", "ensures", "invariant", "witness", "because"] as const;

export const BIVALENCE_METHODS = ["structural", "static-analysis", "witnesses"] as const;

export const RUN_FAILURE_KINDS = ["build", "fixture", "deadline", "plugin"] as const;

export const VALUE_KINDS = ["string", "number", "boolean", "array", "object"] as const;

export const METHODS = [
  "handshake",
  "init",
  "collect",
  "resolve",
  "derivable",
  "bivalence",
  "run",
  "cite",
  "surface",
] as const;

export const ERROR_CODES = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  pluginError: -32000,
} as const;

/** The property and required lists of every wire object this plugin answers with, keyed
 * by the committed schema file name. The contract test diffs these against the schema. */
export const FIELDS = {
  handshake: {
    properties: ["protocolVersion", "name", "version", "languages", "capabilities"],
    required: ["protocolVersion", "name", "version", "languages", "capabilities"],
  },
  "init-req": {
    properties: ["root", "document", "force"],
    required: ["root", "document"],
  },
  "init-result": {
    properties: ["written", "next"],
    required: ["written"],
  },
  "collect-result": {
    properties: [
      "concepts",
      "documents",
      "claims",
      "scenarios",
      "skipped",
    ],
    required: [
      "concepts",
      "documents",
      "claims",
      "scenarios",
      "skipped",
    ],
  },
  "raw-claim": {
    properties: [
      "id",
      "kind",
      "subject",
      "concept",
      "predicate",
      "text",
      "channel",
      "file",
      "line",
    ],
    required: [
      "id",
      "kind",
      "subject",
      "concept",
      "predicate",
      "text",
      "channel",
      "file",
      "line",
    ],
  },
  "value-decl": {
    properties: ["name", "type"],
    required: ["name", "type"],
  },
  channel: {
    properties: ["asserts", "artefact", "citation"],
    required: [],
  },
  "document-decl": {
    properties: ["path", "audience", "question", "notApplicable"],
    required: ["path", "audience", "question"],
  },
  "scenario-decl": {
    properties: ["given", "when", "values"],
    required: ["given", "when", "values"],
  },
  artefact: {
    properties: ["path", "sha256"],
    required: ["path", "sha256"],
  },
  citation: {
    properties: ["store", "id", "turn"],
    required: ["store", "id"],
  },
  "satisfies-spec": {
    properties: ["source", "accepts", "rejects"],
    required: ["source"],
  },
  "assert-leaf": {
    properties: ["obs", "is"],
    required: ["obs", "is"],
  },
  "run-request": {
    properties: ["claim", "timeoutMs"],
    required: ["claim", "timeoutMs"],
  },
  "run-response": {
    properties: ["ok", "observed", "satisfied", "failure"],
    required: ["ok", "observed", "satisfied"],
  },
  "bivalence-result": {
    properties: ["bivalent", "method", "witnessAccepts", "witnessRejects", "reason"],
    required: ["bivalent", "method"],
  },
  "resolve-result": {
    properties: ["resolved", "unresolved"],
    required: ["resolved", "unresolved"],
  },
  "derivable-result": {
    properties: ["facts"],
    required: ["facts"],
  },
  "cite-result": {
    properties: ["resolved", "unresolved"],
    required: ["resolved", "unresolved"],
  },
  "surface-result": {
    properties: ["referents"],
    required: ["referents"],
  },
  skipped: {
    properties: ["file", "reason"],
    required: ["file", "reason"],
  },
} as const;

/** The externally tagged `Check` variants and the internally tagged `RefToken` kinds. */
export const CHECK_VARIANTS = ["equals", "contains", "satisfies"] as const;
export const REF_TOKEN_KINDS = ["symbol", "concept"] as const;

// ---------------------------------------------------------------------------
// Types.
// ---------------------------------------------------------------------------

export type Capability = (typeof CAPABILITIES)[number];
export type Kind = (typeof KINDS)[number];
export type BivalenceMethod = (typeof BIVALENCE_METHODS)[number];

export type RunFailureKind = (typeof RUN_FAILURE_KINDS)[number];
export type RefToken =
  | { kind: "symbol"; name: string; from: string }
  | { kind: "concept"; name: string };

export interface Handshake {
  protocolVersion: string;
  name: string;
  version: string;
  languages: string[];
  capabilities: Capability[];
}

export interface InitReq {
  root: string;
  document: DocumentDecl;
  force?: boolean;
}

export interface InitResult {
  written: string[];
  next: string[];
}

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
  turn?: number | null;
}

export interface Channel {
  asserts?: Asserts | null;
  artefact?: Artefact | null;
  citation?: Citation | null;
}

export interface DocumentDecl {
  path: string;
  audience: string;
  question: string;
  notApplicable?: string | null;
}

/** The declared type of one value a scenario returns. It is what makes `contains` over a
 * number a refusal instead of a false verdict. */
export type ValueType = (typeof VALUE_KINDS)[number];

export interface ScenarioValue {
  name: string;
  type: ValueType;
}

/** One claim's scenario: its two step labels and the values its code produces. It has no id
 * of its own — the claim's id is the only address it is ever given. */
export interface ScenarioDecl {
  given: string;
  when: string;
  values: ScenarioValue[];
}

export interface Skipped {
  file: string;
  reason: string;
}

export interface RawClaim {
  /** `<subject>#<predicate-slug>`, the claim module's own rule; the engine uses it verbatim,
   * and it is the only thing `run` is asked for. */
  id: string;
  kind: Kind;
  subject: RefToken;
  concept: string;
  predicate: string;
  text: string;
  channel: Channel;
  file: string;
  line: number;
}

export interface CollectResult {
  concepts: string[];
  documents: DocumentDecl[];
  claims: RawClaim[];
  /** The scenario beside each claim that declares one, keyed by that claim's id. A claim
   * with no entry is judged by prose and source only. */
  scenarios: Record<string, ScenarioDecl>;
  skipped: Skipped[];
}

export interface ResolvedRef {
  ref: string;
  referentId: string;
  signature: string;
}

export interface UnresolvedRef {
  ref: string;
  reason: string;
}

export interface ResolveResult {
  resolved: ResolvedRef[];
  unresolved: UnresolvedRef[];
}

export interface DerivableResult {
  facts: string[];
}

export interface BivalenceResult {
  bivalent: boolean;
  method: BivalenceMethod;
  witnessAccepts?: boolean;
  witnessRejects?: boolean;
  reason?: string;
}

/** One claim's scenario to run: the claim's id is the only address, and the wait is the
 * host's own. */
export interface RunRequest {
  claim: string;
  timeoutMs: number;
}

/** One value the run produced: the name the claim's scenario declares for it, and the value
 * JSON-encoded, so the engine's `{"equals":2}` meets the number 2 and not the string "2". */
export interface Observed {
  observable: string;
  value: string;
}

/** The plugin's answer for one leaf of the claim's own assertion tree, addressed
 * `{claim id}#l{n}` over its pre-order walk — a mark the plugin derives, never one the engine
 * sends. A `satisfies` leaf is decided by the author's predicate; the rest are decided from the
 * values above and the engine reaches the same verdict from them. */
export interface LeafAnswer {
  leafId: string;
  ok: boolean;
}

export interface RunFailure {
  kind: RunFailureKind;
  detail: string;
}

/** The scenario's run, answered: every declared value observed, every leaf of the claim's own
 * assertion tree decided, and nothing else. A scenario that cannot run answers this shape with
 * `ok: false` and a failure naming the claim — never a JSON-RPC error — so the host records
 * that one claim's result and keeps judging the rest. */
export interface RunResponse {
  ok: boolean;
  observed: Observed[];
  satisfied: LeafAnswer[];
  failure?: RunFailure;
}

export interface ResolvedCitation {
  id: string;
  text: string;
  state?: string;
}

export interface UnresolvedCitation {
  id: string;
  reason: string;
}

export interface CiteResult {
  resolved: ResolvedCitation[];
  unresolved: UnresolvedCitation[];
}

export interface SurfaceReferent {
  referentId: string;
  name: string;
  public: boolean;
}

export interface SurfaceResult {
  referents: SurfaceReferent[];
}
