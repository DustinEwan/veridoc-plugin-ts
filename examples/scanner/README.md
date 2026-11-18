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

The committed config names no `judge`, and this example cannot be checked without one:
`parseConfig#exit-code-2-decision` carries a citation, the plugin resolves that citation, and
whether the cited text supports the claim is a model's judgement. `veridoc check` with no judge
therefore exits 2 and names that claim, rather than reporting a residue of zero for a stage that
never ran. To run it, add a `judge` block naming `provider` and `model`, plus `baseUrl` for a
server that serves the OpenAI wire elsewhere; the credential comes from the variable `apiKeyEnv`
names. The engine calls the model itself, so there is no judge program to write.

## The document grammar

`docs/architecture.spec.md` is markdown annotated with `doc-` elements. A section opens
with a `<doc-section name="SUBJECT">` alone on its line and runs to the next opener or the
end of the file; a heading inside it is plain prose and means nothing to the engine. A
`<doc-claim name="PREDICATE"/>` written inside a sentence names one claim, and the claim it
names is `SUBJECT#PREDICATE` — the readable name the build prints, so here
`parseConfig#rejects-missing-config`. The subject half is the author's own name for the thing
the claim is about: `parseConfig`, the name `ref(scanner.parseConfig)` carries, and not the
path the code sits in, so renaming `src/scanner.ts` moves no claim name and orphans no
verdict. A reference that names no claim stops the build, and so does a claim no section
names; a section that names no claim, like `working`, is only a warning. Nothing inside a
fenced code block opens a section or names a claim, so a document may quote this grammar.
