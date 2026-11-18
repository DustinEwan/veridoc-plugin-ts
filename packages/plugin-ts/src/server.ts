// The stdio JSON-RPC server: one message per line in, one `JSON.stringify(message)+"\n"`
// per response out. A failed stdout write is reported to stderr and does not end the
// process. Errors: MethodNotFound -32601, InvalidRequest -32600, anything else -32000,
// and a malformed JSON line is answered with -32700.

import readline from "node:readline";
import {
  CAPABILITIES,
  ERROR_CODES,
  LANGUAGES,
  METHODS,
  PLUGIN_NAME,
  PLUGIN_VERSION,
  PROTOCOL_VERSION,
  type Citation,
  type RunRequest,
} from "./protocol.js";
import { isRecord } from "./guards.js";
import { collect } from "./collect.js";
import { derivableFacts, resolveRefs, surfaceList } from "./program.js";
import { bivalenceFor, claimIndex } from "./bivalence.js";
import { run } from "./run.js";
import { cite } from "./cite.js";

class InvalidRequest extends Error {}
class UnknownMethod extends Error {}

process.stdout.on("error", (error: unknown) => {
  // A closed stdout must not end the plugin; the engine reads stderr on failure.
  process.stderr.write(`plugin stdout failed: ${String(error)}\n`);
});

function send(message: Record<string, unknown>): void {
  try {
    process.stdout.write(`${JSON.stringify(message)}\n`);
  } catch {
    // The write error handler above reports it; the loop stays up.
  }
}

function fail(id: number, code: number, detail: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message: detail } });
}

function requireString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== "string") throw new InvalidRequest(`${key} is required`);
  return value;
}

async function dispatch(method: string, params: unknown): Promise<unknown> {
  if (!METHODS.includes(method as (typeof METHODS)[number])) {
    throw new UnknownMethod(`unknown method ${method}`);
  }
  const body = params === undefined || params === null ? {} : params;
  if (!isRecord(body)) throw new InvalidRequest("params must be an object");
  switch (method) {
    case "handshake":
      return {
        protocolVersion: PROTOCOL_VERSION,
        name: PLUGIN_NAME,
        version: PLUGIN_VERSION,
        languages: [...LANGUAGES],
        capabilities: [...CAPABILITIES],
      };
    case "collect":
      return collect(requireString(body, "root"));
    case "resolve": {
      const refs = body.refs;
      if (!Array.isArray(refs) || refs.some((r) => typeof r !== "string")) {
        throw new InvalidRequest("refs must be an array of strings");
      }
      return resolveRefs(refs as string[]);
    }
    case "derivable":
      return derivableFacts(requireString(body, "referentId"));
    case "bivalence": {
      const name = requireString(body, "claimId");
      const claim = claimIndex().get(name);
      if (claim === undefined) throw new Error(`no claim named ${name} was collected`);
      return bivalenceFor(claim);
    }
    case "run": {
      const request = body as unknown as RunRequest;
      if (
        typeof request.scenarioId !== "string" ||
        typeof request.fixture !== "string" ||
        typeof request.action !== "string" ||
        !Array.isArray(request.args) ||
        typeof request.deadlineMs !== "number" ||
        !Array.isArray(request.leaves)
      ) {
        throw new InvalidRequest("the run request is missing a field");
      }
      return run(request);
    }
    case "cite": {
      const citations = body.citations;
      if (!Array.isArray(citations)) throw new InvalidRequest("citations must be an array");
      return cite(citations as Citation[]);
    }
    case "surface":
      return surfaceList();
    default:
      throw new UnknownMethod(`unknown method ${method}`);
  }
}

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

lines.on("line", (line) => {
  if (line.trim().length === 0) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    send({ jsonrpc: "2.0", id: 0, error: { code: ERROR_CODES.parseError, message: "malformed json" } });
    return;
  }
  if (!isRecord(parsed) || typeof parsed.method !== "string") {
    const id = isRecord(parsed) && typeof parsed.id === "number" ? parsed.id : 0;
    fail(id, ERROR_CODES.invalidRequest, "invalid request");
    return;
  }
  const id = typeof parsed.id === "number" ? parsed.id : 0;
  void dispatch(parsed.method, parsed.params).then(
    (result) => send({ jsonrpc: "2.0", id, result }),
    (error: unknown) => {
      if (error instanceof UnknownMethod) fail(id, ERROR_CODES.methodNotFound, String(error.message));
      else if (error instanceof InvalidRequest) fail(id, ERROR_CODES.invalidRequest, String(error.message));
      else fail(id, ERROR_CODES.pluginError, error instanceof Error ? error.message : String(error));
    },
  );
});

lines.on("close", () => {
  process.exit(0);
});
