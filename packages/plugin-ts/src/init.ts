// `init`: create the files only this plugin can create — the root document `collect` reads, and
// the prose file the requested document names. The host writes neither, because a host that writes
// a file it cannot parse hands the author a file that cannot be built (`docs/decisions/0015`).
// A file that already exists is a refusal unless `force` says otherwise: a scaffold that overwrites
// an author's prose is worse than none.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { InitReq, InitResult } from "./protocol.js";

/** The project's own concept, from its directory name, so the first claim has a concept to name
 * before the author has chosen one. */
function conceptFor(root: string): string {
  const slug = path
    .basename(root)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "project" : slug;
}

function indexBody(root: string, req: InitReq): string {
  const document = req.document;
  const notApplicable =
    document.notApplicable === undefined
      ? ""
      : `,\n      notApplicable: ${JSON.stringify(document.notApplicable)}`;
  return [
    "// The document tree, created by `veridoc init` through the plugin. Edit it; do not regenerate it.",
    "",
    'import { tree } from "@veridoc/tree";',
    "",
    "tree({",
    `  concepts: [${JSON.stringify(conceptFor(root))}],`,
    "  documents: [",
    "    tree.doc({",
    `      path: ${JSON.stringify(document.path)},`,
    `      audience: ${JSON.stringify(document.audience)},`,
    `      question: ${JSON.stringify(document.question)}${notApplicable},`,
    "    }),",
    "  ],",
    "});",
    "",
  ].join("\n");
}

function proseBody(req: InitReq): string {
  return [
    '<doc-section name="symbol-name">',
    "",
    `## ${req.document.question}`,
    "",
    "Write the prose here, and name a claim where a sentence states one: <doc-claim name=\"predicate\"/>.",
    "Rename `symbol-name` and `predicate` to the subject and the predicate you declare in a",
    "`*.doc.ts` sidecar.",
    "",
  ].join("\n");
}

/** True when the project cannot import the DSL its sidecars write: the emitter links the packages
 * into `node_modules`, a real project installs them. */
function installsTree(root: string): boolean {
  const file = path.join(root, "package.json");
  if (!existsSync(file)) return false;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return false;
    const record = parsed as Record<string, unknown>;
    for (const key of ["dependencies", "devDependencies"]) {
      const deps = record[key];
      if (typeof deps === "object" && deps !== null && "@veridoc/tree" in deps) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function init(req: InitReq): InitResult {
  if (req.root === "") throw new Error("init needs the project root");
  if (req.document.path === "") throw new Error("init needs the document's `.spec.md` path");
  const root = path.resolve(req.root);
  const prose = path.resolve(root, req.document.path);
  if (prose !== root && !prose.startsWith(root + path.sep)) {
    throw new Error(`the document path must stay inside the project: ${req.document.path}`);
  }
  const files: Array<[string, string]> = [
    [path.join(root, "index.doc.ts"), indexBody(root, req)],
    [prose, proseBody(req)],
  ];
  const written: string[] = [];
  for (const [file, body] of files) {
    if (existsSync(file) && !req.force) {
      throw new Error(`${file} exists; pass force to replace it`);
    }
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
    written.push(path.relative(root, file).split(path.sep).join("/"));
  }
  const concept = conceptFor(root);
  const next = [
    `declare the claims in a \`*.doc.ts\` sidecar, naming the concept ${JSON.stringify(concept)}`,
  ];
  if (!installsTree(root)) {
    next.push("add `@veridoc/tree` and `@veridoc/claims` to the project's dependencies");
  }
  next.push("run `veridoc check`");
  return { written, next };
}
