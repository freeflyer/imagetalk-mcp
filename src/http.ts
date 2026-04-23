import type { Config } from "./config.js";

/**
 * A backend-reported error. Carries either an envelope message (business-level)
 * or an HTTP-level message (validation, crash, binary 404, etc.). Tool handlers
 * catch this and surface it to the MCP client as an isError tool result.
 */
export class BackendError extends Error {
  constructor(
    public readonly kind: "envelope" | "http" | "network" | "timeout",
    public readonly statusCode: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

type Envelope = { is_error: boolean; error?: string; [k: string]: unknown };

export class HttpClient {
  constructor(private readonly config: Config) {}

  /** Call an envelope endpoint. Returns the full body on success, throws BackendError on is_error=true. */
  async envelope(
    method: "GET" | "POST" | "DELETE",
    path: string,
    opts: { query?: Record<string, string>; body?: unknown; timeoutMs?: number } = {},
  ): Promise<Envelope> {
    const res = await this.request(method, path, {
      query: opts.query,
      body: opts.body,
      timeoutMs: opts.timeoutMs,
      accept: "application/json",
    });

    if (!res.ok) {
      const text = await safeText(res);
      throw new BackendError("http", res.status, `HTTP ${res.status}: ${truncate(text, 500)}`);
    }

    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch (err) {
      throw new BackendError("http", res.status, `Invalid JSON from backend: ${(err as Error).message}`);
    }

    if (!isEnvelope(parsed)) {
      throw new BackendError("http", res.status, `Unexpected response shape (no is_error field)`);
    }
    if (parsed.is_error === true) {
      throw new BackendError("envelope", res.status, parsed.error ?? "Unknown backend error");
    }
    return parsed;
  }

  /** Call a non-envelope JSON endpoint (health/live, health/ready). */
  async plainJson(path: string, opts: { timeoutMs?: number } = {}): Promise<{ status: number; body: unknown }> {
    const res = await this.request("GET", path, { timeoutMs: opts.timeoutMs, accept: "application/json" });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* empty body is tolerated */
    }
    return { status: res.status, body };
  }

  /** Fetch raw bytes (image file). Throws BackendError on 404 / other non-2xx. */
  async getBinary(path: string, opts: { timeoutMs?: number } = {}): Promise<{ bytes: Buffer; mimeType: string }> {
    const res = await this.request("GET", path, { timeoutMs: opts.timeoutMs });
    if (!res.ok) {
      const text = await safeText(res);
      throw new BackendError("http", res.status, `HTTP ${res.status}: ${truncate(text, 300)}`);
    }
    const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
    const arrayBuf = await res.arrayBuffer();
    return { bytes: Buffer.from(arrayBuf), mimeType };
  }

  private async request(
    method: "GET" | "POST" | "DELETE",
    path: string,
    opts: { query?: Record<string, string>; body?: unknown; timeoutMs?: number; accept?: string },
  ): Promise<Response> {
    const url = this.buildUrl(path, opts.query);
    const timeoutMs = opts.timeoutMs ?? this.config.requestTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {};
    if (opts.accept) headers["accept"] = opts.accept;
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.body);
    }

    try {
      return await fetch(url, { method, headers, body, signal: controller.signal });
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") {
        throw new BackendError("timeout", undefined, `Request timed out after ${timeoutMs}ms: ${method} ${path}`);
      }
      throw new BackendError("network", undefined, `Network error: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private buildUrl(path: string, query?: Record<string, string>): string {
    const url = new URL(path, this.config.backendUrl + "/");
    if (query) {
      for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    }
    return url.toString();
  }
}

function isEnvelope(v: unknown): v is Envelope {
  return typeof v === "object" && v !== null && "is_error" in v && typeof (v as { is_error: unknown }).is_error === "boolean";
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}
