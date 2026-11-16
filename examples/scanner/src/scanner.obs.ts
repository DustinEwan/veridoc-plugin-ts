// The observation vocabulary: the three observables, the action that calls `parseConfig`
// against a fixture world, and the empty-directory fixture itself.

import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { action, fixture, observable } from "@veridoc/claims";
import * as scanner from "./scanner.ts";

observable("exit.code", "number");
observable("stderr.text", "string");
observable("writtenFiles", "string[]");

fixture("empty-directory", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "veridoc-scanner-"));
  return { dir };
});

action("parse-config", {
  calls: scanner.parseConfig,
  produces: ["exit.code", "stderr.text", "writtenFiles"],
  run: async (world, target) => {
    const dir =
      typeof world === "object" && world !== null && "dir" in world
        ? String(world.dir)
        : "";
    const callable = target.parseConfig;
    if (typeof callable !== "function") {
      throw new Error("the transpiled target does not export parseConfig");
    }
    const writtenFiles = await readdir(dir);
    try {
      callable(dir);
      const after = await readdir(dir);
      return { "exit.code": 0, "stderr.text": "", "writtenFiles": after };
    } catch (error) {
      // A throw inside the target is an observed value, not a failure: the assertion
      // decides whether the sentence holds.
      const exitCode =
        typeof error === "object" && error !== null && "exitCode" in error
          ? Number(error.exitCode)
          : 1;
      const text = error instanceof Error ? error.message : String(error);
      return { "exit.code": exitCode, "stderr.text": text, "writtenFiles": writtenFiles };
    }
  },
});
