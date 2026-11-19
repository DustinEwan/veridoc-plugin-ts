// `run` in isolation: it answers the run — every value the claim declared and every leaf of
// the claim's own assertion tree, marked `{claim id}#l{n}` over the plugin's pre-order walk.
// Everything that stops a scenario from answering is that one claim's failure, never a
// JSON-RPC error: a throw, a missed deadline, a value the claim declared and the scenario
// withheld, or a `satisfies` leaf the scenario has no predicate to answer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const collectModule = await import("../dist/collect.js");
const runModule = await import("../dist/run.js");

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const CLAIM_ID = "work#answers-one-value";

/** A project of one claim module whose scenario body the case supplies; the authoring package
 * resolves through a link into this checkout, as the emitter links the fixture it renders. */
async function project(runBody, asserts) {
  const root = mkdtempSync(path.join(tmpdir(), "veridoc-run-"));
  const link = path.join(root, "node_modules", "@veridoc", "claims");
  mkdirSync(path.dirname(link), { recursive: true });
  symlinkSync(path.join(repoRoot, "packages", "claims"), link, "dir");
  writeFileSync(path.join(root, "worker.ts"), "export function work(): number {\n  return 2;\n}\n");
  writeFileSync(
    path.join(root, "one.doc.ts"),
    [
      'import { all, claim, equals, ref, satisfies } from "@veridoc/claims";',
      'import * as worker from "./worker.ts";',
      "",
      "claim.ensures({",
      "  subject: ref(worker.work),",
      '  concept: "work",',
      '  predicate: "answers-one-value",',
      '  text: "work answers one value.",',
      "  scenario: {",
      '    given: "nothing at all",',
      '    when: "work",',
      '    values: { answer: "number" },',
      runBody,
      "  },",
      asserts === undefined ? "});" : `  ${asserts}\n});`,
      "",
    ].join("\n"),
  );
  await collectModule.collect(root);
  return root;
}

const cases = [
  {
    name: "answers the values the claim declared",
    run: "    run: async () => ({ answer: 2 }),",
    timeoutMs: 1000,
    answers: { ok: true, observed: [{ observable: "answer", value: "2" }], satisfied: [] },
  },
  {
    name: "answers a satisfies leaf false when its predicate fails the value",
    run: "    run: async () => ({ answer: 2 }),",
    asserts: '  asserts: { obs: "answer", is: satisfies((a: unknown) => a === 3) },',
    timeoutMs: 1000,
    answers: {
      ok: true,
      observed: [{ observable: "answer", value: "2" }],
      satisfied: [{ leafId: `${CLAIM_ID}#l0`, ok: false }],
    },
  },
  {
    name: "numbers every leaf of the tree, not only the ones it decides",
    run: "    run: async () => ({ answer: 2 }),",
    asserts:
      '  asserts: all({ obs: "answer", is: equals(3) }, { obs: "answer", is: satisfies((a: unknown) => a === 2) }),',
    timeoutMs: 1000,
    answers: {
      ok: true,
      observed: [{ observable: "answer", value: "2" }],
      satisfied: [
        { leafId: `${CLAIM_ID}#l0`, ok: false },
        { leafId: `${CLAIM_ID}#l1`, ok: true },
      ],
    },
  },
  {
    name: "fails a scenario that throws",
    run: '    run: async () => { throw new Error("the world would not start"); },',
    timeoutMs: 1000,
    failed: {
      kind: "plugin",
      detail: "claim work#answers-one-value: the scenario could not run: the world would not start",
    },
  },
  {
    name: "fails a scenario that outlives its wait",
    run: "    run: async () => {\n      await new Promise((done) => setTimeout(done, 250));\n      return { answer: 2 };\n    },",
    timeoutMs: 5,
    failed: { kind: "deadline", detail: "claim work#answers-one-value: the scenario outlived 5 ms" },
  },
  {
    name: "fails a declared value the scenario withheld",
    run: "    run: async () => ({}),",
    timeoutMs: 1000,
    failed: {
      kind: "plugin",
      detail: "claim work#answers-one-value: the scenario returned no value for answer",
    },
  },
  {
    name: "fails a satisfies leaf the scenario has no answer for",
    run: "    run: async () => ({ answer: 2 }),",
    asserts: '  asserts: { obs: "answer", is: { satisfies: { source: "(a) => a === 2" } } },',
    timeoutMs: 1000,
    failed: {
      kind: "plugin",
      detail: `claim ${CLAIM_ID}: no answer for the satisfies leaf ${CLAIM_ID}#l0 on answer`,
    },
  },
  {
    name: "fails a value the claim never declared",
    run: "    run: async () => ({ answer: 2, unasked: 3 }),",
    timeoutMs: 1000,
    failed: {
      kind: "plugin",
      detail:
        "claim work#answers-one-value: the scenario returned unasked, which the claim does not declare",
    },
  },
  {
    name: "fails a claim with no scenario beside it",
    run: "    run: async () => ({ answer: 2 }),",
    timeoutMs: 1000,
    claim: "work#no-such-claim",
    failed: {
      kind: "plugin",
      detail: "claim work#no-such-claim: no scenario is declared beside this claim",
    },
  },
];

for (const testCase of cases) {
  test(`run ${testCase.name}`, async () => {
    const root = await project(testCase.run, testCase.asserts);
    try {
      const answer = await runModule.run({
        claim: testCase.claim ?? CLAIM_ID,
        timeoutMs: testCase.timeoutMs,
      });
      if (testCase.answers !== undefined) {
        assert.deepEqual(answer, testCase.answers);
        return;
      }
      assert.equal(answer.ok, false);
      assert.deepEqual(answer.observed, []);
      assert.deepEqual(answer.satisfied, []);
      assert.deepEqual(answer.failure, testCase.failed);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
