// The plugin's per-project state: what `collect` imported, the resolved referents, and the
// live scenario functions the claim modules registered. Everything after `collect` reads this.

import type { RegisteredScenario } from "@veridoc/claims";
import type { DocumentDecl, RawClaim } from "./protocol.js";

export interface CitationStoreConfig {
  name: string;
  kind: string;
  path?: string;
}

export interface VeridocConfig {
  citationStores?: CitationStoreConfig[];
}

export interface Referent {
  referentId: string;
  signature: string;
}

export interface ProjectState {
  root: string;
  config: VeridocConfig;
  /** Claims with project-relative posix `file` and normalized `subject.from`. */
  claims: RawClaim[];
  /** The scenario beside each claim that declares one, keyed by that claim's id. */
  scenarios: Map<string, RegisteredScenario>;
  documents: DocumentDecl[];
  concepts: string[];
  /** Resolve key (`"{from}|{name}"` or `"concept|{name}"`) to the resolved referent. */
  referents: Map<string, Referent>;
}

let current: ProjectState | undefined;

export function setState(state: ProjectState): void {
  current = state;
}

export function getState(): ProjectState {
  if (current === undefined) {
    throw new Error("collect has not run; the plugin knows no project yet");
  }
  return current;
}

/** The claim the engine addresses by id. `collect` named every claim it read once, from the
 * author's own subject and predicate, and the engine uses that name verbatim — so a claim whose
 * referent never resolved is still the claim it was named, and every method that works from a
 * claim looks it up here rather than through the resolved referents. */
export function claimById(claimId: string): RawClaim | undefined {
  return getState().claims.find((claim) => claim.id === claimId);
}
