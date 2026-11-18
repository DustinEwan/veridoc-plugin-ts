// `run`: build the fixture world, load the action's target through the transpile cache,
// call the action, read the declared observables, and answer the `satisfies` leaves. The
// plugin answers values and never a verdict. A throw before the action is reached is a
// fixture failure; a throw inside the target is an observed value the assertion decides.

import path from "node:path";
import { predicates, type ActionRun } from "@veridoc/claims";
import { getState } from "./state.js";
import { loadModule } from "./transpile.js";
import { claimIndex } from "./bivalence.js";
import type { Asserts, Check, Observed, RunFailure, RunRequest, RunResponse } from "./protocol.js";

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function failed(kind: RunFailure["kind"], detail: string): RunResponse {
  return { ok: false, observed: [], satisfied: [], failure: { kind, detail } };
}

interface Leaf {
  obs: string;
  is: Check;
}

function preorder(node: Asserts): Leaf[] {
  if ("all" in node) return node.all.flatMap(preorder);
  if ("any" in node) return node.any.flatMap(preorder);
  if ("not" in node) return preorder(node.not);
  return [{ obs: node.obs, is: node.is }];
}

export async function run(request: RunRequest): Promise<RunResponse> {
  const state = getState();
  const action = state.actions.find((a) => a.name === request.action);
  if (action === undefined) {
    return failed("plugin", `no action named ${request.action} is declared`);
  }
  const fixture = state.fixtures.find((f) => f.name === request.fixture);
  if (fixture === undefined) {
    return failed("fixture", `no fixture named ${request.fixture} is declared`);
  }
  if (action.calls.kind !== "symbol") {
    return failed("plugin", `action ${request.action} does not call a symbol`);
  }

  let world: unknown;
  try {
    world = await fixture.setup();
  } catch (error) {
    return failed("fixture", message(error));
  }

  let target: Record<string, unknown>;
  try {
    target = await loadModule(state.root, path.join(state.root, action.calls.from));
  } catch (error) {
    return failed("build", message(error));
  }

  const runAction: ActionRun = action.run;
  let record: Record<string, unknown>;
  try {
    record = await runAction(world, target);
  } catch (error) {
    return failed("plugin", message(error));
  }

  const values = new Map<string, unknown>();
  const observed: Observed[] = state.observables.map((entry) => {
    const value =
      typeof record === "object" && record !== null && entry.name in record
        ? record[entry.name]
        : null;
    values.set(entry.name, value);
    return { observable: entry.name, value: JSON.stringify(value ?? null) };
  });

  // Leaves arrive as `{claim name}#l{n}`; a name carries its own `#`, so the leaf mark is the
  // last one. The plugin recomputes each collected claim's name from its own registry,
  // collision suffix included, to find the leaf's predicate and observable.
  const claimsByName = claimIndex();
  const satisfied = request.leaves.map((leaf) => {
    const mark = leaf.leafId.lastIndexOf("#l");
    const claimPart = mark < 0 ? leaf.leafId : leaf.leafId.slice(0, mark);
    const index = mark < 0 ? 0 : Number(leaf.leafId.slice(mark + 2));
    const owner = claimsByName.get(claimPart);
    const asserts = owner?.channel.asserts;
    if (asserts === undefined || asserts === null) {
      return { leafId: leaf.leafId, ok: true };
    }
    const entry = Number.isInteger(index) ? preorder(asserts)[index] : undefined;
    if (entry === undefined || !("satisfies" in entry.is)) {
      return { leafId: leaf.leafId, ok: true };
    }
    const predicate = predicates.get(entry.is.satisfies.source);
    if (predicate === undefined) return { leafId: leaf.leafId, ok: false };
    let holds = false;
    try {
      holds = predicate(values.get(entry.obs)) === true;
    } catch {
      holds = false;
    }
    return { leafId: leaf.leafId, ok: holds };
  });

  return { ok: true, observed, satisfied };
}
