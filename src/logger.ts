// stdio MCP servers must NEVER write to stdout except for JSON-RPC frames.
// All logging goes to stderr.

function emit(level: string, msg: string, extra?: unknown): void {
  const line = extra === undefined
    ? `[imagetalk-mcp] ${level} ${msg}`
    : `[imagetalk-mcp] ${level} ${msg} ${safeStringify(extra)}`;
  process.stderr.write(line + "\n");
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const log = {
  info: (msg: string, extra?: unknown) => emit("INFO ", msg, extra),
  warn: (msg: string, extra?: unknown) => emit("WARN ", msg, extra),
  error: (msg: string, extra?: unknown) => emit("ERROR", msg, extra),
};
