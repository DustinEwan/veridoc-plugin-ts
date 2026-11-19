// `run`: execute the scenario beside one claim and answer the run: every value it produced,
// and every leaf of that claim's own assertion tree, decided from the values the scenario
// answered. The scenario is the code the claim module registered at `collect`, and the claim's
// id is the only address it has ever been given — the leaf marks `{claim id}#l{n}` are derived
// here, over the same pre-order walk `bivalence` takes, because the engine sends none.
//
// A scenario that cannot run answers the same shape with `ok: false` and a failure naming the
// claim — never a JSON-RPC error — so the host records that one claim's result and keeps
// judging the rest. A throw inside the project's own code is not a failure: it is the value
// the scenario catches and reports, which is what the assertion then decides.

import { predicates, type RegisteredScenario } from "@veridoc/claims";
import { claimById, getState } from "./state.js";
import type {
  Asserts,
  Check,
  LeafAnswer,
  Observed,
  RunFailure,
  RunRequest,
  RunResponse,
} from "./protocol.js";

function failed(claim: string, kind: RunFailure["kind"], detail: string): RunResponse {
  return {
    ok: false,
    observed: [],
    satisfied: [],
    failure: { kind, detail: `claim ${claim}: ${detail}` },
  };
}

/** The scenario spent the wait its host set without answering. */
class Outlived extends Error {}

async function withinTimeout(
  timeoutMs: number,
  scenario: RegisteredScenario,
): Promise<unknown> {
  const { promise: deadline, reject } = Promise.withResolvers<never>();
  const timer = setTimeout(
    () => reject(new Outlived(`the scenario outlived ${timeoutMs} ms`)),
    timeoutMs,
  );
  try {
    return await Promise.race([scenario.run(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

interface Leaf {
  obs: string;
  is: Check;
}

/** The claim's leaves in the order the engine numbers them — the same walk `bivalence` takes. */
function preorder(node: Asserts): Leaf[] {
  if ("all" in node) return node.all.flatMap(preorder);
  if ("any" in node) return node.any.flatMap(preorder);
  if ("not" in node) return preorder(node.not);
  return [{ obs: node.obs, is: node.is }];
}

function equals(value: unknown, expected: unknown): boolean {
  if (value === expected) return true;
  if (Array.isArray(value) && Array.isArray(expected)) {
    return value.length === expected.length && value.every((item, at) => equals(item, expected[at]));
  }
  if (typeof value === "object" && typeof expected === "object" && value !== null && expected !== null) {
    const keys = Object.keys(value as Record<string, unknown>);
    const expectedRecord = expected as Record<string, unknown>;
    return (
      keys.length === Object.keys(expectedRecord).length &&
      keys.every((key) => equals((value as Record<string, unknown>)[key], expectedRecord[key]))
    );
  }
  return false;
}

/** The engine's own reading of `contains`: substring over a string, membership over an
 * array, and unable to hold over anything else. */
function contains(value: unknown, needle: unknown): boolean {
  if (typeof value === "string") {
    return value.includes(typeof needle === "string" ? needle : JSON.stringify(needle));
  }
  if (Array.isArray(value)) return value.some((item) => equals(item, needle));
  return false;
}

/** One leaf decided from the values the scenario answered. The engine reaches the same
 * verdict for an `equals` or `contains` leaf; it asks the plugin only about `satisfies`,
 * whose predicate is code the author wrote beside the claim. */
function decides(leaf: Leaf, values: Map<string, unknown>): boolean {
  const check = leaf.is;
  if ("satisfies" in check) {
    const predicate = predicates.get(check.satisfies.source);
    if (predicate === undefined) throw new MissingPredicate(leaf.obs);
    try {
      return predicate(values.get(leaf.obs)) === true;
    } catch {
      return false;
    }
  }
  if (!values.has(leaf.obs)) return false;
  const value = values.get(leaf.obs);
  if ("equals" in check) return equals(value, check.equals);
  return contains(value, check.contains);
}

/** A `satisfies` leaf whose predicate the plugin holds no code for: answering it true would
 * be a guessed verdict, and answering it false would be a verdict the plugin never earned. */
class MissingPredicate extends Error {
  constructor(readonly obs: string) {
    super(obs);
  }
}

export async function run(request: RunRequest): Promise<RunResponse> {
  const state = getState();
  const scenario = state.scenarios.get(request.claim);
  if (scenario === undefined) {
    return failed(request.claim, "plugin", "no scenario is declared beside this claim");
  }

  let produced: unknown;
  try {
    produced = await withinTimeout(request.timeoutMs, scenario);
  } catch (error) {
    if (error instanceof Outlived) return failed(request.claim, "deadline", error.message);
    return failed(
      request.claim,
      "plugin",
      `the scenario could not run: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (typeof produced !== "object" || produced === null || Array.isArray(produced)) {
    return failed(request.claim, "plugin", "the scenario answered no record of values");
  }
  const returned = produced as Record<string, unknown>;

  // The declared names are the whole of the answer: a missing value means the scenario did
  // not produce the evidence its claim promised, and an undeclared one is a value no
  // assertion could ever have been checked against. Each value travels JSON-encoded, so the
  // engine's `{"equals":2}` meets the number 2 and not the string "2".
  const values = new Map<string, unknown>();
  const observed: Observed[] = [];
  for (const declared of scenario.values) {
    if (!(declared.name in returned)) {
      return failed(
        request.claim,
        "plugin",
        `the scenario returned no value for ${declared.name}`,
      );
    }
    const value = returned[declared.name];
    values.set(declared.name, value);
    observed.push({ observable: declared.name, value: JSON.stringify(value) });
  }
  for (const name of Object.keys(returned)) {
    if (scenario.values.some((declared) => declared.name === name)) continue;
    return failed(
      request.claim,
      "plugin",
      `the scenario returned ${name}, which the claim does not declare`,
    );
  }

  // Every leaf of the claim's own tree is answered, in the walk that numbers it. A leaf whose
  // predicate the plugin cannot run is the scenario's failure, not a verdict.
  const asserts = claimById(request.claim)?.channel.asserts;
  const satisfied: LeafAnswer[] = [];
  if (asserts !== undefined && asserts !== null) {
    const leaves = preorder(asserts);
    for (let index = 0; index < leaves.length; index += 1) {
      const leaf = leaves[index];
      const leafId = `${request.claim}#l${index}`;
      try {
        satisfied.push({ leafId, ok: decides(leaf, values) });
      } catch (error) {
        if (!(error instanceof MissingPredicate)) throw error;
        return failed(
          request.claim,
          "plugin",
          `no answer for the satisfies leaf ${leafId} on ${error.obs}`,
        );
      }
    }
  }

  return { ok: true, observed, satisfied };
}
