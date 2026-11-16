// The identity hashes the plugin computes. `referentId` is
// `"vd:r:" + hex12(sha256(rootRelativePosixPath + "\u{0}" + exportedName))`; the signature is
// excluded on purpose, so a signature edit cannot move a claim's identity. `claimId` mirrors
// the engine's `c + hex16(sha256(referent_id + "\u{0}" + predicate))`.

import { createHash } from "node:crypto";

const NUL = "\u{0}";

export function referentId(rootRelativePosixPath: string, exportedName: string): string {
  const digest = createHash("sha256")
    .update(rootRelativePosixPath + NUL + exportedName, "utf8")
    .digest("hex");
  return `vd:r:${digest.slice(0, 12)}`;
}

export function claimId(referent: string, predicate: string): string {
  const digest = createHash("sha256")
    .update(referent + NUL + predicate, "utf8")
    .digest("hex");
  return `c${digest.slice(0, 16)}`;
}
