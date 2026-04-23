export interface Config {
  backendUrl: string;
  requestTimeoutMs: number;
  searchTimeoutMs: number;
}

export function loadConfig(): Config {
  const backendUrl = (process.env.IMAGETALK_BACKEND_URL ?? "http://localhost:8766").replace(/\/+$/, "");
  const requestTimeoutMs = parsePositiveInt(process.env.IMAGETALK_REQUEST_TIMEOUT_MS, 15_000);
  const searchTimeoutMs = parsePositiveInt(process.env.IMAGETALK_SEARCH_TIMEOUT_MS, 90_000);
  return { backendUrl, requestTimeoutMs, searchTimeoutMs };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
