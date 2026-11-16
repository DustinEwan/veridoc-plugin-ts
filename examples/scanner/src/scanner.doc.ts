// The claim sidecar: one `ensures` claim bound to the scenario, one `witness` claim on
// the artefact channel, and one `because` claim on the citation channel.

import { claim, contains, equals, ref, scenario, all } from "@veridoc/claims";
import * as scanner from "./scanner.ts";

claim.ensures({
  subject: ref(scanner.parseConfig),
  concept: "project-scan",
  predicate: "rejects-missing-config",
  text: "parseConfig refuses a directory that holds no config.json: the run exits with code 2 and the diagnostic names the missing file.",
  scenario: scenario("config/rejects-missing-config"),
  asserts: all(
    { obs: "exit.code", is: equals(2) },
    { obs: "stderr.text", is: contains("config.json") },
  ),
  supports: ["docs/architecture.spec.md#refuses"],
});

claim.witness({
  subject: ref(scanner.parseConfig),
  concept: "project-scan",
  predicate: "sample-fixture-pinned",
  text: "The sample fixture the documentation was verified against is checked in byte for byte.",
  artefact: {
    path: "fixtures/empty-directory.sample",
    sha256: "eb9689f4e89f0b8b88f6fde235f1d5d9329c3056a21e6f451e36f23604ff8394",
  },
  supports: ["docs/architecture.spec.md#evidence"],
});

claim.because({
  subject: ref(scanner.parseConfig),
  concept: "project-scan",
  predicate: "exit-code-2-decision",
  text: "Exit code 2 is the refusal code because the session log records that choice for missing-input failures.",
  citation: { store: "session", id: "2026-11-12-exit-codes", turn: 1 },
  supports: ["docs/architecture.spec.md#evidence"],
});
