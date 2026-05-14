import { getJson, postJson } from "./http";

export type Freq = "1d" | "1w" | "1m";

export type StockAiSummary = {
  effective_asof: string;
  symbol: string;
  freq: Freq;
  overall_view: "bullish" | "neutral" | "bearish";
  risk_level: 1 | 2 | 3 | 4 | 5;
  key_levels: Array<{ kind: "support" | "resistance" | "stop_loss"; price: number | null; note: string }>;
  signals: Array<{ strategy: "左侧埋伏" | "右侧确认" | "超短反转"; status: "hit" | "near" | "miss"; why: string[] }>;
  risk_points: string[];
  action_rules: string[];
  evidence_note?: string;
  snapshot_json?: Record<string, unknown>;
  reasons_json?: Record<string, unknown>;
};

export type StockAiAnswer = {
  request_id: string;
  effective_asof: string;
  symbol: string;
  freq: Freq;
  text: string;
  bullets: string[];
  evidence: Array<{ source: string; fields: string[] }>;
};

export type StockAiMessage = { role: "user" | "assistant"; content: string };

export type StockHotNewsItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  summary: string;
  tags: string[];
  sentiment: "利好" | "利空" | "中性";
  importance_score: number;
  importance_level: "高" | "中" | "低";
  importance_reason: string;
};

export async function getStockHotNews(limit = 30): Promise<{
  items: StockHotNewsItem[];
  fetched_at: string;
  sources: string[];
  diagnostics?: Array<{ source: string; ok: boolean; count: number; error?: string }>;
}> {
  return getJson(`/api/stocks/news/hot?limit=${encodeURIComponent(String(limit))}`, { timeoutMs: 20_000 });
}

export async function postStockHotNewsSummary(args: {
  items: Array<{ title: string; summary?: string | null; source: string }>;
}): Promise<{ ok: boolean; text: string; model: string; based_on: number }> {
  return postJson("/api/stocks/news/hot/summary", args, { timeoutMs: 120_000 });
}


export async function createStockAiAnalysis(symbol: string, args: { asof: "today" | string; freq: Freq }): Promise<{
  ai_analysis_id: number;
  effective_asof: string;
  freq: Freq;
  summary: StockAiSummary;
}> {
  return postJson(`/api/symbols/${encodeURIComponent(symbol)}/ai-analyses`, args);
}

/**
 * 流式创建 AI 解读：边收 phase（cache/evidence/preview/llm/done）边渲染。
 */
export async function streamCreateStockAiAnalysis(
  symbol: string,
  args: { asof: "today" | string; freq: Freq },
  opts: {
    onPhase?: (p: "cache" | "evidence" | "preview" | "llm") => void;
    onPreview?: (p: { effective_asof: string; evidence: Record<string, unknown> }) => void;
    onDelta?: (d: string) => void;
    signal?: AbortSignal;
  } = {}
): Promise<{
  ai_analysis_id: number;
  effective_asof: string;
  freq: Freq;
  summary: StockAiSummary;
  cached?: boolean;
}> {
  const url = `/api/symbols/${encodeURIComponent(symbol)}/ai-analyses/stream`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(args),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw new Error(`stream_failed:${res.status}:${t.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  let done: any = null;
  let lastErr = "";
  while (true) {
    const { value, done: d } = await reader.read();
    if (d) break;
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
          if (obj.phase) {
            opts.onPhase?.(obj.phase);
            continue;
          }
          if (obj.evidence) {
            opts.onPreview?.({ effective_asof: String(obj.effective_asof || ""), evidence: obj.evidence });
            continue;
          }
          if (typeof obj.delta === "string") {
            opts.onDelta?.(obj.delta);
            continue;
          }
          if (obj.error) {
            lastErr = String(obj.error);
            continue;
          }
          if (obj.done) {
            done = obj;
          }
        } catch {
          // ignore partial json
        }
      }
    }
  }
  if (!done) throw new Error(lastErr || "stream_no_done");
  return done;
}

export async function askStockAi(aiAnalysisId: number, question: string): Promise<{ ai_analysis_id: number; answer: StockAiAnswer }> {
  return postJson(`/api/ai-analyses/${encodeURIComponent(String(aiAnalysisId))}/messages`, { question });
}

/**
 * 流式追问：onDelta 接收增量文本，结束时返回完整 text 与 request_id。
 * 取消请使用外部传入的 AbortSignal。
 */
export async function streamAskStockAi(
  aiAnalysisId: number,
  question: string,
  opts: {
    onDelta: (delta: string) => void;
    onMeta?: (meta: { request_id: string; symbol: string; freq: Freq; effective_asof: string }) => void;
    signal?: AbortSignal;
  }
): Promise<{ text: string; request_id: string }> {
  const url = `/api/ai-analyses/${encodeURIComponent(String(aiAnalysisId))}/messages/stream`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ question }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw new Error(`stream_failed:${res.status}:${t.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  let full = "";
  let request_id = "";
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
          if (obj.meta && opts.onMeta) {
            opts.onMeta({
              request_id: String(obj.request_id || ""),
              symbol: String(obj.symbol || ""),
              freq: String(obj.freq || "1d") as Freq,
              effective_asof: String(obj.effective_asof || ""),
            });
            request_id = String(obj.request_id || request_id);
            continue;
          }
          if (typeof obj.delta === "string") {
            full += obj.delta;
            opts.onDelta(obj.delta);
            continue;
          }
          if (obj.done) {
            if (typeof obj.text === "string" && obj.text) full = obj.text;
            if (obj.request_id) request_id = String(obj.request_id);
          }
          if (obj.error) throw new Error(String(obj.error));
        } catch (e) {
          if (e instanceof Error && /^stream/.test(e.message)) throw e;
          // ignore JSON parse errors of partial chunks
        }
      }
    }
  }
  return { text: full, request_id };
}

export async function getStockAiAnalysis(aiAnalysisId: number): Promise<{
  ai_analysis: {
    id: number;
    user_id: number;
    symbol: string;
    effective_asof: string;
    freq: Freq;
    request_json: Record<string, unknown>;
    response_json: StockAiSummary;
    created_at: string;
  };
  messages: StockAiMessage[];
}> {
  return getJson(`/api/ai-analyses/${encodeURIComponent(String(aiAnalysisId))}`);
}

export async function getRecentStockAiAnalysis(
  symbol: string,
  opts?: { freq?: Freq; withMessages?: boolean }
): Promise<{
  ai_analysis: {
    id: number;
    user_id: number;
    symbol: string;
    effective_asof: string;
    freq: Freq;
    request_json: Record<string, unknown>;
    response_json: StockAiSummary;
    created_at: string;
  } | null;
  messages: StockAiMessage[];
}> {
  const qs = new URLSearchParams();
  if (opts?.freq) qs.set("freq", opts.freq);
  if (opts?.withMessages === false) qs.set("with_messages", "0");
  const q = qs.toString();
  return getJson(
    `/api/symbols/${encodeURIComponent(symbol)}/ai-analyses/recent${q ? `?${q}` : ""}`
  );
}

export type Candle = { t: string; open: number; high: number; low: number; close: number; vol: number; amount: number };

export type StockSnapshot = {
  ts_code: string;
  name: string | null;
  asof: string;
  industry: string | null;
  area: string | null;
  pct_chg_1d: number | null;
  pct_chg_5d: number | null;
  pct_chg_20d: number | null;
  pe_ttm: number | null;
  pb?: number | null;
  ps_ttm?: number | null;
  dv_ttm?: number | null;
  turnover_rate: number | null;
  amount: number | null;
  total_mv: number | null;
  circ_mv: number | null;
};

export type StockFundamentals = {
  asof: string;
  report_end_date: string | null;
  pe_ttm: number | null;
  pb: number | null;
  ps_ttm: number | null;
  dv_ttm: number | null;
  roe: number | null;
  grossprofit_margin: number | null;
  netprofit_margin: number | null;
  yoy_sales: number | null;
  yoy_netprofit: number | null;
  debt_to_assets: number | null;
  notes?: string;
};

export type StrategySignal = {
  strategy: "左侧埋伏" | "右侧确认" | "超短反转";
  status: "hit" | "near" | "miss";
  why: string[];
};

export async function getSymbolAnalysis(symbol: string): Promise<{
  symbol: string;
  effective_asof: string;
  snapshot_json: StockSnapshot;
  fundamentals_json?: StockFundamentals;
  signals: StrategySignal[];
  reasons_json: Record<string, unknown>;
  key_levels?: Array<{ kind: "support" | "resistance" | "stop_loss"; price: number | null; note: string }>;
}> {
  return getJson(`/api/symbols/${encodeURIComponent(symbol)}/analysis`);
}

/** 仅基本面：与 analysis 并行触发，避免基本面慢查询拖累首屏。 */
export async function getSymbolFundamentals(symbol: string): Promise<{ symbol: string; fundamentals_json: StockFundamentals }> {
  return getJson(`/api/symbols/${encodeURIComponent(symbol)}/fundamentals`);
}

export async function getKlines(args: {
  symbol: string;
  from: string;
  to: string;
  freq: Freq;
  adjust: "hfq" | "qfq" | "none";
}): Promise<{ symbol: string; freq: Freq; adjust: string; candles: Candle[] }> {
  const qs = new URLSearchParams({ from: args.from, to: args.to, freq: args.freq, adjust: args.adjust }).toString();
  return getJson(`/api/symbols/${encodeURIComponent(args.symbol)}/klines?${qs}`);
}

// ---------- K 线本地缓存（增量拉取） ----------
// 同 symbol+freq+adjust 24h 内复用：命中时只补「上次最后交易日 → 今天」段并合并去重。
type KlineCacheEntry = {
  ts: number;
  symbol: string;
  freq: Freq;
  adjust: string;
  from: string;
  to: string;
  candles: Candle[];
};

const KL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const KL_CACHE_PREFIX = "klc:";

function klCacheKey(symbol: string, freq: Freq, adjust: string) {
  return `${KL_CACHE_PREFIX}${symbol}:${freq}:${adjust}`;
}

function readKlCache(symbol: string, freq: Freq, adjust: string): KlineCacheEntry | null {
  try {
    const raw = sessionStorage.getItem(klCacheKey(symbol, freq, adjust));
    if (!raw) return null;
    const obj = JSON.parse(raw) as KlineCacheEntry;
    if (!obj || !Array.isArray(obj.candles)) return null;
    if (Date.now() - Number(obj.ts || 0) > KL_CACHE_TTL_MS) return null;
    return obj;
  } catch {
    return null;
  }
}

function writeKlCache(entry: KlineCacheEntry) {
  try {
    sessionStorage.setItem(klCacheKey(entry.symbol, entry.freq, entry.adjust), JSON.stringify(entry));
  } catch {
    // quota exceeded etc, ignore
  }
}

function ymdToYmdDash(ymd8or10: string): string {
  const s = String(ymd8or10 || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : s;
}

function nextDayYmdDash(ymdDash: string): string {
  const d = new Date(`${ymdDash}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymdDash;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * 带本地缓存的 K 线拉取：
 * - 缓存内时间窗覆盖请求 [from, to] 时直接复用切片。
 * - 否则只增量拉「缓存末日次日 → to」，与缓存合并去重再返回。
 */
export async function getKlinesCached(args: {
  symbol: string;
  from: string;
  to: string;
  freq: Freq;
  adjust: "hfq" | "qfq" | "none";
}): Promise<{ symbol: string; freq: Freq; adjust: string; candles: Candle[]; cache?: "hit" | "incremental" | "miss" }> {
  const fromDash = ymdToYmdDash(args.from);
  const toDash = ymdToYmdDash(args.to);
  const cached = readKlCache(args.symbol, args.freq, args.adjust);

  // 完全命中：缓存窗口覆盖请求窗口，且至少有一条数据
  if (cached && cached.from <= fromDash && cached.to >= toDash && cached.candles.length) {
    const slice = cached.candles.filter((c) => {
      const t = ymdToYmdDash(String(c.t));
      return t >= fromDash && t <= toDash;
    });
    return { symbol: args.symbol, freq: args.freq, adjust: args.adjust, candles: slice, cache: "hit" };
  }

  // 增量：缓存覆盖了 from 端，仅末端缺失
  if (cached && cached.from <= fromDash && cached.candles.length && cached.to < toDash) {
    const incFrom = nextDayYmdDash(cached.to);
    if (incFrom <= toDash) {
      try {
        const inc = await getKlines({ ...args, from: incFrom, to: toDash });
        const map = new Map<string, Candle>();
        for (const c of cached.candles) map.set(String(c.t), c);
        for (const c of inc.candles || []) map.set(String(c.t), c);
        const merged = Array.from(map.values()).sort((a, b) => String(a.t).localeCompare(String(b.t)));
        const newTo = merged.length ? ymdToYmdDash(String(merged[merged.length - 1].t)) : toDash;
        writeKlCache({
          ts: Date.now(),
          symbol: args.symbol,
          freq: args.freq,
          adjust: args.adjust,
          from: cached.from,
          to: newTo,
          candles: merged,
        });
        const slice = merged.filter((c) => {
          const t = ymdToYmdDash(String(c.t));
          return t >= fromDash && t <= toDash;
        });
        return { symbol: args.symbol, freq: args.freq, adjust: args.adjust, candles: slice, cache: "incremental" };
      } catch {
        // fallback 全量
      }
    }
  }

  // miss：全量拉
  const full = await getKlines(args);
  if (full.candles?.length) {
    const sorted = [...full.candles].sort((a, b) => String(a.t).localeCompare(String(b.t)));
    writeKlCache({
      ts: Date.now(),
      symbol: args.symbol,
      freq: args.freq,
      adjust: args.adjust,
      from: fromDash,
      to: ymdToYmdDash(String(sorted[sorted.length - 1].t)),
      candles: sorted,
    });
  }
  return { ...full, cache: "miss" };
}

// ---------- 指标本地缓存（与 K 线缓存独立，按 symbol+freq 24h） ----------
export type IndicatorsPayload = {
  symbol: string;
  freq: Freq;
  times: string[];
  ma: Record<string, Array<number | null>>;
  ema: Record<string, Array<number | null>>;
  macd: { dif: Array<number | null>; dea: Array<number | null>; hist: Array<number | null> };
  rsi: Record<string, Array<number | null>>;
  bollinger: { up: Array<number | null>; mid: Array<number | null>; low: Array<number | null> };
  kdj: { k: Array<number | null>; d: Array<number | null>; j: Array<number | null> };
};

type IndicatorsCacheEntry = {
  ts: number;
  symbol: string;
  freq: Freq;
  from: string;
  to: string;
  payload: IndicatorsPayload;
};

const KLI_CACHE_PREFIX = "kli:";

function kliCacheKey(symbol: string, freq: Freq) {
  return `${KLI_CACHE_PREFIX}${symbol}:${freq}`;
}

function readKliCache(symbol: string, freq: Freq): IndicatorsCacheEntry | null {
  try {
    const raw = sessionStorage.getItem(kliCacheKey(symbol, freq));
    if (!raw) return null;
    const obj = JSON.parse(raw) as IndicatorsCacheEntry;
    if (!obj || !obj.payload) return null;
    if (Date.now() - Number(obj.ts || 0) > KL_CACHE_TTL_MS) return null;
    return obj;
  } catch {
    return null;
  }
}

function writeKliCache(entry: IndicatorsCacheEntry) {
  try {
    sessionStorage.setItem(kliCacheKey(entry.symbol, entry.freq), JSON.stringify(entry));
  } catch {
    // ignore quota
  }
}

export async function getIndicators(args: { symbol: string; from: string; to: string; freq: Freq }): Promise<IndicatorsPayload> {
  const qs = new URLSearchParams({ from: args.from, to: args.to, freq: args.freq }).toString();
  return getJson(`/api/symbols/${encodeURIComponent(args.symbol)}/indicators?${qs}`);
}

/** 带本地缓存的指标拉取（窗口完全覆盖时复用，否则全量重拉）。 */
export async function getIndicatorsCached(args: {
  symbol: string;
  from: string;
  to: string;
  freq: Freq;
}): Promise<IndicatorsPayload & { cache?: "hit" | "miss" }> {
  const fromDash = ymdToYmdDash(args.from);
  const toDash = ymdToYmdDash(args.to);
  const cached = readKliCache(args.symbol, args.freq);
  if (cached && cached.from <= fromDash && cached.to >= toDash) {
    return { ...cached.payload, cache: "hit" };
  }
  const payload = await getIndicators(args);
  const lastTime = payload.times?.length ? ymdToYmdDash(String(payload.times[payload.times.length - 1])) : toDash;
  writeKliCache({ ts: Date.now(), symbol: args.symbol, freq: args.freq, from: fromDash, to: lastTime, payload });
  return { ...payload, cache: "miss" };
}

// ---------- Symbol master 本地缓存（即时搜索） ----------
export type SymbolMasterSlim = {
  ts_code: string;
  code: string;
  name: string;
  exchange: "SH" | "SZ";
  py: string;
  pi: string;
};

const SM_CACHE_KEY = "sm:v1";
const SM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type SmCacheBlob = { version: number; ts: number; items: SymbolMasterSlim[] };

function readSmCache(): SmCacheBlob | null {
  try {
    const raw = localStorage.getItem(SM_CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as SmCacheBlob;
    if (!obj || !Array.isArray(obj.items) || !obj.items.length) return null;
    return obj;
  } catch {
    return null;
  }
}

function writeSmCache(blob: SmCacheBlob) {
  try {
    localStorage.setItem(SM_CACHE_KEY, JSON.stringify(blob));
  } catch {
    // ignore quota
  }
}

let smInflight: Promise<SymbolMasterSlim[]> | null = null;

/** 拉取/复用 symbol master 全量。命中本地缓存且未过期则不请求；过期则带 If-None-Match 校验。 */
export async function ensureSymbolMaster(): Promise<SymbolMasterSlim[]> {
  const cached = readSmCache();
  const fresh = cached && Date.now() - cached.ts < SM_TTL_MS;
  if (fresh) return cached!.items;
  if (smInflight) return smInflight;

  smInflight = (async () => {
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (cached) headers["If-None-Match"] = `W/"sm-${cached.version}"`;
      const res = await fetch("/api/symbols/master", { credentials: "include", headers });
      if (res.status === 304 && cached) {
        writeSmCache({ ...cached, ts: Date.now() });
        return cached.items;
      }
      if (!res.ok) {
        if (cached) return cached.items;
        throw new Error(`master_failed:${res.status}`);
      }
      const j = (await res.json()) as { version: number; items: SymbolMasterSlim[] };
      writeSmCache({ version: j.version, ts: Date.now(), items: j.items || [] });
      return j.items || [];
    } finally {
      smInflight = null;
    }
  })();
  return smInflight;
}

/** 本地即时匹配（分数排序）：代码前缀 > 名称包含 > 拼音首字母 > 拼音全拼。未命中返回空数组。 */
export function searchSymbolsLocal(items: SymbolMasterSlim[], q: string, limit = 20): SymbolMasterSlim[] {
  const qq = String(q || "").trim().toLowerCase();
  if (!qq) return [];
  const digits = qq.replace(/\D/g, "");
  const isCodeLike = digits.length >= 3;
  const hits: Array<{ score: number; item: SymbolMasterSlim }> = [];
  for (const it of items) {
    const code = it.code;
    const name = it.name.toLowerCase();
    let score = -1;
    if (digits && code.startsWith(digits)) score = 1000 - (code.length - digits.length);
    else if (isCodeLike && code.includes(digits)) score = 700;
    else if (name.includes(qq)) score = qq.length >= 2 ? 650 + Math.min(50, qq.length) : 600;
    else if (it.pi && it.pi.startsWith(qq)) score = 560;
    else if (it.py && it.py.includes(qq)) score = 520;
    else if (it.pi && it.pi.includes(qq)) score = 480;
    if (score >= 0) hits.push({ score, item: it });
  }
  hits.sort((a, b) => b.score - a.score || a.item.ts_code.localeCompare(b.item.ts_code));
  return hits.slice(0, Math.max(1, Math.min(50, limit))).map((hit) => hit.item);
}
