// `cite`: the two v1 store kinds. A `file` store reads `<path>/<id>.jsonl` and answers
// turn `n`'s `text`; a `git` store checks the object with `git cat-file -e` and answers
// the commit message with `state` `merged` or `dangling`. An undeclared store is answered
// by the engine and not here.

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { getState } from "./state.js";
import type { Citation, CiteResult } from "./protocol.js";

const run = promisify(execFile);

async function git(root: string, args: string[]): Promise<string> {
  const result = await run("git", args, { cwd: root });
  return result.stdout;
}

export async function cite(citations: Citation[]): Promise<CiteResult> {
  const state = getState();
  const stores = state.config.citationStores ?? [];
  const resolved: CiteResult["resolved"] = [];
  const unresolved: CiteResult["unresolved"] = [];

  for (const reference of citations) {
    const store = stores.find((s) => s.name === reference.store);
    if (store === undefined) {
      unresolved.push({ id: reference.id, reason: `no store named ${reference.store}` });
      continue;
    }
    if (store.kind === "file") {
      const file = path.join(state.root, store.path ?? "", `${reference.id}.jsonl`);
      if (!existsSync(file)) {
        unresolved.push({
          id: reference.id,
          reason: `${reference.id}.jsonl is not in ${store.path ?? "(no path)"}`,
        });
        continue;
      }
      const lines = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.trim().length > 0);
      const turn = reference.turn ?? 1;
      const line = lines[turn - 1];
      if (line === undefined) {
        unresolved.push({ id: reference.id, reason: `turn ${turn} is not in the log` });
        continue;
      }
      let entry: unknown;
      try {
        entry = JSON.parse(line);
      } catch {
        unresolved.push({ id: reference.id, reason: `turn ${turn} is not json` });
        continue;
      }
      if (typeof entry !== "object" || entry === null) {
        unresolved.push({ id: reference.id, reason: `turn ${turn} is not an object` });
        continue;
      }
      const text = "text" in entry ? String(entry.text) : "";
      const stateValue =
        "state" in entry && typeof entry.state === "string" ? entry.state : undefined;
      resolved.push(
        stateValue === undefined ? { id: reference.id, text } : { id: reference.id, text, state: stateValue },
      );
      continue;
    }
    if (store.kind === "git") {
      try {
        await git(state.root, ["cat-file", "-e", reference.id]);
      } catch {
        unresolved.push({ id: reference.id, reason: `git object ${reference.id} not found` });
        continue;
      }
      const text = (await git(state.root, ["log", "-1", "--format=%B", reference.id])).trim();
      let stateValue = "dangling";
      try {
        await git(state.root, ["merge-base", "--is-ancestor", reference.id, "HEAD"]);
        stateValue = "merged";
      } catch {
        stateValue = "dangling";
      }
      resolved.push({ id: reference.id, text, state: stateValue });
      continue;
    }
    unresolved.push({ id: reference.id, reason: `store kind ${store.kind} is not readable` });
  }

  return { resolved, unresolved };
}
