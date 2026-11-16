// The package's one canonical runtime shape guard. JSON-RPC params and config files are
// untyped at the boundary; every field is then checked individually with `typeof` /
// `Array.isArray` / `in` before use.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
