// Checks every literal the TypeScript side publishes against the committed
// `docs/schema/veridoc-1/*.json`, so the TypeScript side cannot drift from the Rust side.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const protocol = await import("../dist/protocol.js");

const schemaDir = new URL("../../../docs/schema/veridoc-1/", import.meta.url);

function schema(name) {
  return JSON.parse(readFileSync(new URL(`${name}.json`, schemaDir), "utf8"));
}

test("handshake literals match the contract", () => {
  assert.equal(protocol.PROTOCOL_VERSION, "veridoc/1");
  assert.equal(protocol.PLUGIN_NAME, "veridoc-plugin-ts");
  assert.equal(protocol.PLUGIN_VERSION, "0.1.0");
  assert.deepEqual([...protocol.LANGUAGES], ["typescript"]);
  const handshake = schema("handshake");
  assert.deepEqual(
    [...protocol.FIELDS.handshake.properties].sort(),
    [...Object.keys(handshake.properties)].sort(),
  );
  assert.deepEqual(
    [...protocol.FIELDS.handshake.required].sort(),
    [...handshake.required].sort(),
  );
});

test("the capability list matches the committed enum", () => {
  assert.deepEqual(
    [...protocol.CAPABILITIES],
    schema("capability").enum,
    "capabilities must equal docs/schema/veridoc-1/capability.json",
  );
});

test("the claim kinds match the committed enum", () => {
  assert.deepEqual([...protocol.KINDS], schema("kind").enum);
});

test("the bivalence methods match the committed enum", () => {
  assert.deepEqual([...protocol.BIVALENCE_METHODS], schema("bivalence-method").enum);
});

test("the run failure kinds match the committed enum", () => {
  assert.deepEqual([...protocol.RUN_FAILURE_KINDS], schema("run-failure-kind").enum);
});

test("the JSON-RPC error codes are the protocol's", () => {
  assert.equal(protocol.ERROR_CODES.parseError, -32700);
  assert.equal(protocol.ERROR_CODES.invalidRequest, -32600);
  assert.equal(protocol.ERROR_CODES.methodNotFound, -32601);
  assert.equal(protocol.ERROR_CODES.pluginError, -32000);
});

test("the method names are the contract's eight", () => {
  assert.deepEqual([...protocol.METHODS], [
    "handshake",
    "collect",
    "resolve",
    "derivable",
    "bivalence",
    "run",
    "cite",
    "surface",
  ]);
});

test("every wire object's fields match its committed schema", () => {
  for (const [name, fields] of Object.entries(protocol.FIELDS)) {
    const committed = schema(name);
    assert.deepEqual(
      [...fields.properties].sort(),
      [...Object.keys(committed.properties)].sort(),
      `${name}.json properties`,
    );
    assert.deepEqual(
      [...fields.required].sort(),
      [...(committed.required ?? [])].sort(),
      `${name}.json required`,
    );
  }
});

test("the Check variants match the committed oneOf", () => {
  const variants = schema("check").oneOf.map((branch) => Object.keys(branch.properties)[0]);
  assert.deepEqual([...protocol.CHECK_VARIANTS], variants);
});

test("the RefToken kinds match the committed oneOf", () => {
  const kinds = schema("ref-token").oneOf.map((branch) => branch.properties.kind.const);
  assert.deepEqual([...protocol.REF_TOKEN_KINDS], kinds);
});

test("the assertion node shapes match the committed anyOf", () => {
  const branches = schema("asserts").anyOf;
  const nodeKeys = branches
    .map((branch) => Object.keys(branch.properties ?? {})[0])
    .filter((key) => key !== undefined);
  assert.deepEqual(nodeKeys, ["all", "any", "not"]);
  const leaf = schema("asserts").$defs.AssertLeaf;
  assert.deepEqual([...Object.keys(leaf.properties)].sort(), ["is", "obs"]);
});

test("the satisfies spec's source/accepts/rejects match", () => {
  const satisfies = schema("satisfies-spec");
  assert.deepEqual([...Object.keys(satisfies.properties)].sort(), [
    "accepts",
    "rejects",
    "source",
  ]);
  assert.deepEqual(satisfies.required, ["source"]);
});
