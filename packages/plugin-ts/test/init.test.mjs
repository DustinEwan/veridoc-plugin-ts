// `init`, checked in-process: the files it reports are on disk, the root document it writes
// collects clean through the plugin's own `collect`, and a file already there is refused by name
// unless `force` says otherwise. The Rust conformance suite drives the same three over the wire;
// this test needs no Rust toolchain, so `npm test` stays self-contained.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const initModule = await import("../dist/init.js");
const collectModule = await import("../dist/collect.js");

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

/** A project that can import the DSL, named after `name` because the directory name is the concept
 * `init` declares. The root document `init` writes imports `@veridoc/tree`, and from a temporary
 * directory only a link into this checkout satisfies that — the same link the conformance emitter
 * puts in the project it renders. */
function project(name) {
  const parent = mkdtempSync(path.join(tmpdir(), "veridoc-init-"));
  const root = path.join(parent, name);
  const scope = path.join(root, "node_modules", "@veridoc");
  mkdirSync(scope, { recursive: true });
  symlinkSync(path.join(repoRoot, "packages", "tree"), path.join(scope, "tree"), "dir");
  symlinkSync(path.join(repoRoot, "packages", "claims"), path.join(scope, "claims"), "dir");
  return root;
}

const DOCUMENT = {
  path: "docs/architecture.spec.md",
  audience: "a developer extending the project",
  question: "What must my next change keep true?",
};

test("init writes the tree the plugin reads", async () => {
  const root = project("scanner");
  try {
    const answer = initModule.init({ root, document: DOCUMENT });
    assert.deepEqual(answer.written, ["index.doc.ts", "docs/architecture.spec.md"]);
    assert.deepEqual(answer.next, [
      'declare the claims in a `*.doc.ts` sidecar, naming the concept "scanner"',
      "add `@veridoc/tree` and `@veridoc/claims` to the project's dependencies",
      "run `veridoc check`",
    ]);
    assert.match(readFileSync(path.join(root, "index.doc.ts"), "utf8"), /from "@veridoc\/tree"/);

    const collected = await collectModule.collect(root);
    assert.deepEqual(collected.skipped, [], "the root document must import cleanly");
    assert.deepEqual(collected.concepts, ["scanner"]);
    assert.deepEqual(collected.documents, [DOCUMENT]);
  } finally {
    await rm(path.dirname(root), { recursive: true, force: true });
  }
});

test("a project that installs the DSL is not told to install it", async () => {
  const root = project("installed");
  try {
    writeFileSync(
      path.join(root, "package.json"),
      `${JSON.stringify({ dependencies: { "@veridoc/tree": "*" } }, null, 2)}\n`,
    );
    const answer = initModule.init({ root, document: DOCUMENT });
    assert.deepEqual(answer.next, [
      'declare the claims in a `*.doc.ts` sidecar, naming the concept "installed"',
      "run `veridoc check`",
    ]);
  } finally {
    await rm(path.dirname(root), { recursive: true, force: true });
  }
});

test("init refuses a file it would replace, and force replaces it", async () => {
  const root = project("refuses");
  try {
    initModule.init({ root, document: DOCUMENT });
    const prose = path.join(root, "docs", "architecture.spec.md");
    writeFileSync(prose, "the author's own prose\n");

    let refused = "";
    assert.throws(
      () => initModule.init({ root, document: DOCUMENT }),
      (error) => {
        refused = error.message;
        return true;
      },
    );
    assert.equal(refused, `${path.join(root, "index.doc.ts")} exists; pass force to replace it`);
    assert.equal(readFileSync(prose, "utf8"), "the author's own prose\n");

    initModule.init({ root, document: DOCUMENT, force: true });
    assert.match(readFileSync(prose, "utf8"), /What must my next change keep true\?/);
  } finally {
    await rm(path.dirname(root), { recursive: true, force: true });
  }
});

test("init refuses a request whose document leaves the project, and writes nothing", async () => {
  const root = project("escapes");
  try {
    assert.throws(
      () => initModule.init({ root, document: { ...DOCUMENT, path: "../outside.spec.md" } }),
      /must stay inside the project/,
    );
    assert.throws(() => initModule.init({ root: "", document: DOCUMENT }), /needs the project root/);
    assert.throws(
      () => initModule.init({ root, document: { ...DOCUMENT, path: "" } }),
      /needs the document's `\.spec\.md` path/,
    );
    assert.deepEqual(
      readdirSync(root).filter((name) => name !== "node_modules"),
      [],
      "a refused init writes no file",
    );
  } finally {
    await rm(path.dirname(root), { recursive: true, force: true });
  }
});
