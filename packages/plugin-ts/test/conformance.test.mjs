// The emitter contract, checked in-process: the rendered project imports cleanly through
// the plugin's own `collect`, reports the six claims the manifest names with a scenario beside
// each one, answers the five bivalence probes as the manifest predicts, and runs the fixture's
// scenario for the claim id alone, answering `ok`/`observed`/`satisfied` in the shape the
// engine parses. The Rust conformance suite drives the same fixture over the wire; this test
// runs the same assertions without a Rust toolchain, so `npm test` in this repository is
// self-contained.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const emitter = await import("../dist/conformance-emitter.js");
const collectModule = await import("../dist/collect.js");
const bivalence = await import("../dist/bivalence.js");
const runModule = await import("../dist/run.js");
const stateModule = await import("../dist/state.js");
const { claimName } = await import("../dist/ids.js");

const PROBES = [
  { predicate: "always-true", bivalent: false, method: "static-analysis" },
  { predicate: "or-true", bivalent: false, method: "static-analysis" },
  { predicate: "self-equal", bivalent: false, method: "static-analysis" },
  { predicate: "length-nonneg", bivalent: false, method: "static-analysis" },
  { predicate: "length-positive", bivalent: true, method: "static-analysis" },
];

test("the rendered fixture collects clean and answers every probe", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "veridoc-emitter-"));
  const root = emitter.render(dir);
  try {
    const result = await collectModule.collect(root);
    assert.deepEqual(result.skipped, [], "every claim module must import cleanly");
    assert.equal(result.claims.length, 6, "one scenario claim and five probes");
    assert.deepEqual(result.concepts, ["probe-scan"]);
    assert.equal(result.documents.length, 1);

    // Every claim declares its scenario beside itself, so every claim has an entry keyed by
    // its own id and none of them carries a scenario slug of its own.
    const ids = result.claims.map((claim) => claim.id);
    assert.deepEqual(Object.keys(result.scenarios).sort(), [...ids].sort());
    const claimId = claimName("probe", "rejects-missing-project-root");
    const scenario = result.scenarios[claimId];
    assert.deepEqual(scenario.values, [
      { name: "exit.code", type: "number" },
      { name: "stderr.text", type: "string" },
    ]);
    assert.equal(typeof scenario.given, "string");
    assert.equal(typeof scenario.when, "string");

    // The manifest's `values` are exactly the names that scenario declares.
    const manifest = JSON.parse(
      await readFile(path.join(root, "veridoc-conformance.json"), "utf8"),
    );
    assert.deepEqual(
      manifest.values,
      scenario.values.map((value) => value.name),
      "the manifest's values are the scenario's declared names",
    );

    for (const expect of PROBES) {
      const claim = result.claims.find((c) => c.predicate === expect.predicate);
      assert.ok(claim, `the fixture declares the probe ${expect.predicate}`);
      const answer = bivalence.bivalenceFor(claim, claim.id);
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

test("bivalence answers a claim whose referent never resolved", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "veridoc-emitter-"));
  const root = emitter.render(dir);
  try {
    const result = await collectModule.collect(root);
    // Nothing was resolved: `resolve` never ran on this project. The answer is read from the
    // claim's own assertion tree and its own scenario, so an unbound subject is still a claim
    // with a bivalence to give, addressed by the id `collect` gave it.
    const claim = result.claims.find((c) => c.predicate === "length-positive");
    assert.ok(claim, "the fixture declares the positive probe");
    assert.deepEqual(stateModule.claimById(claim.id), claim);
    assert.deepEqual(bivalence.bivalenceFor(claim, claim.id), {
      bivalent: true,
      method: "static-analysis",
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("run answers ok, observed, and satisfied for the claim it is given", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "veridoc-emitter-"));
  const root = emitter.render(dir);
  try {
    await collectModule.collect(root);
    const claim = claimName("probe", "rejects-missing-project-root");
    const answer = await runModule.run({ claim, timeoutMs: 10_000 });
    assert.equal(answer.ok, true);
    assert.deepEqual(answer.observed, [
      { observable: "exit.code", value: "2" },
      { observable: "stderr.text", value: answer.observed[1].value },
    ]);
    assert.match(answer.observed[1].value, /config\.json/);
    // The claim's two leaves, in the plugin's own pre-order walk: `equals` over the exit code
    // and `contains` over the diagnostic, each decided from the values the scenario answered.
    assert.deepEqual(answer.satisfied, [
      { leafId: `${claim}#l0`, ok: true },
      { leafId: `${claim}#l1`, ok: true },
    ]);

    // A claim with no scenario, or none at all, is one claim's failure that names the
    // claim — never a JSON-RPC error.
    const missing = await runModule.run({ claim: "probe#no-such-claim", timeoutMs: 1000 });
    assert.deepEqual(missing, {
      ok: false,
      observed: [],
      satisfied: [],
      failure: {
        kind: "plugin",
        detail: "claim probe#no-such-claim: no scenario is declared beside this claim",
      },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
