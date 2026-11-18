// The claim naming rule, checked against the engine's `hash::claim_name` and
// `hash::claim_identity`: a claim is named `<subject>#<slug>`, where `<subject>` is the author's
// subject name — `RefToken::subject_name`, the name of the symbol or of the concept — and `<slug>`
// is the predicate lower-cased, split on non-alphanumerics, joined by `-`, cut at the last whole
// word that fits in 48 characters. The identity hashed behind that name is
// `c + hex16(sha256(subject + "\u{0}" + predicate))`, so it is the subject name and the predicate
// that go in and the referent id nowhere. Renaming the file that holds the code moves the referent
// id and leaves the name, the identity, and every verdict on them alone
// (`veridoc/docs/decisions/0009-the-subject-is-named-not-derived-from-a-path.md`). Two claims of
// one project whose names slug alike each carry `~` plus characters 1 through 6 of their identity;
// a unique name stays bare.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const { claimName, claimNames, claimIdentity } = await import("../dist/ids.js");

/** The engine's rule, recomputed here so a change to either side shows up as a failure. */
function engineIdentity(subject, predicate) {
  const digest = createHash("sha256").update(`${subject}\u{0}${predicate}`, "utf8").digest("hex");
  return `c${digest.slice(0, 16)}`;
}

test("a claim is named after its subject and predicate slug", () => {
  assert.equal(
    claimName("parseConfig", "rejects-missing-config"),
    "parseConfig#rejects-missing-config",
  );
  assert.equal(claimName("graceful-degradation", "falls-back-to-defaults"),
    "graceful-degradation#falls-back-to-defaults");
});

test("the identity hashes the subject name and the predicate, in that order", () => {
  for (const [subject, predicate] of [
    ["parseConfig", "rejects-missing-config"],
    ["graceful-degradation", "falls back to: the defaults!"],
  ]) {
    assert.equal(claimIdentity(subject, predicate), engineIdentity(subject, predicate));
  }
});

test("case and punctuation do not move the slug", () => {
  const bare = claimName("probe", "rejects-missing-project-root");
  const restyled = claimName("probe", "Rejects:  Missing_Project ROOT!");
  assert.equal(restyled, "probe#rejects-missing-project-root");
  assert.equal(restyled, bare);
});

test("predicates that slug alike get two different suffixed names", () => {
  const claims = [
    { subjectName: "probe", predicate: "rejects-missing-project-root" },
    { subjectName: "probe", predicate: "Rejects Missing Project Root" },
    { subjectName: "probe", predicate: "accepts-a-project-root" },
  ];
  const names = claimNames(claims);
  const [first, second, unique] = names;

  assert.match(first, /^probe#rejects-missing-project-root~[0-9a-f]{6}$/);
  assert.match(second, /^probe#rejects-missing-project-root~[0-9a-f]{6}$/);
  assert.notEqual(first, second, "two claims that slug alike must not share a name");
  assert.equal(
    first,
    `probe#rejects-missing-project-root~${claimIdentity(claims[0].subjectName, claims[0].predicate).slice(1, 7)}`,
  );
  assert.equal(unique, "probe#accepts-a-project-root", "a unique name keeps no suffix");
});
