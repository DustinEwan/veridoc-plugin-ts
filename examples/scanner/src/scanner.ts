// The scanner: it reads a project's configuration from one directory and refuses to
// guess. `parseConfig` is the subject of the documentation claims; `findRoot` walks
// upward for a project root marker.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface ScannerConfig {
  root: string;
  name: string;
}

/** A refusal the caller can turn into an exit code. */
export class ConfigProblem extends Error {
  exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.name = "ConfigProblem";
    this.exitCode = exitCode;
  }
}

/** The nearest directory at or above `startDir` holding a `veridoc.json`, or "". */
export function findRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  for (;;) {
    if (existsSync(path.join(dir, "veridoc.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return "";
    dir = parent;
  }
}

/** Read `config.json` from `dir`. A directory without one is refused with exit code 2
 * and a message naming the missing file; the scanner never guesses a root. */
export function parseConfig(dir: string): ScannerConfig {
  const root = path.resolve(dir);
  const file = path.join(root, "config.json");
  if (!existsSync(file)) {
    throw new ConfigProblem(
      `no config.json found in ${root}; the scanner refuses to guess a root`,
      2,
    );
  }
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  const name =
    typeof parsed === "object" && parsed !== null && "name" in parsed
      ? String(parsed.name)
      : "scanner";
  return { root, name };
}
