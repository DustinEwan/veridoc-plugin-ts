// Transpile the action's import closure to ESM with the same `typescript` package and
// cache it per process, so a scenario run needs no loader flag: every `.ts` file the
// target imports is compiled to a `.mjs` in a content-addressed directory under the
// system temp dir, and the entry module is imported from there.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const cache = new Map<string, Promise<Record<string, unknown>>>();

function resolveTs(candidate: string): string | undefined {
  if (candidate.endsWith(".ts") && existsSync(candidate)) return candidate;
  for (const suffix of [".ts", "/index.ts"]) {
    const withSuffix = candidate + suffix;
    if (existsSync(withSuffix)) return withSuffix;
  }
  return undefined;
}

/** Every `.ts` file reachable from `entry` through relative imports. */
function closure(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift();
    if (file === undefined || seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)(["'])(\.[^"']+)\1/g)) {
      const specifier = match[2];
      if (specifier === undefined) continue;
      const target = resolveTs(path.resolve(path.dirname(file), specifier));
      if (target !== undefined) queue.push(target);
    }
  }
  return [...seen];
}

function transpileOne(file: string): string {
  const out = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      sourceMap: false,
    },
  }).outputText;
  // Point relative `.ts` imports at the emitted `.mjs` siblings.
  return out.replace(
    /(\bfrom\s*|\bimport\s*\(\s*)(["'])(\.[^"']+)\.ts\2/g,
    "$1$2$3.mjs$2",
  );
}

export function loadModule(root: string, entryAbs: string): Promise<Record<string, unknown>> {
  const files = closure(entryAbs).sort();
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(file);
    digest.update(readFileSync(file));
  }
  const key = digest.digest("hex").slice(0, 20);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const job = (async () => {
    const dir = path.join(os.tmpdir(), "veridoc-plugin-ts", key);
    const marker = path.join(dir, ".complete");
    if (!existsSync(marker)) {
      mkdirSync(dir, { recursive: true });
      for (const file of files) {
        const rel = path.relative(root, file).split(path.sep).join(path.posix.sep);
        const outPath = path.join(dir, rel.replace(/\.ts$/, ".mjs"));
        mkdirSync(path.dirname(outPath), { recursive: true });
        writeFileSync(outPath, transpileOne(file));
      }
      writeFileSync(marker, "");
    }
    const entryRel = path.relative(root, entryAbs).split(path.sep).join(path.posix.sep);
    const module: Record<string, unknown> = await import(
      // The transpiled entry lives in a content-addressed cache directory that only
      // exists at runtime; a static import cannot name it.
      pathToFileURL(path.join(dir, entryRel.replace(/\.ts$/, ".mjs"))).href
    );
    return module;
  })();
  cache.set(key, job);
  return job;
}
