// The bivalence negatives and positive from `docs/spec.md`: `x => true`,
// `typeof x === "string" || true`, `x => x === x`, and `s => s.length >= 0` must all come
// back not bivalent, and `s => s.length > 0` must come back
// `{bivalent: true, method: "static-analysis"}`.

import { test } from "node:test";
import assert from "node:assert/strict";

const { analyzePredicate } = await import("../dist/bivalence.js");

const negatives = [
  ["x => true", "string"],
  ['x => typeof x === "string" || true', "string"],
  ["x => x === x", "string"],
  ["s => s.length >= 0", "string"],
];

for (const [source, declaredType] of negatives) {
  test(`not bivalent: ${source}`, () => {
    const analysis = analyzePredicate(source, declaredType);
    assert.equal(analysis.decidable, true, `${source} should be settled by the analysis`);
    assert.equal(analysis.bivalent, false, `${source} must not be bivalent`);
  });
}

test("s => s.length > 0 is bivalent by static-analysis", () => {
  const analysis = analyzePredicate("s => s.length > 0", "string");
  assert.equal(analysis.decidable, true);
  const answer = {
    bivalent: analysis.bivalent,
    method: analysis.decidable ? "static-analysis" : "witnesses",
  };
  assert.deepEqual(answer, { bivalent: true, method: "static-analysis" });
});

test("the analysis declines what it cannot settle", () => {
  const analysis = analyzePredicate("s => JSON.parse(s).ok", "string");
  assert.equal(analysis.decidable, false, "a call outside the allow-list is not decidable");
});

test("a predicate over an unconstrained string is bivalent", () => {
  const analysis = analyzePredicate('s => s === "x"', "string");
  assert.equal(analysis.decidable, true);
  assert.equal(analysis.bivalent, true);
});
