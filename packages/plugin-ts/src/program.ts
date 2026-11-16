// One `ts.Program` built from the project's `tsconfig.json`, and the three methods that
// read it: `resolve` (identity and signature in words), `derivable` (the four fact
// families), and `surface` (the exported symbols a claim could cover).

import path from "node:path";
import ts from "typescript";
import { getState } from "./state.js";
import { referentId } from "./ids.js";
import type { DerivableResult, ResolveResult, SurfaceResult } from "./protocol.js";

let programCache: { root: string; program: ts.Program } | undefined;

/** `ts.readConfigFile` → override include and exclude before parsing →
 * `ts.parseJsonConfigFileContent` → `{...options, noEmit: true, skipLibCheck: true}`,
 * so the plugin sees every project source without writing anything. */
export function getProgram(root: string): ts.Program {
  if (programCache !== undefined && programCache.root === root) return programCache.program;
  const configPath = path.join(root, "tsconfig.json");
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  const json: Record<string, unknown> =
    typeof read.config === "object" && read.config !== null
      ? (read.config as Record<string, unknown>)
      : {};
  json["include"] = ["**/*.ts"];
  json["exclude"] = ["node_modules", "dist", ".veridoc"];
  const parsed = ts.parseJsonConfigFileContent(json, ts.sys, root);
  const program = ts.createProgram(parsed.fileNames, {
    ...parsed.options,
    noEmit: true,
    skipLibCheck: true,
  });
  programCache = { root, program };
  return program;
}

function sourceFileOf(root: string, program: ts.Program, relPosix: string): ts.SourceFile | undefined {
  const abs = path.resolve(root, relPosix);
  return program.getSourceFile(abs);
}

function moduleSymbolOf(checker: ts.TypeChecker, sourceFile: ts.SourceFile): ts.Symbol | undefined {
  return checker.getSymbolAtLocation(sourceFile);
}

function exportedSymbol(
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  name: string,
): ts.Symbol | undefined {
  const moduleSymbol = moduleSymbolOf(checker, sourceFile);
  if (moduleSymbol === undefined) return undefined;
  return checker.tryGetMemberInModuleExports(name, moduleSymbol);
}

function collectThrows(node: ts.Node): { line: number }[] {
  const throws: { line: number }[] = [];
  const sourceFile = node.getSourceFile();
  const visit = (current: ts.Node): void => {
    if (ts.isThrowStatement(current)) {
      const position = ts.getLineAndCharacterOfPosition(sourceFile, current.getStart());
      throws.push({ line: position.line + 1 });
    }
    ts.forEachChild(current, visit);
  };
  ts.forEachChild(node, visit);
  return throws;
}

/** The resolve key of a claim subject or action call, matching the engine's `RefToken::key`. */
export function subjectKey(subject: { kind: string; name: string; from?: string }): string {
  return subject.kind === "symbol" ? `${subject.from ?? ""}|${subject.name}` : `concept|${subject.name}`;
}

export function resolveRefs(refs: string[]): ResolveResult {
  const state = getState();
  const program = getProgram(state.root);
  const checker = program.getTypeChecker();
  const resolved: ResolveResult["resolved"] = [];
  const unresolved: ResolveResult["unresolved"] = [];

  for (const reference of refs) {
    const bar = reference.indexOf("|");
    const head = bar < 0 ? reference : reference.slice(0, bar);
    const name = bar < 0 ? "" : reference.slice(bar + 1);

    if (head === "concept") {
      const id = referentId("concept", name);
      state.referents.set(reference, { referentId: id, signature: `concept ${name}` });
      resolved.push({ ref: reference, referentId: id, signature: `concept ${name}` });
      continue;
    }

    const sourceFile = sourceFileOf(state.root, program, head);
    if (sourceFile === undefined) {
      unresolved.push({ ref: reference, reason: `no source file ${head}` });
      continue;
    }
    const symbol = exportedSymbol(checker, sourceFile, name);
    if (symbol === undefined) {
      unresolved.push({ ref: reference, reason: "no exported member" });
      continue;
    }
    const declaration = symbol.declarations?.[0] ?? sourceFile;
    const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
    const signature = checker.typeToString(type);
    const id = referentId(head, name);
    state.referents.set(reference, { referentId: id, signature });
    resolved.push({ ref: reference, referentId: id, signature });
  }

  return { resolved, unresolved };
}

/** The four fact families of the derivability ban, as one sentence each: the parameter
 * list and return type, the export and its module, the members of an enum or union the
 * subject accepts, and each explicit `throw` site in the subject's body. */
export function derivableFacts(id: string): DerivableResult {
  const state = getState();
  const entry = [...state.referents.entries()].find(([, value]) => value.referentId === id);
  if (entry === undefined) return { facts: [] };
  const [key] = entry;
  const bar = key.indexOf("|");
  const head = key.slice(0, bar);
  const name = key.slice(bar + 1);
  if (head === "concept") {
    return { facts: [`concept ${name} is declared in index.doc.ts.`] };
  }

  const program = getProgram(state.root);
  const checker = program.getTypeChecker();
  const sourceFile = sourceFileOf(state.root, program, head);
  if (sourceFile === undefined) return { facts: [] };
  const symbol = exportedSymbol(checker, sourceFile, name);
  if (symbol === undefined) return { facts: [] };

  const facts: string[] = [`${name} is exported from ${head}.`];
  const declaration = symbol.declarations?.[0] ?? sourceFile;
  const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);

  const signatures = type.getCallSignatures();
  if (signatures.length > 0) {
    const signature = signatures[0];
    const params = signature.getParameters().map((parameter) => {
      const parameterType = checker.getTypeOfSymbolAtLocation(parameter, declaration);
      return `${parameter.getName()}: ${checker.typeToString(parameterType)}`;
    });
    const returnType = checker.typeToString(checker.getReturnTypeOfSignature(signature));
    facts.push(
      `${name} takes ${params.length === 0 ? "no parameters" : params.join(", ")} and returns ${returnType}.`,
    );
  }

  if ((type.flags & ts.TypeFlags.Union) !== 0) {
    const members = (type as ts.UnionType).types.map((member) => checker.typeToString(member));
    facts.push(`${name} accepts one of: ${members.join(", ")}.`);
  }
  if ((type.flags & ts.TypeFlags.EnumLike) !== 0) {
    facts.push(`${name} accepts one of: ${checker.typeToString(type)}.`);
  }

  for (const thrown of collectThrows(declaration)) {
    facts.push(`${name} throws at ${head}:${thrown.line}.`);
  }

  return { facts };
}

/** Exported functions, public class methods, and exported types, all `public: true`. */
export function surfaceList(): SurfaceResult {
  const state = getState();
  const program = getProgram(state.root);
  const checker = program.getTypeChecker();
  const referents: SurfaceResult["referents"] = [];
  const seen = new Set<string>();

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    if (!sourceFile.fileName.startsWith(state.root)) continue;
    const rel = sourceFile.fileName.slice(state.root.length + 1).split(path.sep).join("/");
    if (rel.startsWith("node_modules/") || rel.includes("/node_modules/")) continue;
    const moduleSymbol = moduleSymbolOf(checker, sourceFile);
    if (moduleSymbol === undefined) continue;
    for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
      const name = symbol.getName();
      const declaration = symbol.declarations?.[0];
      if (declaration === undefined) continue;
      const id = referentId(rel, name);
      if (!seen.has(id)) {
        seen.add(id);
        referents.push({ referentId: id, name, public: true });
      }
      const declaredType = checker.getTypeOfSymbolAtLocation(symbol, declaration);
      if ((declaredType.flags & ts.TypeFlags.Object) !== 0 && declaration.kind === ts.SyntaxKind.ClassDeclaration) {
        const classDeclaration = declaration as ts.ClassDeclaration;
        for (const member of classDeclaration.members) {
          if (!ts.isMethodDeclaration(member) || member.name === undefined) continue;
          if (!ts.isIdentifier(member.name)) continue;
          const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) : undefined;
          const isPrivate =
            modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword) ?? false;
          if (isPrivate) continue;
          const methodId = referentId(rel, `${name}.${member.name.text}`);
          if (seen.has(methodId)) continue;
          seen.add(methodId);
          referents.push({ referentId: methodId, name: `${name}.${member.name.text}`, public: true });
        }
      }
    }
  }

  return { referents };
}
