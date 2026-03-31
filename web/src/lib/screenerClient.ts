function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit & { timeoutMs?: number } = {}) {
  const timeoutMs = init.timeoutMs ?? 8000;
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  const merged: RequestInit = { ...init, signal: ctrl.signal };
  delete (merged as any).timeoutMs;
  return fetch(input, merged).finally(() => window.clearTimeout(t));
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    timeoutMs: 60_000, // screening run can take longer
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetchWithTimeout(url, { cache: "no-store", timeoutMs: 20_000 });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

export type ScreenerStrategy = "左侧埋伏" | "右侧确认" | "超短反转";
export type ScreenerRunStatus = "running" | "success" | "failed";

export type ScreenerRun = {
  id: number;
  user_id: number;
  strategy: ScreenerStrategy;
  effective_asof: string;
  freq: "1d" | "1w" | "1m";
  params_json: Record<string, unknown>;
  status: ScreenerRunStatus;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export type ScreenerResult = {
  id: number;
  run_id: number;
  symbol: string;
  name: string | null;
  score: number | null;
  snapshot_json: Record<string, unknown>;
  reasons_json: Record<string, unknown>;
  created_at: string;
};

export async function listScreenerRuns(limit = 20): Promise<{ runs: ScreenerRun[] }> {
  const qs = new URLSearchParams({ limit: String(limit) }).toString();
  return getJson(`/api/stocks/screener/runs?${qs}`);
}

export async function runScreener(args: {
  strategy: ScreenerStrategy;
  freq: "1d" | "1w" | "1m";
  topN?: number;
  lookbackDays?: number;
}): Promise<{ run_id: number }> {
  return postJson("/api/stocks/screener/run", args);
}

export async function getScreenerResults(args: { run_id: number; limit?: number }): Promise<{ run_id: number; items: ScreenerResult[] }> {
  const qs = new URLSearchParams({ limit: String(args.limit ?? 50) }).toString();
  return getJson(`/api/stocks/screener/runs/${encodeURIComponent(String(args.run_id))}/results?${qs}`);
}

