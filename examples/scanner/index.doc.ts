// The document tree: one node, one concept.

import { tree } from "@veridoc/tree";

tree({
  concepts: ["project-scan"],
  documents: [
    tree.doc({
      path: "docs/architecture.spec.md",
      audience: "a developer extending the scanner",
      question: "What does the scanner refuse, and what evidence proves it?",
      selects: { concept: "project-scan" },
    }),
  ],
});
