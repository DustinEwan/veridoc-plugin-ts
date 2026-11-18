// The names and identities the plugin computes, mirroring the engine's `hash` module so the
// two sides cannot disagree about what a claim is called. `referentId` is
// `"veridoc:referent:" + hex12(sha256(rootRelativePosixPath + "\u{0}" + exportedName))`; the signature is
// excluded on purpose, so a signature edit cannot move a claim's identity. The referent id is
// the resolve key and the reporting value, never an input to a claim's name — the subject is
// named by the author, not derived from the path the code sits in
// (`veridoc/docs/decisions/0009-the-subject-is-named-not-derived-from-a-path.md`).
//
// A claim's identity is `"c" + hex16(sha256(subject_name + "\u{0}" + predicate))`: a value,
// printed nowhere except as a collision suffix. Its name is `<subject>#<slug>`, where `<subject>`
// is the author's subject name — `name` for a symbol and a concept alike, the engine's
// `RefToken::subject_name` (`veridoc-protocol/src/contract.rs`) — and `<slug>` is the predicate
// lower-cased, split on every non-alphanumeric character, empty pieces dropped, the words
// joined by `-`, kept to the last whole word that still fits in 48 characters. Over one
// collected project, every claim whose name another claim also produces gets
// `claimSuffix(identity)` — `~` plus characters 1 through 6 of the identity hex — appended;
// a claim whose name is unique keeps the bare name.

import { createHash } from "node:crypto";

const NUL = "\u{0}";

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function referentId(rootRelativePosixPath: string, exportedName: string): string {
  return `veridoc:referent:${sha256Hex(rootRelativePosixPath + NUL + exportedName).slice(0, 12)}`;
}

/** The identity value behind a name: `c + hex16(sha256(subject + "\u{0}" + predicate))`, where
 * `subject` is the author's subject name (`veridoc-engine/src/hash.rs::claim_identity`). */
export function claimIdentity(subjectName: string, predicate: string): string {
  return `c${sha256Hex(subjectName + NUL + predicate).slice(0, 16)}`;
}

/** The name a reader reads and types: `<subject>#<slug>`, built from the identity's inputs
 * (`veridoc-engine/src/hash.rs::claim_name`). */
export function claimName(subjectName: string, predicate: string): string {
  return `${subjectName}#${slug(predicate)}`;
}

/** The identity shortened to separate two claims whose names slug alike. */
export function claimSuffix(identity: string): string {
  return `~${identity.slice(1, 7)}`;
}

export interface ClaimNameSource {
  /** The author's subject name: `subject.name` for a symbol and a concept alike. */
  subjectName: string;
  predicate: string;
}

/**
 * The names of the claims of one collected project, in the given order, with the collision
 * pass applied: every claim whose name another claim in the same project also produces gets
 * its suffix appended, and a claim whose name is unique keeps the bare name. Callers pass
 * only claims whose subject resolved, exactly as the engine names what it bound.
 */
export function claimNames(claims: readonly ClaimNameSource[]): string[] {
  const names = claims.map((claim) => claimName(claim.subjectName, claim.predicate));
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return names.map((name, i) =>
    (counts.get(name) ?? 0) > 1
      ? name + claimSuffix(claimIdentity(claims[i].subjectName, claims[i].predicate))
      : name,
  );
}

/** The longest predicate slug a name carries before it is cut at a word boundary. */
const MAX_SLUG = 48;

/**
 * Lower-case alphanumeric runs joined by `-`, cut at the last whole word that fits in
 * `MAX_SLUG`. Length is counted in UTF-8 bytes, which is what the engine's Rust counts.
 */
function slug(predicate: string): string {
  const words: string[] = [];
  let length = 0;
  for (const word of predicate.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (word === "") continue;
    const joined = (words.length === 0 ? 0 : length + 1) + Buffer.byteLength(word, "utf8");
    if (joined > MAX_SLUG) break;
    words.push(word);
    length = joined;
  }
  return words.join("-");
}
