// The plugin's per-project state: what `collect` imported, the resolved referents, and the
// live runners the registry holds. Everything after `collect` reads this.

import type { ActionEntry, FixtureEntry, ObservableDecl } from "@veridoc/claims";
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
  observables: ObservableDecl[];
  actions: ActionEntry[];
  fixtures: FixtureEntry[];
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
