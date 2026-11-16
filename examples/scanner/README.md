# scanner: the veridoc example project

A small TypeScript project whose documentation is proved by the build: one scenario,
an artefact claim on a byte-pinned fixture, and a citation claim on a session log.

## Setup

The example lives in the plugin repository, so its `.veridoc/config.json` names
`plugin.command` as this workspace's own built server, and the sidecars import
`@veridoc/claims` and `@veridoc/tree` from the workspace root's `node_modules`:

```sh
npm ci          # at the repository root
npm run build   # compiles packages/plugin-ts/dist/server.js
```

A project outside this repository installs the plugin instead
(`veridoc install-plugin <git-url>`) and names it with `plugin.name`.

## Run

```sh
veridoc check --project .
```

Exit 0 means every claim passed its gate or its judge, the scenario ran, and the
coverage figure met `coverage.required`. The rendered documentation lands in
`.veridoc/out/`.

The judge here is `tools/scripted-judge.mjs`, a fixture that answers the pinned brief
hashes deterministically; a real project sets `judge.transport` to `"anthropic"` or
points `"command"` at its own model runner.
