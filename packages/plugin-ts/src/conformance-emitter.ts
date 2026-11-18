// The conformance emitter contract: `<emitter> --out <dir>` renders an entire veridoc
// project — source, claim sidecars, the observation vocabulary, the document index, one
// working scenario, a citation store, and the five bivalence probes — plus the
// `veridoc-conformance.json` that names them, and prints the directory it rendered.
//
// The rendered project is the only project validation ever drives this plugin: the Rust
// suite in the veridoc repository collects, resolves, gates, runs, cites, and surfaces
// against it. The authoring packages are resolved through `node_modules` symlinks into
// this repository, so the fixture imports exactly the DSL the installed checkout built.

import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The subject the fixture's claims carry: the name `ref(probe.probe)` gives the symbol, which
 * is what a `<doc-section name="…">` must repeat to name them — the author's subject name, never
 * a path-derived referent id (`veridoc/docs/decisions/0009-the-subject-is-named-not-derived-from-a-path.md`). */
const SUBJECT = "probe";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const MANIFEST = {
  scenarioClaim: "rejects-missing-project-root",
  scenarioId: "probe/refuses-missing-root",
  fixture: "empty-directory",
  action: "run-probe",
  observables: ["exit.code", "stderr.text"],
  citationStore: "session",
  citationId: "conformance",
  citationTurn: 1,
  bivalence: [
    { predicate: "always-true", bivalent: false, method: "static-analysis" },
    { predicate: "or-true", bivalent: false, method: "static-analysis" },
    { predicate: "self-equal", bivalent: false, method: "static-analysis" },
    { predicate: "length-nonneg", bivalent: false, method: "static-analysis" },
    { predicate: "length-positive", bivalent: true, method: "static-analysis" },
  ],
};

const PROJECT_PACKAGE = {
  name: "veridoc-conformance-fixture",
  private: true,
  type: "module",
};

const CONFIG = {
  citationStores: [{ name: "session", kind: "file", path: ".veridoc/citations" }],
};

const CITATION =
  '{"turn": 1, "text": "The conformance fixture reserves exit code 2 for refusing a missing config.", "state": "done"}\n';

const PROBE_TS = `// The fixture's subject: it refuses a directory that holds no config.json and never
// guesses a root.

import { existsSync } from "node:fs";
import path from "node:path";

export class ConfigProblem extends Error {
  exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.name = "ConfigProblem";
    this.exitCode = exitCode;
  }
}

/** Read \`config.json\` from \`dir\`. A directory without one is refused with exit code 2
 * and a message naming the missing file. */
export function probe(dir: string): { root: string } {
  const root = path.resolve(dir);
  const file = path.join(root, "config.json");
  if (!existsSync(file)) {
    throw new ConfigProblem(
      \`no config.json found in \${root}; probe refuses to guess a root\`,
      2,
    );
  }
  return { root };
}
`;

const PROBE_DOC_TS = `// The fixture's claims: one scenario claim and the five bivalence probes. The probes
// carry the spec's four negatives and one positive as \`satisfies\` leaves; the plugin's
// static analysis must settle every one of them.

import { all, claim, contains, equals, ref, satisfies, scenario } from "@veridoc/claims";
import * as probe from "./probe.ts";

claim.ensures({
  subject: ref(probe.probe),
  concept: "probe-scan",
  predicate: "rejects-missing-project-root",
  text: "probe refuses a directory that holds no config.json: the run exits with code 2 and the diagnostic names the missing file.",
  scenario: scenario("probe/refuses-missing-root"),
  asserts: all(
    { obs: "exit.code", is: equals(2) },
    { obs: "stderr.text", is: contains("config.json") },
  ),
});

claim.ensures({
  subject: ref(probe.probe),
  concept: "probe-scan",
  predicate: "always-true",
  text: "The always-true probe predicate holds of every exit code, so it divides no pair of outcomes.",
  scenario: scenario("probe/refuses-missing-root"),
  asserts: { obs: "exit.code", is: satisfies((x: unknown) => true) },
});

claim.ensures({
  subject: ref(probe.probe),
  concept: "probe-scan",
  predicate: "or-true",
  text: "The disjunction probe predicate ends in true, so it holds of every exit code as well.",
  scenario: scenario("probe/refuses-missing-root"),
  asserts: {
    obs: "exit.code",
    is: satisfies((x: unknown) => typeof x === "string" || true),
  },
});

claim.ensures({
  subject: ref(probe.probe),
  concept: "probe-scan",
  predicate: "self-equal",
  text: "The self-equality probe predicate compares a value to itself, so no value can fail it.",
  scenario: scenario("probe/refuses-missing-root"),
  asserts: { obs: "exit.code", is: satisfies((x: unknown) => x === x) },
});

claim.ensures({
  subject: ref(probe.probe),
  concept: "probe-scan",
  predicate: "length-nonneg",
  text: "The non-negative-length probe predicate holds of every string, because a length is never negative.",
  scenario: scenario("probe/refuses-missing-root"),
  asserts: { obs: "stderr.text", is: satisfies((s: string) => s.length >= 0) },
});

claim.ensures({
  subject: ref(probe.probe),
  concept: "probe-scan",
  predicate: "length-positive",
  text: "The positive-length probe predicate separates the empty diagnostic from every other one.",
  scenario: scenario("probe/refuses-missing-root"),
  asserts: { obs: "stderr.text", is: satisfies((s: string) => s.length > 0) },
});
`;

const PROBE_OBS_TS = `// The fixture's vocabulary: two observables, the empty-directory world, and the action
// that calls the fixture's own \`probe\`. A throw inside the target is an observed value.

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { action, fixture, observable } from "@veridoc/claims";
import * as probe from "./probe.ts";

observable("exit.code", "number");
observable("stderr.text", "string");

fixture("empty-directory", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "veridoc-conformance-"));
  return { dir };
});

action("run-probe", {
  calls: probe.probe,
  produces: ["exit.code", "stderr.text"],
  run: async (world, target) => {
    const dir =
      typeof world === "object" && world !== null && "dir" in world
        ? String(world.dir)
        : "";
    const callable = target.probe;
    if (typeof callable !== "function") {
      throw new Error("the transpiled target does not export probe");
    }
    try {
      callable(dir);
      return { "exit.code": 0, "stderr.text": "" };
    } catch (error) {
      const exitCode =
        typeof error === "object" && error !== null && "exitCode" in error
          ? Number(error.exitCode)
          : 1;
      const text = error instanceof Error ? error.message : String(error);
      return { "exit.code": exitCode, "stderr.text": text };
    }
  },
});
`;

const INDEX_DOC_TS = `// The fixture's document tree: one node, one concept.

import { tree } from "@veridoc/tree";

tree({
  concepts: ["probe-scan"],
  documents: [
    tree.doc({
      path: "docs/architecture.spec.md",
      audience: "a plugin author reading the conformance fixture",
      question: "What does the fixture refuse, and what evidence proves it?",
    }),
  ],
});
`;

const FEATURE = `Feature: probe

  @id:probe/refuses-missing-root
  Scenario: A missing project root is refused
    Given the empty-directory fixture
    When run-probe runs against that directory
`;

const SPEC_MD = `# Conformance fixture architecture

<doc-section name="${SUBJECT}">

## Refuses

The fixture's \`probe\` reads one directory and refuses to guess: a directory without
\`config.json\` is a refusal with exit code 2 <doc-claim name="rejects-missing-project-root"/>,
and the message names the missing file.

The five bivalence probes are named here too, so every claim the fixture reports has a
section that names it: <doc-claim name="always-true"/>, <doc-claim name="or-true"/>,
<doc-claim name="self-equal"/>, <doc-claim name="length-nonneg"/>, and
<doc-claim name="length-positive"/>.
`;

function write(root: string, rel: string, text: string): void {
  const target = path.join(root, rel);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text);
}

/** Render the whole fixture project into `dir` and return it. */
export function render(dir: string): string {
  const root = path.resolve(dir);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  write(root, "package.json", `${JSON.stringify(PROJECT_PACKAGE, null, 2)}\n`);
  write(root, ".veridoc/config.json", `${JSON.stringify(CONFIG, null, 2)}\n`);
  write(root, ".veridoc/citations/conformance.jsonl", CITATION);
  write(root, "src/probe.ts", PROBE_TS);
  write(root, "src/probe.doc.ts", PROBE_DOC_TS);
  write(root, "src/probe.obs.ts", PROBE_OBS_TS);
  write(root, "index.doc.ts", INDEX_DOC_TS);
  write(root, "features/probe.feature", FEATURE);
  write(root, "docs/architecture.spec.md", SPEC_MD);
  write(root, "veridoc-conformance.json", `${JSON.stringify(MANIFEST, null, 2)}\n`);
  // The authoring packages resolve through symlinks into this checkout, so the fixture
  // imports the DSL the installed plugin was built with, not a published copy.
  for (const pkg of ["claims", "tree"]) {
    const link = path.join(root, "node_modules", "@veridoc", pkg);
    mkdirSync(path.dirname(link), { recursive: true });
    symlinkSync(path.join(repoRoot, "packages", pkg), link, "dir");
  }
  return root;
}

function main(): void {
  const argv = process.argv.slice(2);
  const pos = argv.indexOf("--out");
  const dir = pos >= 0 ? argv[pos + 1] : argv[0];
  if (dir === undefined) {
    process.stderr.write("usage: conformance-emitter --out <dir>\n");
    process.exit(2);
  }
  process.stdout.write(`${render(dir)}\n`);
}

// Run only as an entry point; the emitter test imports `render` from this module.
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
