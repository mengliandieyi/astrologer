import { getJson, postJson, delJson } from "./http";

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
  /** 来自 stock_basic（symbol master 缓存），与 DB 无关 */
  industry?: string | null;
  /** 市场类型，如主板/创业板等（Tushare market） */
  market?: string | null;
  score: number | null;
  snapshot_json: Record<string, unknown>;
  reasons_json: Record<string, unknown>;
  created_at: string;
};

export async function listScreenerRuns(limit = 20): Promise<{ runs: ScreenerRun[] }> {
  const qs = new URLSearchParams({ limit: String(limit) }).toString();
  return getJson(`/api/stocks/screener/runs?${qs}`);
}

export async function deleteScreenerRun(run_id: number): Promise<{ ok: boolean }> {
  return delJson(`/api/stocks/screener/runs/${encodeURIComponent(String(run_id))}`);
}

export async function runScreener(args: {
  strategy: ScreenerStrategy;
  freq: "1d" | "1w" | "1m";
  topN?: number;
  lookbackDays?: number;
}): Promise<{ run_id: number }> {
  return postJson("/api/stocks/screener/run", args, { timeoutMs: 300_000 });
}

export type ScreenerResultsSort = "score" | "symbol" | "created_at";
export type ScreenerResultsOrder = "asc" | "desc";

export async function getScreenerResults(args: {
  run_id: number;
  limit?: number;
  offset?: number;
  sort?: ScreenerResultsSort;
  order?: ScreenerResultsOrder;
  filter_miss?: boolean;
  /** 行业子串（不区分大小写） */
  industry_q?: string;
  /** 逗号分隔行业精确匹配 */
  industry_in?: string;
  /** 逗号分隔上市板（Tushare market）精确匹配 */
  market_in?: string;
  score_min?: number;
  score_max?: number;
  /** 逗号分隔：hit,near,miss；不传或 all 表示不过滤 */
  status_in?: string;
}): Promise<{
  run_id: number;
  items: ScreenerResult[];
  total: number;
  limit: number;
  offset: number;
  sort: ScreenerResultsSort;
  order: ScreenerResultsOrder;
}> {
  const qs = new URLSearchParams({
    limit: String(args.limit ?? 50),
    offset: String(args.offset ?? 0),
    sort: args.sort ?? "score",
    order: args.order ?? "desc",
  });
  if (args.filter_miss === false) qs.set("filter_miss", "0");
  const iq = String(args.industry_q ?? "").trim();
  if (iq) qs.set("industry_q", iq);
  const ii = String(args.industry_in ?? "").trim();
  if (ii) qs.set("industry_in", ii);
  const mi = String(args.market_in ?? "").trim();
  if (mi) qs.set("market_in", mi);
  if (args.score_min != null && Number.isFinite(args.score_min)) qs.set("score_min", String(args.score_min));
  if (args.score_max != null && Number.isFinite(args.score_max)) qs.set("score_max", String(args.score_max));
  const st = String(args.status_in ?? "").trim();
  if (st && st !== "all") qs.set("status_in", st);
  return getJson(`/api/stocks/screener/runs/${encodeURIComponent(String(args.run_id))}/results?${qs.toString()}`);
}

export function buildScreenerResultsCsvUrl(args: {
  run_id: number;
  sort?: ScreenerResultsSort;
  order?: ScreenerResultsOrder;
  filter_miss?: boolean;
  industry_q?: string;
  industry_in?: string;
  market_in?: string;
  score_min?: number;
  score_max?: number;
  status_in?: string;
}): string {
  const qs = new URLSearchParams({
    sort: args.sort ?? "score",
    order: args.order ?? "desc",
  });
  if (args.filter_miss === false) qs.set("filter_miss", "0");
  const iq = String(args.industry_q ?? "").trim();
  if (iq) qs.set("industry_q", iq);
  const ii = String(args.industry_in ?? "").trim();
  if (ii) qs.set("industry_in", ii);
  const mi = String(args.market_in ?? "").trim();
  if (mi) qs.set("market_in", mi);
  if (args.score_min != null && Number.isFinite(args.score_min)) qs.set("score_min", String(args.score_min));
  if (args.score_max != null && Number.isFinite(args.score_max)) qs.set("score_max", String(args.score_max));
  const st = String(args.status_in ?? "").trim();
  if (st && st !== "all") qs.set("status_in", st);
  return `/api/stocks/screener/runs/${encodeURIComponent(String(args.run_id))}/results.csv?${qs.toString()}`;
}

export type SyncQuotesResult = {
  ok: boolean;
  start_date: string;
  end_date: string;
  trade_dates_attempted: string[];
  trade_dates_with_data: string[];
  rows_upserted: number;
  errors: Array<{ trade_date: string; error: string }>;
};

export async function syncQuotes(args?: { start?: string; end?: string; lastNDays?: number; lastNTradeDays?: number }): Promise<SyncQuotesResult> {
  return postJson("/api/stocks/quotes/sync", args || {}, { timeoutMs: 600_000 });
}

export type SyncProgress = {
  running: boolean;
  start_date?: string;
  end_date?: string;
  total?: number;
  done?: number;
  current_date?: string;
  rows_upserted?: number;
  errors?: number;
  started_at?: string;
  last_finished_at?: string;
  last_summary?: string;
};

export async function getQuotesProgress(): Promise<SyncProgress> {
  return getJson("/api/stocks/quotes/progress");
}

/**
 * SSE 流式触发行情同步：立即返回，由服务端持续推 progress 事件，规避长 POST 504。
 * 若已有同步在跑，会自动 attach 当前进度，不会重复触发。
 */
export async function streamSyncQuotes(
  args: { start?: string; end?: string; lastNDays?: number; lastNTradeDays?: number },
  opts: {
    onPhase?: (p: "start" | "attached") => void;
    onProgress?: (p: SyncProgress) => void;
    signal?: AbortSignal;
  } = {}
): Promise<{ progress: SyncProgress }> {
  const res = await fetch("/api/stocks/quotes/sync/stream", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(args || {}),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw new Error(`stream_failed:${res.status}:${t.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  let last: SyncProgress | null = null;
  let lastErr = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          const obj = JSON.parse(payload);
          if (obj.phase === "start" || obj.phase === "attached") {
            opts.onPhase?.(obj.phase);
            if (obj.progress) {
              last = obj.progress as SyncProgress;
              opts.onProgress?.(last);
            }
            continue;
          }
          if (obj.progress) {
            last = obj.progress as SyncProgress;
            opts.onProgress?.(last);
          }
          if (obj.error) lastErr = String(obj.error);
          if (obj.done) {
            if (obj.progress) last = obj.progress as SyncProgress;
            return { progress: last || { running: false } };
          }
        } catch {
          // ignore
        }
      }
    }
  }
  if (lastErr) throw new Error(lastErr);
  return { progress: last || { running: false } };
}
