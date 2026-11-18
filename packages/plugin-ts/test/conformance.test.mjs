// The emitter contract, checked in-process: the rendered project imports cleanly through
// the plugin's own `collect`, reports the six claims the manifest names, and answers the
// five bivalence probes as the manifest predicts. The Rust conformance suite drives the
// same fixture over the wire; this test runs the same assertions without a Rust
// toolchain, so `npm test` in this repository is self-contained.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const emitter = await import("../dist/conformance-emitter.js");
const collectModule = await import("../dist/collect.js");
const bivalence = await import("../dist/bivalence.js");

test("the rendered fixture collects clean and answers every probe", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "veridoc-emitter-"));
  const root = emitter.render(dir);
  try {
    const result = await collectModule.collect(root);
    assert.deepEqual(result.skipped, [], "every sidecar must import cleanly");
    assert.equal(result.claims.length, 6, "one scenario claim and five probes");
    assert.deepEqual(result.fixtures, ["empty-directory"]);
    assert.deepEqual(
      result.actions.map((a) => a.name),
      ["run-probe"],
    );
    assert.deepEqual(result.concepts, ["probe-scan"]);
    assert.equal(result.documents.length, 1);

    const expects = [
      { predicate: "always-true", bivalent: false, method: "static-analysis" },
      { predicate: "or-true", bivalent: false, method: "static-analysis" },
      { predicate: "self-equal", bivalent: false, method: "static-analysis" },
      { predicate: "length-nonneg", bivalent: false, method: "static-analysis" },
      { predicate: "length-positive", bivalent: true, method: "static-analysis" },
    ];
    for (const expect of expects) {
      const claim = result.claims.find((c) => c.predicate === expect.predicate);
      assert.ok(claim, `the fixture declares the probe ${expect.predicate}`);
      const answer = bivalence.bivalenceFor(claim);
      assert.equal(
        answer.bivalent,
        expect.bivalent,
        `probe ${expect.predicate}: bivalent must be ${expect.bivalent}, got ${JSON.stringify(answer)}`,
      );
      assert.equal(answer.method, expect.method, `probe ${expect.predicate}: method`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
