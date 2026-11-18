// Bivalence. A structured `equals`/`contains` answers `structural` after checking the
// expected value against the declared observable type. A `satisfies` predicate is parsed
// with the compiler API and decided by interval reasoning over each projection's declared
// domain; when the analysis cannot settle the question the answer is `witnesses`, taken
// from evaluating the predicate on the two recorded witness values.
//
// The four required negatives from the spec — `x => true`, `typeof x === "string" || true`,
// `x => x === x`, and `s => s.length >= 0` — all come back not bivalent, and
// `s => s.length > 0` comes back `{bivalent: true, method: "static-analysis"}`.

import ts from "typescript";
import { predicates } from "@veridoc/claims";
import type { Asserts, BivalenceResult, Check, RawClaim } from "./protocol.js";
import { subjectKey } from "./program.js";
import { getState } from "./state.js";
import { claimNames } from "./ids.js";

const ALLOWED_GLOBALS: Record<string, true> = {
  Number: true,
  String: true,
  Boolean: true,
  Math: true,
  Object: true,
  Array: true,
};
const ALLOWED_MEMBERS: Record<string, true> = {
  abs: true,
  floor: true,
  trunc: true,
  max: true,
  min: true,
  keys: true,
  values: true,
  isArray: true,
  includes: true,
  startsWith: true,
  endsWith: true,
  slice: true,
  toLowerCase: true,
  trim: true,
  test: true,
};

type DomainKind = "number" | "string" | "stringArray" | "boolean" | "unknown";

function domainOf(declaredType: string): DomainKind {
  switch (declaredType.trim()) {
    case "number":
      return "number";
    case "string":
      return "string";
    case "string[]":
      return "stringArray";
    case "boolean":
      return "boolean";
    default:
      return "unknown";
  }
}

interface Interval {
  min: number;
  max: number;
}

type Operand =
  | { kind: "num"; interval: Interval }
  | { kind: "str"; value?: string }
  | { kind: "unknown" };

/** `undefined` means the analysis cannot say: the expression may hold and may fail. */
interface Tri {
  canTrue: boolean;
  canFalse: boolean;
}

const BOTH: Tri = { canTrue: true, canFalse: true };

function compareIntervals(op: string, left: Interval, right: Interval): Tri | undefined {
  const operator = op === "==" ? "===" : op === "!=" ? "!==" : op;
  const inverses: Record<string, string> = {
    "===": "!==",
    "!==": "===",
    "<": ">=",
    "<=": ">",
    ">": "<=",
    ">=": "<",
  };
  const inverse = inverses[operator];
  if (inverse === undefined) return undefined;
  // Existence over closed intervals, possibly unbounded, is endpoint arithmetic.
  const exists = (kind: string): boolean => {
    const l1 = left.min;
    const u1 = left.max;
    const l2 = right.min;
    const u2 = right.max;
    switch (kind) {
      case "<":
        return l1 < u2;
      case "<=":
        return l1 <= u2;
      case ">":
        return u1 > l2;
      case ">=":
        return u1 >= l2;
      case "===":
        return l1 <= u2 && l2 <= u1;
      case "!==":
        return !(l1 === u1 && l2 === u2 && l1 === l2);
      default:
        return false;
    }
  };
  return { canTrue: exists(operator), canFalse: exists(inverse) };
}

/** Static verdict for one predicate source over one declared observable type. */
export interface PredicateAnalysis {
  decidable: boolean;
  bivalent?: boolean;
  reason?: string;
}

export function analyzePredicate(source: string, declaredType: string): PredicateAnalysis {
  const sourceFile = ts.createSourceFile(
    "predicate.ts",
    `(${source});`,
    ts.ScriptTarget.Latest,
    true,
  );
  let arrow: ts.ArrowFunction | undefined;
  const findArrow = (node: ts.Node): void => {
    if (arrow === undefined && ts.isArrowFunction(node)) arrow = node;
    ts.forEachChild(node, findArrow);
  };
  ts.forEachChild(sourceFile, findArrow);
  if (arrow === undefined) {
    return { decidable: false, reason: "the predicate is not an arrow function" };
  }
  if (arrow.parameters.length !== 1) {
    return { decidable: false, reason: "the predicate does not take exactly one value" };
  }
  if (!ts.isExpression(arrow.body)) {
    return { decidable: false, reason: "the predicate body is not a single expression" };
  }
  const body = arrow.body;
  const paramName = arrow.parameters[0]?.name.getText(sourceFile) ?? "";

  // No calls outside the allow-list.
  let outsideCall: string | undefined;
  const checkCalls = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee)) {
        if (!(callee.text in ALLOWED_GLOBALS)) outsideCall ??= callee.text;
      } else if (ts.isPropertyAccessExpression(callee)) {
        if (!(callee.name.text in ALLOWED_MEMBERS)) outsideCall ??= callee.name.text;
      } else {
        outsideCall ??= callee.getText(sourceFile);
      }
    }
    ts.forEachChild(node, checkCalls);
  };
  checkCalls(body);
  if (outsideCall !== undefined) {
    return { decidable: false, reason: `a call outside the allow-list: ${outsideCall}` };
  }

  const domain = domainOf(declaredType);

  const operandOf = (node: ts.Expression): Operand => {
    const inner = ts.isParenthesizedExpression(node) ? node.expression : node;
    if (ts.isNumericLiteral(inner)) {
      return { kind: "num", interval: { min: Number(inner.text), max: Number(inner.text) } };
    }
    if (ts.isPrefixUnaryExpression(inner) && inner.operator === ts.SyntaxKind.MinusToken) {
      const value = operandOf(inner.operand);
      if (value.kind === "num") {
        return { kind: "num", interval: { min: -value.interval.max, max: -value.interval.min } };
      }
      return { kind: "unknown" };
    }
    if (ts.isStringLiteral(inner)) return { kind: "str", value: inner.text };
    if (
      ts.isTypeOfExpression(inner) &&
      ts.isIdentifier(inner.expression) &&
      inner.expression.text === paramName
    ) {
      if (domain === "string") return { kind: "str", value: "string" };
      if (domain === "number") return { kind: "str", value: "number" };
      if (domain === "boolean") return { kind: "str", value: "boolean" };
      if (domain === "stringArray") return { kind: "str", value: "object" };
      return { kind: "unknown" };
    }
    if (ts.isIdentifier(inner) && inner.text === paramName) {
      if (domain === "number") return { kind: "num", interval: { min: -Infinity, max: Infinity } };
      return { kind: "str" };
    }
    // `x.length` over a string or array is the integers >= 0.
    if (
      ts.isPropertyAccessExpression(inner) &&
      inner.name.text === "length" &&
      ts.isIdentifier(inner.expression) &&
      inner.expression.text === paramName &&
      (domain === "string" || domain === "stringArray")
    ) {
      return { kind: "num", interval: { min: 0, max: Infinity } };
    }
    // Allow-listed math over numeric operands.
    if (ts.isCallExpression(inner) && ts.isPropertyAccessExpression(inner.expression)) {
      const member = inner.expression.name.text;
      const args = inner.arguments.map((argument) => operandOf(argument as ts.Expression));
      const numbers = args.filter((a): a is Extract<Operand, { kind: "num" }> => a.kind === "num");
      if (numbers.length !== args.length) return { kind: "unknown" };
      if (member === "abs" && numbers.length === 1) {
        const { min, max } = numbers[0].interval;
        return { kind: "num", interval: { min: 0, max: Math.max(Math.abs(min), Math.abs(max)) } };
      }
      if ((member === "floor" || member === "trunc") && numbers.length === 1) {
        return {
          kind: "num",
          interval: { min: Math.floor(numbers[0].interval.min), max: Math.floor(numbers[0].interval.max) },
        };
      }
      if ((member === "max" || member === "min") && numbers.length > 0) {
        const combine = member === "max" ? Math.max : Math.min;
        const pick = member === "max" ? "max" : "min";
        return {
          kind: "num",
          interval: {
            min: combine(...numbers.map((n) => n.interval[pick])),
            max: combine(...numbers.map((n) => n.interval[pick])),
          },
        };
      }
      if (member === "isArray" && args.length === 1) {
        // Handled by `analyze`; as an operand it is unknown.
        return { kind: "unknown" };
      }
      return { kind: "unknown" };
    }
    if (ts.isCallExpression(inner) && ts.isIdentifier(inner.expression)) {
      if (inner.expression.text === "Number" && inner.arguments.length === 1) {
        return operandOf(inner.arguments[0] as ts.Expression);
      }
    }
    return { kind: "unknown" };
  };

  const analyze = (node: ts.Expression): Tri | undefined => {
    const inner = ts.isParenthesizedExpression(node) ? node.expression : node;
    if (inner.kind === ts.SyntaxKind.TrueKeyword) return { canTrue: true, canFalse: false };
    if (inner.kind === ts.SyntaxKind.FalseKeyword) return { canTrue: false, canFalse: true };
    if (ts.isPrefixUnaryExpression(inner) && inner.operator === ts.SyntaxKind.ExclamationToken) {
      const value = analyze(inner.operand);
      return value === undefined ? undefined : { canTrue: value.canFalse, canFalse: value.canTrue };
    }
    if (ts.isBinaryExpression(inner)) {
      const op = inner.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
        const left = analyze(inner.left);
        const right = analyze(inner.right);
        if (left === undefined || right === undefined) return undefined;
        return {
          canTrue: left.canTrue && right.canTrue,
          canFalse: left.canFalse || right.canFalse,
        };
      }
      if (op === ts.SyntaxKind.BarBarToken) {
        const left = analyze(inner.left);
        const right = analyze(inner.right);
        if (left === undefined || right === undefined) return undefined;
        return {
          canTrue: left.canTrue || right.canTrue,
          canFalse: left.canFalse && right.canFalse,
        };
      }
      const comparisonOperators = [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
        ts.SyntaxKind.LessThanToken,
        ts.SyntaxKind.LessThanEqualsToken,
        ts.SyntaxKind.GreaterThanToken,
        ts.SyntaxKind.GreaterThanEqualsToken,
      ];
      if (comparisonOperators.includes(op)) {
        const text = inner.operatorToken.getText(sourceFile);
        if (inner.left.getText(sourceFile) === inner.right.getText(sourceFile)) {
          const equality =
            op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken;
          return equality ? { canTrue: true, canFalse: false } : { canTrue: false, canFalse: true };
        }
        const left = operandOf(inner.left);
        const right = operandOf(inner.right);
        if (left.kind === "num" && right.kind === "num") {
          return compareIntervals(text, left.interval, right.interval);
        }
        if (left.kind === "str" && right.kind === "str") {
          if (left.value !== undefined && right.value !== undefined) {
            const equal = left.value === right.value;
            const equality =
              op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken;
            const holds = equality === equal;
            return holds ? { canTrue: true, canFalse: false } : { canTrue: false, canFalse: true };
          }
          // An unconstrained string can equal or differ from any constant.
          return BOTH;
        }
        return undefined;
      }
      return undefined;
    }
    if (ts.isCallExpression(inner)) {
      // `Array.isArray` over a declared array or string is settled; anything else in the
      // allow-list can go either way and is only reached when analysis stays undecided.
      if (
        ts.isPropertyAccessExpression(inner.expression) &&
        inner.expression.name.text === "isArray" &&
        inner.arguments.length === 1 &&
        ts.isIdentifier(inner.arguments[0] as ts.Expression) &&
        (inner.arguments[0] as ts.Identifier).text === paramName
      ) {
        if (domain === "stringArray") return { canTrue: true, canFalse: false };
        if (domain === "string" || domain === "number" || domain === "boolean") {
          return { canTrue: false, canFalse: true };
        }
      }
      return undefined;
    }
    return undefined;
  };

  const verdict = analyze(body);
  if (verdict === undefined) return { decidable: false };
  if (verdict.canTrue && verdict.canFalse) return { decidable: true, bivalent: true };
  return {
    decidable: true,
    bivalent: false,
    reason: "the predicate is constant: it can only hold or only fail over the declared type",
  };
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

function typeAllows(declaredType: string, expected: unknown, check: "equals" | "contains"): boolean {
  if (check === "contains") {
    return (
      typeof expected === "string" &&
      (domainOf(declaredType) === "string" || domainOf(declaredType) === "stringArray")
    );
  }
  switch (domainOf(declaredType)) {
    case "number":
      return typeof expected === "number";
    case "string":
      return typeof expected === "string";
    case "boolean":
      return typeof expected === "boolean";
    case "stringArray":
      return Array.isArray(expected);
    default:
      return true;
  }
}

/** The claim-level bivalence answer for one scenario-channel claim. */
export function bivalenceFor(claim: RawClaim): BivalenceResult {
  const asserts = claim.channel.asserts;
  if (asserts === undefined || asserts === null) {
    return { bivalent: false, method: "structural", reason: "the claim declares no assertion tree" };
  }
  const state = getState();
  const observableTypes = new Map(state.observables.map((o) => [o.name, o.type]));
  const leaves = preorder(asserts);

  let sawSatisfies = false;
  let undecided = false;
  for (const leaf of leaves) {
    const declaredType = observableTypes.get(leaf.obs) ?? "unknown";
    if ("equals" in leaf.is) {
      if (!typeAllows(declaredType, leaf.is.equals, "equals")) {
        return {
          bivalent: false,
          method: "structural",
          reason: `equals ${JSON.stringify(leaf.is.equals)} does not fit observable ${leaf.obs} of type ${declaredType}`,
        };
      }
      continue;
    }
    if ("contains" in leaf.is) {
      if (!typeAllows(declaredType, leaf.is.contains, "contains")) {
        return {
          bivalent: false,
          method: "structural",
          reason: `contains ${JSON.stringify(leaf.is.contains)} does not fit observable ${leaf.obs} of type ${declaredType}`,
        };
      }
      continue;
    }
    sawSatisfies = true;
    const analysis = analyzePredicate(leaf.is.satisfies.source, declaredType);
    if (!analysis.decidable) undecided = true;
    else if (analysis.bivalent !== true) {
      return { bivalent: false, method: "static-analysis", reason: analysis.reason };
    }
  }

  if (!sawSatisfies) return { bivalent: true, method: "structural" };
  if (!undecided) return { bivalent: true, method: "static-analysis" };

  // The analysis could not settle some predicate: fall back to the author's witnesses.
  let witnessAccepts = true;
  let witnessRejects = true;
  for (const leaf of leaves) {
    if (!("satisfies" in leaf.is)) continue;
    const spec = leaf.is.satisfies;
    const fn = predicates.get(spec.source);
    if (fn === undefined || spec.accepts === undefined || spec.rejects === undefined) {
      return {
        bivalent: false,
        method: "witnesses",
        reason: `no witness pair is recorded for ${leaf.obs}`,
      };
    }
    if (fn(spec.accepts) !== true) witnessAccepts = false;
    if (fn(spec.rejects) === true) witnessRejects = false;
  }
  return {
    bivalent: witnessAccepts && witnessRejects,
    method: "witnesses",
    witnessAccepts,
    witnessRejects,
    reason:
      witnessAccepts && witnessRejects
        ? undefined
        : "a witness does not answer as the predicate requires",
  };
}

/**
 * Every collected claim whose subject resolved, keyed by the name the engine gives it:
 * `<subject>#<slug>`, where `<subject>` is the author's subject name, with the collision suffix
 * on each name two claims slug alike. Claims with an unresolved subject are left out, because the
 * engine names only the claims it bound.
 */
export function claimIndex(): Map<string, RawClaim> {
  const state = getState();
  const bound: { claim: RawClaim; subjectName: string; predicate: string }[] = [];
  for (const claim of state.claims) {
    if (!state.referents.has(subjectKey(claim.subject))) continue;
    bound.push({ claim, subjectName: claim.subject.name, predicate: claim.predicate });
  }
  const names = claimNames(bound);
  const index = new Map<string, RawClaim>();
  bound.forEach((entry, i) => index.set(names[i], entry.claim));
  return index;
}
