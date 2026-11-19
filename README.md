# veridoc-plugin-ts

The TypeScript plugin for [veridoc](../veridoc): the stdio JSON-RPC server that reads a
project's claim modules and answers `init`, `collect`, `resolve`, `derivable`, `bivalence`,
`run`, `cite`, and `surface`. `init` is the one method that writes: it creates `index.doc.ts`
and the project's first `.spec.md`, because the host cannot author a file it cannot parse
(`docs/decisions/0015` in the veridoc repository). It is installed, not vendored:

```sh
veridoc install-plugin https://example.invalid/veridoc/veridoc-plugin-ts
```

`install-plugin` runs `npm ci`, then `npm run build`, then drives the conformance suite
against the checkout; a plugin that does not conform is not recorded.

## Packages

- `packages/claims` — the authoring DSL: `claim.ensures` and the other kinds, `ref`,
  `concept`, `equals`, `contains`, `satisfies`, `all`, `any`, `not`. Projects import it as
  `@veridoc/claims`.
- `packages/tree` — the document-tree index DSL, `@veridoc/tree`.
- `packages/plugin-ts` — the server, the gates, and the conformance emitter.

## The three files a project adds

An author who adopts veridoc in TypeScript adds three kinds of file
(`docs/decisions/0006` in the veridoc repository), and this plugin reads the first two:

| File | Holds |
| --- | --- |
| `index.doc.ts` | `concepts` and `documents`, and nothing else |
| `src/<module>.doc.ts` | the claims about that module, each with its scenario |
| `docs/<name>.spec.md` | prose |

TypeScript runs on a host, so there is nothing to build: `collect` imports every `*.doc.ts`
into the plugin's own process and lists the claims they registered, and `run` executes the
scenario a claim registered. The plugin finds those modules by walking the project from its
root — the directory `npm` names — skipping `node_modules`, `dist`, `out`, `target`, and the
tool's own `.veridoc`; there is no `sourceRoots` for an author to keep correct.

## The scenario belongs to the claim

A scenario has no file, no id, and no registry of its own. It is declared inside the claim
that runs it: the world and the call as two plain strings, the names and types of the values
it returns, and the function that produces them.

```ts
claim.ensures({
  subject: ref(scanner.parseConfig),
  concept: "project-scan",
  predicate: "rejects-missing-config",
  text: "parseConfig refuses a directory that holds no config.json.",
  scenario: {
    given: "an empty directory",
    when: "parseConfig against that directory",
    values: { "exit.code": "number", "stderr.text": "string" },
    run: async () => runParseConfig(),
  },
  asserts: all(
    { obs: "exit.code", is: equals(2) },
    { obs: "stderr.text", is: contains("config.json") },
  ),
});
```

`collect` answers those declarations in `scenarios`, keyed by the claim's id —
`<subject>#<predicate-slug>`, named once by `collect` from the author's own words, so it is the
claim's address whether or not its subject ever resolves. `run` is given nothing but that id and
a `timeoutMs`: it executes that claim's scenario and answers `{ ok, observed, satisfied }`.
`observed` names are exactly the names that claim declared, each value JSON-encoded, and
`satisfied` carries one entry for every leaf of that claim's own assertion tree — `equals`,
`contains` and `satisfies` alike — marked `{claim id}#l{n}` over the plugin's pre-order walk,
because the engine numbers them all and sends no marks of its own. A scenario that throws,
outlives the timeout, withholds a declared value, or has no answer for a `satisfies` leaf answers
`ok: false` with a failure naming the claim — never a JSON-RPC error — so the host records that
one claim's result while every other claim keeps its verdict. Two claims that need the same world
call the same function in the same file, which is all the reuse mechanism veridoc adds.

## Example

`examples/scanner` is a real TypeScript project whose documentation builds end to end
against this workspace's server. From the repository root:

```sh
npm ci && npm run build
veridoc check --project examples/scanner
```

## Conformance

From inside this checkout, `veridoc validate-plugin` drives the suite against this
plugin: it reads `veridoc-plugin.json`, runs the build steps, and validates the built
server. It needs nothing beyond the veridoc executable, which
`curl -fsSL https://raw.githubusercontent.com/DustinEwan/veridoc/main/install.sh | sh`
installs. `veridoc install-plugin` drives the same suite before recording, and this
repository's CI installs the executable and runs the command. The suite needs a fixture
project, and this repository renders it: `node packages/plugin-ts/dist/conformance-emitter.js
--out <dir>` writes a complete veridoc project — its source, the three files above, a
citation store, and `veridoc-conformance.json` — that exercises every method the plugin
answers and every rule, including the four spec bivalence negatives.
`packages/plugin-ts/test/conformance.test.mjs` renders it, collects it, and runs its scenario
in-process; the Rust suite in the veridoc repository drives it over the wire.

## Tests

```sh
npm test   # builds, then the protocol contract test, the claim-name test, the bivalence test, and the emitter test
```

`docs/schema/veridoc-1/` is a copy of the committed protocol schemas; the contract test compares
every TypeScript literal against it. Refresh the copy when the veridoc repository regenerates
the schemas.
