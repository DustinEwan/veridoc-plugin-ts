// The claim module: one `ensures` claim with its scenario, one `witness` claim on the
// artefact channel, and one `because` claim on the citation channel. All three are about
// `parseConfig`, and that name — the subject's own, not the file it sits in — is the left half
// of every name the build prints, `parseConfig#rejects-missing-config`. Each is named by a
// `<doc-claim>` inside a `docs/architecture.spec.md` section that opens with that subject.

import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { all, claim, contains, equals, ref } from "@veridoc/claims";
import * as scanner from "./scanner.ts";

claim.ensures({
  subject: ref(scanner.parseConfig),
  concept: "project-scan",
  predicate: "rejects-missing-config",
  text: "parseConfig refuses a directory that holds no config.json: the run exits with code 2 and the diagnostic names the missing file.",
  scenario: {
    given: "an empty directory",
    when: "parseConfig against that directory",
    values: {
      "exit.code": "number",
      "stderr.text": "string",
      writtenFiles: "array",
    },
    run: async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "veridoc-scanner-"));
      const before = await readdir(dir);
      try {
        scanner.parseConfig(dir);
        return { "exit.code": 0, "stderr.text": "", writtenFiles: await readdir(dir) };
      } catch (error) {
        // A throw inside the subject is an observed value, not a failure: the assertion
        // decides whether the sentence holds.
        const exitCode =
          typeof error === "object" && error !== null && "exitCode" in error
            ? Number(error.exitCode)
            : 1;
        const text = error instanceof Error ? error.message : String(error);
        return { "exit.code": exitCode, "stderr.text": text, writtenFiles: before };
      }
    },
  },
  asserts: all(
    { obs: "exit.code", is: equals(2) },
    { obs: "stderr.text", is: contains("config.json") },
  ),
});

claim.witness({
  subject: ref(scanner.parseConfig),
  concept: "project-scan",
  predicate: "sample-listing-pinned",
  text: "The sample listing of an empty directory that the documentation was verified against is checked in byte for byte.",
  artefact: {
    path: "samples/empty-directory.sample",
    sha256: "eb9689f4e89f0b8b88f6fde235f1d5d9329c3056a21e6f451e36f23604ff8394",
  },
});

claim.because({
  subject: ref(scanner.parseConfig),
  concept: "project-scan",
  predicate: "exit-code-2-decision",
  text: "Exit code 2 is the refusal code because the session log records that choice for missing-input failures.",
  citation: { store: "session", id: "2026-11-12-exit-codes", turn: 1 },
});
