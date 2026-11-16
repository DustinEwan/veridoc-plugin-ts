// The wire types of the `VeridocPlugin` interface, mirrored by hand from the Rust side.
// `test/contract.test.mjs` compares every literal below against the committed
// `docs/schema/vd-1/*.json`, so the TypeScript side cannot drift from the Rust side.

// ---------------------------------------------------------------------------
// Literals.
// ---------------------------------------------------------------------------

export const PROTOCOL_VERSION = "vd/1";
export const PLUGIN_NAME = "veridoc-plugin-ts";
export const PLUGIN_VERSION = "0.1.0";
export const LANGUAGES = ["typescript"] as const;

export const CAPABILITIES = [
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

export const METHODS = [
  "handshake",
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
  "collect-result": {
    properties: [
      "concepts",
      "documents",
      "claims",
      "observables",
      "actions",
      "fixtures",
      "skipped",
    ],
    required: [
      "concepts",
      "documents",
      "claims",
      "observables",
      "actions",
      "fixtures",
      "skipped",
    ],
  },
  "raw-claim": {
    properties: [
      "kind",
      "subject",
      "concept",
      "predicate",
      "text",
      "channel",
      "supports",
      "file",
      "line",
    ],
    required: [
      "kind",
      "subject",
      "concept",
      "predicate",
      "text",
      "channel",
      "supports",
      "file",
      "line",
    ],
  },
  channel: {
    properties: ["scenario", "asserts", "artefact", "citation"],
    required: [],
  },
  "document-decl": {
    properties: ["path", "audience", "question", "selects", "notApplicable"],
    required: ["path", "audience", "question", "selects"],
  },
  "observable-decl": {
    properties: ["name", "type"],
    required: ["name", "type"],
  },
  "action-decl": {
    properties: ["name", "calls", "produces"],
    required: ["name", "calls", "produces"],
  },
  selects: {
    properties: ["concept", "kind", "referent", "claims"],
    required: [],
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
    properties: ["scenarioId", "fixture", "action", "args", "deadlineMs", "leaves"],
    required: ["scenarioId", "fixture", "action", "args", "deadlineMs", "leaves"],
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
  scenario?: string | null;
  asserts?: Asserts | null;
  artefact?: Artefact | null;
  citation?: Citation | null;
}

export interface Selects {
  concept?: string | null;
  kind?: Kind[] | null;
  referent?: string | null;
  claims?: string[] | null;
}

export interface DocumentDecl {
  path: string;
  audience: string;
  question: string;
  selects: Selects;
  notApplicable?: string | null;
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

export interface Skipped {
  file: string;
  reason: string;
}

export interface RawClaim {
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

export interface CollectResult {
  concepts: string[];
  documents: DocumentDecl[];
  claims: RawClaim[];
  observables: ObservableDecl[];
  actions: ActionDecl[];
  fixtures: string[];
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

export interface RunRequest {
  scenarioId: string;
  fixture: string;
  action: string;
  args: string[];
  deadlineMs: number;
  leaves: { leafId: string }[];
}

export interface Observed {
  observable: string;
  value: string;
}

export interface LeafAnswer {
  leafId: string;
  ok: boolean;
}

export interface RunFailure {
  kind: RunFailureKind;
  detail: string;
}

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
