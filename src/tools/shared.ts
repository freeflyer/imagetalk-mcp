import { BackendError } from "../http.js";
import { log } from "../logger.js";

export type ToolResult = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

/** Serialize any payload as a JSON text block + structured content. */
export function jsonResult(payload: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

/** Plain text result (short human-readable). */
export function textResult(text: string): ToolResult {
  return {
    content: [{ type: "text", text }],
  };
}

/** Error tool result: surfaces the backend's business error to the LLM. */
export function errorResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

/** Wrap a tool handler so BackendError becomes an isError result and other throws are logged. */
export function tryTool<A>(handler: (args: A) => Promise<ToolResult>) {
  return async (args: A): Promise<ToolResult> => {
    try {
      return await handler(args);
    } catch (err) {
      if (err instanceof BackendError) {
        return errorResult(formatBackendError(err));
      }
      log.error("unhandled tool error", (err as Error).stack ?? String(err));
      return errorResult(`Unexpected error: ${(err as Error).message}`);
    }
  };
}

function formatBackendError(err: BackendError): string {
  switch (err.kind) {
    case "envelope":
      return `Backend rejected request: ${err.message}`;
    case "http":
      return `Backend HTTP error: ${err.message}`;
    case "timeout":
      return `Backend request timed out: ${err.message}`;
    case "network":
      return `Cannot reach backend: ${err.message}`;
  }
}
