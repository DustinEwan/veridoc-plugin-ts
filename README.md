# veridoc-plugin-ts

The TypeScript plugin for [veridoc](../veridoc): the stdio JSON-RPC server that reads a
project's claim sidecars and answers `collect`, `resolve`, `derivable`, `bivalence`, `run`,
`cite`, and `surface`. It is installed, not vendored:

```sh
veridoc install-plugin https://example.invalid/veridoc/veridoc-plugin-ts
```

`install-plugin` runs `npm ci`, then `npm run build`, then drives the conformance suite
against the checkout; a plugin that does not conform is not recorded.

## Packages

- `packages/claims` — the authoring DSL: `claim.ensures`, `satisfies`, `observable`,
  `action`, `fixture`. Projects import it as `@veridoc/claims`.
- `packages/tree` — the document-tree index DSL, `@veridoc/tree`.
- `packages/plugin-ts` — the server, the gates, and the conformance emitter.

## Conformance

`veridoc validate-plugin --name veridoc-plugin-ts` re-drives the suite against the installed
checkout. The suite needs a fixture project, and this repository renders it:
`node packages/plugin-ts/dist/conformance-emitter.js --out <dir>` writes a complete veridoc
project — source, sidecars, vocabulary, citation store, and `veridoc-conformance.json` — that
exercises every rule, including the four spec bivalence negatives. `packages/plugin-ts/test/
conformance.test.mjs` renders it and collects it in-process; the Rust suite in the veridoc
repository drives it over the wire.

## Tests

```sh
npm test   # builds, then the protocol contract test, the bivalence test, and the emitter test
```

`docs/schema/vd-1/` is a copy of the committed protocol schemas; the contract test compares
every TypeScript literal against it. The veridoc repository's `xtask` schema-drift test keeps
that copy honest.
