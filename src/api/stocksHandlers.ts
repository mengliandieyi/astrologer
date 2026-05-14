import type express from "express";
import crypto from "node:crypto";
import { buildStockAiReply, buildStockAiSummary } from "../lib/stockAi.js";
import { qwenChatCompletion, qwenStreamChatCompletion } from "../lib/aiClient.js";
import { tushareQuery } from "../lib/tushareClient.js";
import { searchSymbolMaster, getAllSymbolMaster } from "../lib/symbolMaster.js";
import { bollinger, computeSignals, ema, kdj, macd, rsi, sma } from "../lib/stockSignals.js";
import { runStockScreener } from "../lib/stockScreener.js";
import { syncStockDaily, isQuotesSyncing, getQuotesSyncProgress } from "../lib/quotesSync.js";
import { fetchStockHotNews } from "../lib/stockHotNews.js";
import { normalizeNewsItemsForAi, summarizeStockHotNewsWithQwen } from "../lib/stockHotNewsAi.js";
import {
  createStockAiAnalysis,
  createStockAiMessage,
  getStockAiAnalysisById,
  getStockAiAnalysisByIdentity,
  getStockScreenerRunById,
  listStockAiAnalysesByUser,
  listStockAiMessages,
  applyScreenerFilterMiss,
  listAllStockScreenerResultsForRun,
  listStockScreenerRuns,
  deleteStockScreenerRunForUser,
  getStockDailyRange,
  type StoredStockScreenerResult,
} from "../lib/store.js";

type ScreenerRowEnriched = StoredStockScreenerResult & { industry: string | null; market: string | null };

type Freq = "1d" | "1w" | "1m";

function nowIso() {
  return new Date().toISOString();
}

function ymdToday() {
  return nowIso().slice(0, 10).replaceAll("-", "");
}

function fmtYmdDash(ymd: string): string {
  const m = String(ymd || "").match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function toUtcYmd(isoYmd: string): string {
  return String(isoYmd || "").trim().replaceAll("-", "");
}

type SymbolIndustrySnap = { industry: string | null; market: string | null };

async function buildTsCodeToIndustryMap(): Promise<Map<string, SymbolIndustrySnap>> {
  const { items } = await getAllSymbolMaster();
  const map = new Map<string, SymbolIndustrySnap>();
  for (const m of items) {
    const k = String(m.ts_code || "").trim().toUpperCase();
    if (!k) continue;
    map.set(k, { industry: m.industry ?? null, market: m.market ?? null });
  }
  return map;
}

/** 按 ts_code 匹配；失败时按 6 位代码回退（兼容少数存库格式差异） */
function attachScreenerIndustryFields<T extends { symbol: string }>(
  items: T[],
  map: Map<string, SymbolIndustrySnap>
): Array<T & { industry: string | null; market: string | null }> {
  const byCode = new Map<string, SymbolIndustrySnap>();
  for (const [k, v] of map) {
    const code = k.split(".")[0]?.trim();
    if (code && !byCode.has(code)) byCode.set(code, v);
  }
  return items.map((it) => {
    const raw = String(it.symbol || "").trim().toUpperCase();
    let hit: SymbolIndustrySnap | undefined = map.get(raw);
    if (!hit && raw.includes(".")) {
      const code = raw.split(".")[0];
      if (code) hit = byCode.get(code);
    }
    if (!hit && !raw.includes(".")) {
      const code = raw.replace(/\D/g, "").slice(0, 6) || raw;
      hit = byCode.get(code) ?? map.get(`${code}.SH`) ?? map.get(`${code}.SZ`) ?? map.get(`${code}.BJ`);
    }
    return { ...it, industry: hit?.industry ?? null, market: hit?.market ?? null };
  });
}

function parseScreenerQueryNum(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Query: status_in=hit 或 hit,near；缺省或 all 表示不按状态过滤。 */
function parseScreenerStatusIn(v: unknown): string[] | undefined {
  const s = v == null ? "" : String(v).trim().toLowerCase();
  if (!s || s === "all") return undefined;
  const parts = s.split(/[,|]/g).map((x) => x.trim()).filter(Boolean);
  const allow = new Set(["hit", "near", "miss"]);
  const out = parts.filter((p) => allow.has(p));
  return out.length ? out : undefined;
}

function parseScreenerIndustryIn(v: unknown): string[] | undefined {
  const s = v == null ? "" : String(v).trim();
  if (!s) return undefined;
  const out = Array.from(
    new Set(
      s
        .split(/[,|]/g)
        .map((x) => x.trim())
        .filter(Boolean)
    )
  ).slice(0, 100);
  return out.length ? out : undefined;
}

function parseScreenerMarketIn(v: unknown): string[] | undefined {
  const s = v == null ? "" : String(v).trim();
  if (!s) return undefined;
  const out = Array.from(
    new Set(
      s
        .split(/[,|]/g)
        .map((x) => x.trim())
        .filter(Boolean)
    )
  ).slice(0, 100);
  return out.length ? out : undefined;
}

async function buildFilteredScreenerRows(args: {
  run_id: number;
  sort: "score" | "symbol" | "created_at";
  order: "asc" | "desc";
  filterMiss: boolean;
  scoreMin?: number;
  scoreMax?: number;
  statusIn?: string[];
  industryQ?: string;
  industryIn?: string[];
  marketIn?: string[];
}): Promise<ScreenerRowEnriched[]> {
  const all = await listAllStockScreenerResultsForRun(args.run_id, args.sort, args.order);
  // 若用户显式要筛「未命中」，不能再先 applyScreenerFilterMiss 把 miss 全扔掉，否则状态/分数/行业筛会表现为「无效」。
  const statusNeedsMiss = Boolean(args.statusIn?.includes("miss"));
  const filterMissEffective = args.filterMiss && !statusNeedsMiss;
  const base = applyScreenerFilterMiss(all, filterMissEffective);
  const indMap = await buildTsCodeToIndustryMap();
  let rows: ScreenerRowEnriched[] = attachScreenerIndustryFields(base, indMap);
  if (args.scoreMin != null) rows = rows.filter((r) => r.score != null && r.score >= args.scoreMin!);
  if (args.scoreMax != null) rows = rows.filter((r) => r.score != null && r.score <= args.scoreMax!);
  if (args.statusIn?.length) {
    rows = rows.filter((r) => args.statusIn!.includes(String((r.snapshot_json as any)?.status ?? "")));
  }
  if (args.industryIn?.length) {
    const allow = new Set(args.industryIn.map((x) => x.trim()).filter(Boolean));
    rows = rows.filter((r) => allow.has(String(r.industry || "").trim()));
  }
  if (args.industryQ) {
    const q = args.industryQ.trim().toLowerCase();
    if (q) rows = rows.filter((r) => String(r.industry || "").toLowerCase().includes(q));
  }
  if (args.marketIn?.length) {
    const allow = new Set(args.marketIn.map((x) => x.trim()).filter(Boolean));
    rows = rows.filter((r) => allow.has(String(r.market || "").trim()));
  }
  return rows;
}

function computeKeyLevels(candlesAsc: Array<{ high: number; low: number; close: number }>) {
  const n = candlesAsc.length;
  const win = Math.min(20, n);
  const slice = candlesAsc.slice(n - win);
  const support = Math.min(...slice.map((x) => x.low));
  const resistance = Math.max(...slice.map((x) => x.high));
  const lastClose = candlesAsc[n - 1]?.close ?? null;
  const stop_loss = lastClose != null ? Math.min(support, lastClose * 0.97) : support;
  return [
    { kind: "support" as const, price: Number.isFinite(support) ? support : null, note: `近${win}根低点区间` },
    { kind: "resistance" as const, price: Number.isFinite(resistance) ? resistance : null, note: `近${win}根高点区间` },
    { kind: "stop_loss" as const, price: Number.isFinite(stop_loss) ? stop_loss : null, note: "参考止损" },
  ];
}

function parseYmd(ymd: string): Date {
  const m = String(ymd || "").match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return new Date(NaN);
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
}

function periodKey(d: Date, freq: Freq): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  if (freq === "1m") return `${y}-${String(m).padStart(2, "0")}`;
  // ISO week number
  const date = new Date(Date.UTC(y, d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function aggregateCandles(
  rowsAsc: Array<{ trade_date: string; open: number; high: number; low: number; close: number; vol: number; amount: number }>,
  freq: Freq
) {
  if (freq === "1d") return rowsAsc.map((r) => ({ ...r, t: r.trade_date }));
  const out: Array<{
    t: string;
    open: number;
    high: number;
    low: number;
    close: number;
    vol: number;
    amount: number;
  }> = [];
  let curKey = "";
  let cur: any = null;
  for (const r of rowsAsc) {
    const d = parseYmd(String(r.trade_date));
    const k = periodKey(d, freq);
    if (k !== curKey) {
      if (cur) out.push(cur);
      curKey = k;
      cur = {
        t: String(r.trade_date),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        vol: Number(r.vol),
        amount: Number(r.amount),
      };
      continue;
    }
    cur.t = String(r.trade_date);
    cur.high = Math.max(cur.high, Number(r.high));
    cur.low = Math.min(cur.low, Number(r.low));
    cur.close = Number(r.close);
    cur.vol += Number(r.vol);
    cur.amount += Number(r.amount);
  }
  if (cur) out.push(cur);
  return out;
}

function parseFreq(raw: unknown): Freq {
  const v = String(raw || "").trim();
  if (v === "1d" || v === "1w" || v === "1m") return v;
  return "1d";
}

function normalizeSymbol(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (!s) throw new Error("symbol_required");
  // Accept 600519 or 600519.SH / 000001.SZ
  const m = s.match(/^(\d{6})(?:\.(SH|SZ))?$/i);
  if (!m) throw new Error("symbol_invalid");
  const code = m[1];
  const suffix = (m[2] || guessExchangeSuffix(code)) as "SH" | "SZ";
  return `${code}.${suffix}`;
}

function guessExchangeSuffix(code6: string): "SH" | "SZ" {
  // Pragmatic: 6xxxxx -> SH, others -> SZ (covers most A-share)
  return code6.startsWith("6") ? "SH" : "SZ";
}

/** 准备单股 AI 解读所需的 evidence + 元信息（被同步/流式两条路径复用） */
async function prepareStockAiEvidence(args: { symbol: string; freq: Freq; effective_asof: string }) {
  const { symbol, freq } = args;
  const end = toUtcYmd(args.effective_asof || nowIso().slice(0, 10));
  const start = new Date(Date.now() - 900 * 24 * 3600 * 1000).toISOString().slice(0, 10).replaceAll("-", "");
  const dailyRows = await tushareQuery({
    api_name: "daily",
    params: { ts_code: symbol, start_date: start, end_date: end },
    fields: ["ts_code", "trade_date", "open", "high", "low", "close", "pre_close", "pct_chg", "vol", "amount"],
  });
  if (!dailyRows.length) throw new Error("no_market_data");
  dailyRows.sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
  const last = dailyRows[dailyRows.length - 1] as any;
  const effective_asof2 = fmtYmdDash(String(last.trade_date)) || args.effective_asof;

  const [basicRows, basicInfoRows] = await Promise.all([
    tushareQuery({
      api_name: "daily_basic",
      params: { ts_code: symbol, trade_date: String(last.trade_date) },
      fields: ["ts_code", "trade_date", "pe_ttm", "turnover_rate", "total_mv", "circ_mv"],
    }),
    tushareQuery({
      api_name: "stock_basic",
      params: { ts_code: symbol },
      fields: ["ts_code", "name", "industry", "area", "market", "exchange"],
    }),
  ]);
  const basic = (basicRows?.[0] as any) || {};
  const info = (basicInfoRows?.[0] as any) || {};
  const closes = dailyRows.map((r: any) => Number(r.close));
  const pct = (n0: number, n1: number) => (n0 > 0 ? ((n1 - n0) / n0) * 100 : null);
  const closeLast = Number(last.close);
  const close5 = closes.length >= 6 ? closes[closes.length - 6] : null;
  const close20 = closes.length >= 21 ? closes[closes.length - 21] : null;
  const snapshot_json = {
    ts_code: symbol,
    name: info?.name || null,
    asof: effective_asof2,
    industry: info?.industry || null,
    area: info?.area || null,
    pct_chg_1d: Number.isFinite(Number(last.pct_chg)) ? Number(last.pct_chg) : pct(Number(last.pre_close), closeLast),
    pct_chg_5d: close5 == null ? null : pct(Number(close5), closeLast),
    pct_chg_20d: close20 == null ? null : pct(Number(close20), closeLast),
    pe_ttm: basic?.pe_ttm != null ? Number(basic.pe_ttm) : null,
    turnover_rate: basic?.turnover_rate != null ? Number(basic.turnover_rate) : null,
    amount: last?.amount != null ? Number(last.amount) : null,
    total_mv: basic?.total_mv != null ? Number(basic.total_mv) : null,
    circ_mv: basic?.circ_mv != null ? Number(basic.circ_mv) : null,
  };
  const daily = dailyRows.map((r: any) => ({
    trade_date: String(r.trade_date),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    vol: Number(r.vol),
    amount: Number(r.amount),
  }));
  const candles = aggregateCandles(daily, freq).map((c) => ({
    t: c.t,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    vol: c.vol,
    amount: c.amount,
  }));
  const { signals, reasons_json } = computeSignals({ candlesAsc: candles });
  const key_levels = computeKeyLevels(candles);
  const slimSignals = signals.map((s: any) => ({
    strategy: s.strategy,
    status: s.status,
    score: s.score,
    why: Array.isArray(s.why) ? s.why.slice(0, 4) : [],
  }));
  const slimReasons = {
    asof: (reasons_json as any)?.asof,
    features: (reasons_json as any)?.features,
    scores: (reasons_json as any)?.scores,
  };
  const evidence = { snapshot_json, signals: slimSignals, reasons_json: slimReasons, key_levels };
  return { effective_asof2, evidence, snapshot_json, slimSignals, slimReasons, key_levels };
}

function buildAiSummaryPrompt(args: { symbol: string; freq: Freq; effective_asof: string; evidence: unknown }) {
  return [
    {
      role: "system" as const,
      content:
        "你是严谨的A股研判助手。输出必须是严格JSON（不要Markdown，不要解释），字段需匹配给定schema。数值保留合理小数，字符串用简体中文。",
    },
    {
      role: "user" as const,
      content: [
        "请基于以下证据，生成 StockAiSummary 的 JSON：",
        "",
        "schema（必须完全匹配，缺失字段用空数组/空字符串/null）：",
        `{
  "effective_asof": "YYYY-MM-DD",
  "symbol": "000001.SZ",
  "freq": "1d|1w|1m",
  "overall_view": "bullish|neutral|bearish",
  "risk_score": 0,
  "key_levels": [{"kind":"support|resistance|stop_loss","price":number|null,"note":"string"}],
  "signals": [{"strategy":"左侧埋伏|右侧确认|超短反转","status":"hit|near|miss","why":["string"]}],
  "risk_points": ["string"],
  "action_rules": ["string"],
  "evidence_note": "string",
  "snapshot_json": {},
  "reasons_json": {}
}`,
        "",
        `symbol=${args.symbol}`,
        `freq=${args.freq}`,
        `effective_asof=${args.effective_asof}`,
        "",
        "evidence_json=" + JSON.stringify(args.evidence),
      ].join("\n"),
    },
  ];
}

function parseAiSummaryText(raw: string): any | null {
  try {
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    for (const t of [stripped, raw]) {
      try {
        const obj = JSON.parse(t);
        if (obj && typeof obj === "object") return obj;
      } catch {
        // continue
      }
    }
    const m = stripped.match(/\{[\s\S]*\}/);
    if (m?.[0]) {
      const obj = JSON.parse(m[0]);
      if (obj && typeof obj === "object") return obj;
    }
  } catch {
    // ignore
  }
  return null;
}

/** 图表用日线：合并 Tushare 全窗与本地缓存；仅缓存一段时不再误以为「已是全量」。 */
type ChartDailyRow = {
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
  amount: number;
};

function normalizeChartTradeDate(d: string): string {
  return String(d || "").replaceAll("-", "").slice(0, 8);
}

function mergeChartDailyRows(apiRows: ChartDailyRow[], cacheRows: ChartDailyRow[]): ChartDailyRow[] {
  const m = new Map<string, ChartDailyRow>();
  for (const r of apiRows) {
    const k = normalizeChartTradeDate(r.trade_date);
    m.set(k, { ...r, trade_date: k });
  }
  for (const r of cacheRows) {
    const k = normalizeChartTradeDate(r.trade_date);
    m.set(k, { ...r, trade_date: k });
  }
  return Array.from(m.values()).sort((a, b) => a.trade_date.localeCompare(b.trade_date));
}

function chartDailySpanIncomplete(rows: ChartDailyRow[], start: string, end: string): boolean {
  if (!rows.length) return true;
  const s = normalizeChartTradeDate(start);
  const e = normalizeChartTradeDate(end);
  const first = normalizeChartTradeDate(rows[0].trade_date);
  const last = normalizeChartTradeDate(rows[rows.length - 1].trade_date);
  return first > s || last < e;
}

async function loadSymbolDailyForChart(ts_code: string, start: string, end: string): Promise<ChartDailyRow[]> {
  let cached: ChartDailyRow[] = [];
  try {
    const c = await getStockDailyRange({ ts_code, start_date: start, end_date: end });
    if (c?.length) {
      cached = c.map((r) => ({
        trade_date: normalizeChartTradeDate(String(r.trade_date)),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        vol: Number(r.vol),
        amount: Number(r.amount),
      }));
    }
  } catch {
    // ignore
  }
  const needApi = !cached.length || chartDailySpanIncomplete(cached, start, end);
  if (!needApi) return cached;

  try {
    const rows = await tushareQuery({
      api_name: "daily",
      params: { ts_code, start_date: start, end_date: end },
      fields: ["ts_code", "trade_date", "open", "high", "low", "close", "vol", "amount"],
    });
    rows.sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
    const api = rows.map((r) => ({
      trade_date: normalizeChartTradeDate(String(r.trade_date)),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      vol: Number(r.vol),
      amount: Number(r.amount),
    }));
    if (!api.length) return cached;
    if (!cached.length) return api;
    return mergeChartDailyRows(api, cached);
  } catch {
    return cached;
  }
}

/** AI 路由用户级限流：默认每分钟 10 次/用户。响应 429 时附上 Retry-After。 */
const AI_RATE_LIMIT_PER_MIN = Number(process.env.AI_RATE_LIMIT_PER_MIN || 10);
const aiUserRateMap = new Map<string, { count: number; resetAt: number }>();
function aiUserRateLimit(): express.RequestHandler {
  return (req, res, next) => {
    const uid = (req as any).userId as number | undefined;
    if (!uid) return next();
    const key = `u:${uid}`;
    const now = Date.now();
    const slot = aiUserRateMap.get(key);
    if (!slot || now > slot.resetAt) {
      aiUserRateMap.set(key, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    slot.count += 1;
    if (slot.count > AI_RATE_LIMIT_PER_MIN) {
      const retry = Math.max(1, Math.ceil((slot.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retry));
      return res.status(429).json({ error: "ai_rate_limited", retry_after_sec: retry });
    }
    return next();
  };
}

export function registerStocksRoutes(app: express.Express, requireAuth: express.RequestHandler) {
  app.get("/api/stocks/news/hot", requireAuth, async (req, res) => {
    const limit = Number(req.query.limit ?? 30);
    try {
      const out = await fetchStockHotNews(Number.isFinite(limit) ? limit : 30);
      return res.json(out);
    } catch (e: any) {
      return res.status(502).json({ error: "stock_news_fetch_failed", detail: String(e?.message || e).slice(0, 300) });
    }
  });

  /** 基于当前页已拉取的新闻列表（1～20 条）生成 AI 要点，与 RSS 再拉取解耦。 */
  app.post("/api/stocks/news/hot/summary", requireAuth, aiUserRateLimit(), async (req: any, res) => {
    try {
      const user_id = Number(req.userId || 0);
      if (!user_id) return res.status(401).json({ error: "unauthorized" });
      const items = normalizeNewsItemsForAi(req.body?.items);
      if (!items?.length) {
        return res.status(400).json({ error: "items_required", hint: "请提交 1～20 条含 title 的对象数组。" });
      }
      const r = await summarizeStockHotNewsWithQwen(items);
      if (!r.ok) {
        if (r.error === "ALI_API_KEY_NOT_SET") return res.status(503).json({ error: "ai_unconfigured", detail: r.error });
        return res.status(502).json({ error: "ai_summary_failed", detail: String(r.error).slice(0, 400) });
      }
      return res.json({ ok: true, text: r.text, model: r.model, based_on: items.length });
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e).slice(0, 300) });
    }
  });

  // ---------- Symbol master 全量（前端本地缓存 + 即时匹配） ----------
  app.get("/api/symbols/master", requireAuth, async (req, res) => {
    try {
      const { version, items } = await getAllSymbolMaster();
      const etag = `W/"sm-${version}"`;
      const inm = String(req.headers["if-none-match"] || "");
      if (inm && inm === etag) {
        res.setHeader("ETag", etag);
        return res.status(304).end();
      }
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "private, max-age=3600");
      // 精简载荷：只回前端搜索必需字段
      const slim = items.map((it) => ({
        ts_code: it.ts_code,
        code: it.code,
        name: it.name,
        exchange: it.exchange,
        py: it.pinyin_full,
        pi: it.pinyin_initials,
      }));
      return res.json({ version, items: slim });
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  // ---------- Symbol search ----------
  app.get("/api/symbols/search", requireAuth, async (req, res) => {
    try {
      const q = String(req.query.q ?? "").trim();
      const limit = Number(req.query.limit ?? 20);
      if (!q) return res.json({ items: [] });
      const code = q.replace(/\D/g, "").slice(0, 6);
      if (code.length === 6) {
        const symbol = normalizeSymbol(code);
        // Try enrich with symbol master (name) if available.
        try {
          const hits = await searchSymbolMaster({ q: code, limit: 1 });
          const hit = hits[0];
          if (hit?.ts_code?.toUpperCase() === symbol.toUpperCase()) {
            return res.json({ items: [{ symbol, code, name: hit.name, exchange: hit.exchange }] });
          }
        } catch {
          // ignore and fallback
        }
        return res.json({ items: [{ symbol, code, name: code, exchange: symbol.endsWith(".SH") ? "SH" : "SZ" }] });
      }
      const hits = await searchSymbolMaster({ q, limit: Number.isFinite(limit) ? limit : 20 });
      return res.json({
        items: hits.map((h) => ({ symbol: h.ts_code, code: h.code, name: h.name, exchange: h.exchange })),
      });
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  // ---------- Single-stock analysis (signals; placeholder until data wired) ----------
  app.get("/api/symbols/:symbol/analysis", requireAuth, async (req, res) => {
    try {
      let symbol = "";
      try {
        symbol = normalizeSymbol(String(req.params.symbol ?? ""));
      } catch (e: any) {
        const code = String(e?.message || e || "symbol_invalid");
        if (code === "symbol_required" || code === "symbol_invalid") {
          return res.status(400).json({ error: code, got: String(req.params.symbol ?? "") });
        }
        throw e;
      }
      // Pull last ~40 trading days, pick latest trade_date as asof.
      const end = ymdToday();
      const start = new Date(Date.now() - 140 * 24 * 3600 * 1000).toISOString().slice(0, 10).replaceAll("-", "");

      // 优先使用本地行情缓存（stock_daily_cache），避免单股页依赖 Tushare 实时拉取导致慢/超时。
      // cache 表缺少 pre_close/pct_chg，这里用相邻收盘价计算补齐。
      let dailyRows: any[] = [];
      try {
        const cached = await getStockDailyRange({ ts_code: symbol, start_date: start, end_date: end });
        if (cached?.length) {
          dailyRows = cached.map((r) => ({
            ts_code: r.ts_code,
            trade_date: r.trade_date,
            open: r.open,
            high: r.high,
            low: r.low,
            close: r.close,
            pre_close: null,
            pct_chg: null,
            vol: r.vol,
            amount: r.amount,
          }));
        }
      } catch {
        // ignore and fallback
      }
      if (!dailyRows.length) {
        dailyRows = await tushareQuery({
          api_name: "daily",
          params: { ts_code: symbol, start_date: start, end_date: end },
          fields: ["ts_code", "trade_date", "open", "high", "low", "close", "pre_close", "pct_chg", "vol", "amount"],
        });
      }
      if (!dailyRows.length) return res.status(404).json({ error: "no_market_data", symbol });
      dailyRows.sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
      const last = dailyRows[dailyRows.length - 1] as any;
      const effective_asof = fmtYmdDash(String(last.trade_date)) || nowIso().slice(0, 10);

      const closes = dailyRows.map((r: any) => Number(r.close));
      const pct = (n0: number, n1: number) => (n0 > 0 ? ((n1 - n0) / n0) * 100 : null);
      if (last && (last.pre_close == null || last.pct_chg == null) && closes.length >= 2) {
        const pre = closes[closes.length - 2];
        last.pre_close = pre;
        last.pct_chg = pct(Number(pre), Number(last.close));
      }
      const closeLast = Number(last.close);
      const close5 = closes.length >= 6 ? closes[closes.length - 6] : null;
      const close20 = closes.length >= 21 ? closes[closes.length - 21] : null;

      // daily_basic + stock_basic 并行：两者无依赖，串行白白多一个 RTT。
      const [basicRows, basicInfoRows] = await Promise.all([
        tushareQuery({
          api_name: "daily_basic",
          params: { ts_code: symbol, trade_date: String(last.trade_date) },
          fields: ["ts_code", "trade_date", "pe_ttm", "pb", "ps_ttm", "dv_ttm", "turnover_rate", "total_mv", "circ_mv"],
        }),
        tushareQuery({
          api_name: "stock_basic",
          params: { ts_code: symbol },
          fields: ["ts_code", "name", "industry", "area", "market", "exchange"],
        }),
      ]);
      const basic = (basicRows?.[0] as any) || {};
      const info = (basicInfoRows?.[0] as any) || {};

      const snapshot_json = {
        ts_code: symbol,
        name: info?.name || null,
        asof: effective_asof,
        industry: info?.industry || null,
        area: info?.area || null,
        pct_chg_1d: Number.isFinite(Number(last.pct_chg)) ? Number(last.pct_chg) : pct(Number(last.pre_close), closeLast),
        pct_chg_5d: close5 == null ? null : pct(Number(close5), closeLast),
        pct_chg_20d: close20 == null ? null : pct(Number(close20), closeLast),
        pe_ttm: basic?.pe_ttm != null ? Number(basic.pe_ttm) : null,
        pb: basic?.pb != null ? Number(basic.pb) : null,
        ps_ttm: basic?.ps_ttm != null ? Number(basic.ps_ttm) : null,
        dv_ttm: basic?.dv_ttm != null ? Number(basic.dv_ttm) : null,
        turnover_rate: basic?.turnover_rate != null ? Number(basic.turnover_rate) : null,
        amount: last?.amount != null ? Number(last.amount) : null, // 成交额（千元，Tushare口径）
        total_mv: basic?.total_mv != null ? Number(basic.total_mv) : null, // 万元
        circ_mv: basic?.circ_mv != null ? Number(basic.circ_mv) : null, // 万元
      };

      // Fundamentals: latest financial indicators.
      const fiStart = new Date(Date.now() - 1200 * 24 * 3600 * 1000).toISOString().slice(0, 10).replaceAll("-", "");
      const fiRows = await tushareQuery({
        api_name: "fina_indicator",
        params: { ts_code: symbol, start_date: fiStart, end_date: String(last.trade_date) },
        fields: [
          "ts_code",
          "end_date",
          "roe",
          "grossprofit_margin",
          "netprofit_margin",
          "debt_to_assets",
          "yoy_sales",
          "yoy_netprofit",
        ],
      });
      fiRows.sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)));
      const fi = (fiRows?.[0] as any) || {};
      const fundamentals_json = {
        asof: effective_asof,
        report_end_date: fi?.end_date ? fmtYmdDash(String(fi.end_date)) : null,
        // valuation
        pe_ttm: snapshot_json.pe_ttm,
        pb: snapshot_json.pb,
        ps_ttm: snapshot_json.ps_ttm,
        dv_ttm: snapshot_json.dv_ttm,
        // profitability
        roe: fi?.roe != null ? Number(fi.roe) : null,
        grossprofit_margin: fi?.grossprofit_margin != null ? Number(fi.grossprofit_margin) : null,
        netprofit_margin: fi?.netprofit_margin != null ? Number(fi.netprofit_margin) : null,
        // growth
        yoy_sales: fi?.yoy_sales != null ? Number(fi.yoy_sales) : null,
        yoy_netprofit: fi?.yoy_netprofit != null ? Number(fi.yoy_netprofit) : null,
        // safety
        debt_to_assets: fi?.debt_to_assets != null ? Number(fi.debt_to_assets) : null,
        notes: "",
      };

      const candlesAsc = dailyRows.map((r: any) => ({
        t: String(r.trade_date),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        vol: Number(r.vol),
        amount: Number(r.amount),
      }));
      const { signals, reasons_json } = computeSignals({ candlesAsc });
      const key_levels = computeKeyLevels(candlesAsc);

      return res.json({ symbol, effective_asof, snapshot_json, fundamentals_json, signals, reasons_json, key_levels });
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  // ---------- 拆分：仅基本面（fina_indicator），让前端可与 analysis 并行触发，减少首屏等待 ----------
  app.get("/api/symbols/:symbol/fundamentals", requireAuth, async (req, res) => {
    try {
      let symbol = "";
      try {
        symbol = normalizeSymbol(String(req.params.symbol ?? ""));
      } catch (e: any) {
        const code = String(e?.message || e || "symbol_invalid");
        if (code === "symbol_required" || code === "symbol_invalid") {
          return res.status(400).json({ error: code, got: String(req.params.symbol ?? "") });
        }
        throw e;
      }

      // 取最近 3 年财务指标，用最新一期回填。
      const fiStart = new Date(Date.now() - 1200 * 24 * 3600 * 1000).toISOString().slice(0, 10).replaceAll("-", "");
      const fiEnd = ymdToday();
      const fiRows = await tushareQuery({
        api_name: "fina_indicator",
        params: { ts_code: symbol, start_date: fiStart, end_date: fiEnd },
        fields: [
          "ts_code",
          "end_date",
          "roe",
          "grossprofit_margin",
          "netprofit_margin",
          "debt_to_assets",
          "yoy_sales",
          "yoy_netprofit",
        ],
      });
      fiRows.sort((a, b) => String(b.end_date).localeCompare(String(a.end_date)));
      const fi = (fiRows?.[0] as any) || {};
      const fundamentals_json = {
        report_end_date: fi?.end_date ? fmtYmdDash(String(fi.end_date)) : null,
        roe: fi?.roe != null ? Number(fi.roe) : null,
        grossprofit_margin: fi?.grossprofit_margin != null ? Number(fi.grossprofit_margin) : null,
        netprofit_margin: fi?.netprofit_margin != null ? Number(fi.netprofit_margin) : null,
        yoy_sales: fi?.yoy_sales != null ? Number(fi.yoy_sales) : null,
        yoy_netprofit: fi?.yoy_netprofit != null ? Number(fi.yoy_netprofit) : null,
        debt_to_assets: fi?.debt_to_assets != null ? Number(fi.debt_to_assets) : null,
        notes: "",
      };
      return res.json({ symbol, fundamentals_json });
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  // ---------- Klines & indicators (for chart) ----------
  app.get("/api/symbols/:symbol/klines", requireAuth, async (req, res) => {
    try {
      let symbol = "";
      try {
        symbol = normalizeSymbol(String(req.params.symbol ?? ""));
      } catch (e: any) {
        const code = String(e?.message || e || "symbol_invalid");
        if (code === "symbol_required" || code === "symbol_invalid") {
          return res.status(400).json({ error: code, got: String(req.params.symbol ?? "") });
        }
        throw e;
      }
      const from = String(req.query.from ?? "").trim();
      const to = String(req.query.to ?? "").trim();
      const freq = parseFreq(req.query.freq);
      const adjust = String(req.query.adjust ?? "hfq").trim();
      if (!from || !to) return res.status(400).json({ error: "from_to_required" });
      const start = from.replaceAll("-", "");
      const end = to.replaceAll("-", "");
      const daily = await loadSymbolDailyForChart(symbol, start, end);
      const candles = aggregateCandles(daily, freq).map((c) => ({
        t: c.t, // YYYYMMDD
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        vol: c.vol,
        amount: c.amount,
      }));
      return res.json({ symbol, freq, adjust, candles });
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  app.get("/api/symbols/:symbol/indicators", requireAuth, async (req, res) => {
    try {
      let symbol = "";
      try {
        symbol = normalizeSymbol(String(req.params.symbol ?? ""));
      } catch (e: any) {
        const code = String(e?.message || e || "symbol_invalid");
        if (code === "symbol_required" || code === "symbol_invalid") {
          return res.status(400).json({ error: code, got: String(req.params.symbol ?? "") });
        }
        throw e;
      }
      const from = String(req.query.from ?? "").trim();
      const to = String(req.query.to ?? "").trim();
      const freq = parseFreq(req.query.freq);
      if (!from || !to) return res.status(400).json({ error: "from_to_required" });
      const start = from.replaceAll("-", "");
      const end = to.replaceAll("-", "");

      const daily = await loadSymbolDailyForChart(symbol, start, end);
      if (!daily.length) return res.status(404).json({ error: "no_market_data", symbol });

      const candles = aggregateCandles(daily, freq);
      const times = candles.map((c) => String(c.t));
      const closes = candles.map((c) => Number(c.close));
      const rowsHLC = candles.map((c) => ({ high: Number(c.high), low: Number(c.low), close: Number(c.close) }));

      const round4 = (v: number | null) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10000) / 10000);
      const mapArr = (arr: Array<number | null>) => arr.map(round4);

      const maPeriods = [5, 10, 20, 30, 60, 120, 250];
      const ma: Record<string, Array<number | null>> = {};
      for (const p of maPeriods) ma[String(p)] = mapArr(sma(closes, p));

      const emaPeriods = [12, 26];
      const emaOut: Record<string, Array<number | null>> = {};
      for (const p of emaPeriods) emaOut[String(p)] = mapArr(ema(closes, p));

      const macdOut = macd(closes);
      const rsiOut: Record<string, Array<number | null>> = {};
      for (const p of [6, 12, 24]) rsiOut[String(p)] = mapArr(rsi(closes, p));
      const bollOut = bollinger(closes, 20, 2);
      const kdjOut = kdj(rowsHLC);

      return res.json({
        symbol,
        freq,
        times,
        ma,
        ema: emaOut,
        macd: { dif: mapArr(macdOut.dif), dea: mapArr(macdOut.dea), hist: mapArr(macdOut.hist) },
        rsi: rsiOut,
        bollinger: { up: mapArr(bollOut.up), mid: mapArr(bollOut.mid), low: mapArr(bollOut.low) },
        kdj: { k: mapArr(kdjOut.k), d: mapArr(kdjOut.d), j: mapArr(kdjOut.j) },
      });
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  // ---------- AI analysis (button-triggered + follow-up Q&A) ----------
  app.post("/api/symbols/:symbol/ai-analyses", requireAuth, aiUserRateLimit(), async (req, res) => {
    const uid = (req as any).userId as number;
    try {
      const symbol = normalizeSymbol(String(req.params.symbol ?? ""));
      const freq = parseFreq(req.body?.freq);
      const asof = String(req.body?.asof ?? "today").trim() || "today";
      const effective_asof = asof === "today" ? nowIso().slice(0, 10) : asof;

      // 幂等缓存：同 user+symbol+asof+freq 在 30 分钟内复用上次结果，避免重复 LLM 调用。
      try {
        const cached = await getStockAiAnalysisByIdentity({
          user_id: uid,
          symbol,
          effective_asof,
          freq,
          withinSeconds: 1800,
        });
        if (cached) {
          return res.json({
            ai_analysis_id: cached.id,
            effective_asof: cached.effective_asof,
            freq: cached.freq,
            summary: cached.response_json,
            cached: true,
          });
        }
      } catch {
        // 查询失败不阻塞主流程，继续正常生成。
      }

      // Build evidence from real snapshot + signals, fixed to current freq.
      let prep;
      try {
        prep = await prepareStockAiEvidence({ symbol, freq, effective_asof });
      } catch (e: any) {
        if (String(e?.message) === "no_market_data") return res.status(404).json({ error: "no_market_data", symbol });
        throw e;
      }
      const { effective_asof2, evidence } = prep;

      const qwen = await qwenChatCompletion({
        model: process.env.ALI_MODEL?.trim() || "qwen3-max",
        temperature: 0.25,
        messages: buildAiSummaryPrompt({ symbol, freq, effective_asof: effective_asof2, evidence }),
      });

      const summary: any =
        (qwen.ok && parseAiSummaryText(String(qwen.text || "").trim())) ||
        buildStockAiSummary({ symbol, freq, effective_asof: effective_asof2, evidence });

      const ai = await createStockAiAnalysis({
        user_id: uid,
        symbol,
        effective_asof: effective_asof2,
        freq,
        request_json: { asof, freq },
        response_json: summary,
      });

      const initialText =
        [
          `【结构化解读】${symbol} · ${summary.effective_asof} · ${freq}`,
          `- 总体：${summary.overall_view}（风险分 ${summary.risk_score ?? "—"}）`,
          `- 策略：${summary.signals
            .map((s: any) => `${s.strategy}${s.status === "hit" ? "命中" : s.status === "near" ? "接近" : "未命中"}`)
            .join("；")}`,
          `- 关键位：${summary.key_levels
            .map((k: any) => `${k.kind === "support" ? "支撑" : k.kind === "resistance" ? "压力" : "止损"}${k.price ?? "—"}`)
            .join(" / ")}`,
          "",
          "你可以继续追问：",
          "1) 哪个策略更优先？入场/止损/止盈如何定？",
          "2) 为什么命中/接近？差距在哪里？",
          "3) 关键支撑/压力与失败条件是什么？",
        ].join("\n");
      await createStockAiMessage({ ai_analysis_id: ai.id, role: "assistant", content: initialText });

      return res.json({ ai_analysis_id: ai.id, effective_asof: effective_asof2, freq, summary });
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  // 切换股票时自动恢复最近一次 AI 解读 + 消息历史
  app.get("/api/symbols/:symbol/ai-analyses/recent", requireAuth, async (req, res) => {
    const uid = (req as any).userId as number;
    try {
      const symbol = normalizeSymbol(String(req.params.symbol ?? ""));
      const freq = req.query.freq ? parseFreq(req.query.freq) : undefined;
      const withMessages = String(req.query.with_messages ?? "1") !== "0";
      const list = await listStockAiAnalysesByUser({ user_id: uid, symbol, freq, limit: 1 });
      const latest = list[0];
      if (!latest) return res.json({ ai_analysis: null, messages: [] });
      const messages = withMessages ? await listStockAiMessages(latest.id, 100) : [];
      return res.json({ ai_analysis: latest, messages });
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  app.get("/api/ai-analyses/:aiAnalysisId", requireAuth, async (req, res) => {
    const uid = (req as any).userId as number;
    try {
      const aiAnalysisId = Number(req.params.aiAnalysisId ?? "");
      if (!Number.isFinite(aiAnalysisId) || aiAnalysisId <= 0) return res.status(400).json({ error: "id_required" });
      const ai = await getStockAiAnalysisById(aiAnalysisId);
      if (!ai || ai.user_id !== uid) return res.status(404).json({ error: "not_found" });
      const messages = await listStockAiMessages(aiAnalysisId, 100);
      return res.json({ ai_analysis: ai, messages });
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  app.post("/api/ai-analyses/:aiAnalysisId/messages", requireAuth, aiUserRateLimit(), async (req, res) => {
    const uid = (req as any).userId as number;
    try {
      const aiAnalysisId = Number(req.params.aiAnalysisId ?? "");
      if (!Number.isFinite(aiAnalysisId) || aiAnalysisId <= 0) return res.status(400).json({ error: "id_required" });
      const question = String(req.body?.question ?? "").trim();
      if (!question) return res.status(400).json({ error: "question_required" });

      const ai = await getStockAiAnalysisById(aiAnalysisId);
      if (!ai || ai.user_id !== uid) return res.status(404).json({ error: "not_found" });

      await createStockAiMessage({ ai_analysis_id: aiAnalysisId, role: "user", content: question });
      const history = await listStockAiMessages(aiAnalysisId, 12);
      const request_id = crypto.randomUUID();
      const qwen2 = await qwenChatCompletion({
        model: process.env.ALI_MODEL?.trim() || "qwen3-max",
        temperature: 0.35,
        messages: [
          { role: "system", content: "你是严谨的A股研判助手。回答简体中文，结构清晰，先结论后依据，给出可执行纪律。不要提及模型名称或阶段标签。" },
          {
            role: "user",
            content: [
              `symbol=${ai.symbol}`,
              `effective_asof=${ai.effective_asof}`,
              `freq=${ai.freq}`,
              "",
              "summary_json=" + JSON.stringify(ai.response_json || {}),
              "",
              "history=" + JSON.stringify(history || []),
              "",
              "question=" + question,
            ].join("\n"),
          },
        ],
      });

      const reply: any = qwen2.ok
        ? {
            request_id,
            effective_asof: ai.effective_asof,
            symbol: ai.symbol,
            freq: ai.freq as Freq,
            text: qwen2.text,
            bullets: [],
            evidence: [],
          }
        : buildStockAiReply({
            symbol: ai.symbol,
            effective_asof: ai.effective_asof,
            freq: ai.freq as Freq,
            summary: ai.response_json,
            history,
            question,
            request_id,
          });

      await createStockAiMessage({ ai_analysis_id: aiAnalysisId, role: "assistant", content: reply.text, meta_json: reply });
      return res.json({ ai_analysis_id: aiAnalysisId, answer: reply });
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  // ---------- 创建 AI 解读流式（SSE） ----------
  app.post("/api/symbols/:symbol/ai-analyses/stream", requireAuth, aiUserRateLimit(), async (req, res) => {
    const uid = (req as any).userId as number;

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    (res as any).flushHeaders?.();
    const send = (obj: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    try {
      const symbol = normalizeSymbol(String(req.params.symbol ?? ""));
      const freq = parseFreq(req.body?.freq);
      const asof = String(req.body?.asof ?? "today").trim() || "today";
      const effective_asof = asof === "today" ? nowIso().slice(0, 10) : asof;

      // 缓存命中直接返回
      try {
        const cached = await getStockAiAnalysisByIdentity({
          user_id: uid,
          symbol,
          effective_asof,
          freq,
          withinSeconds: 1800,
        });
        if (cached) {
          send({ phase: "cache" });
          send({
            done: true,
            cached: true,
            ai_analysis_id: cached.id,
            effective_asof: cached.effective_asof,
            freq: cached.freq,
            summary: cached.response_json,
          });
          return res.end();
        }
      } catch {
        // ignore
      }

      send({ phase: "evidence" });
      let prep;
      try {
        prep = await prepareStockAiEvidence({ symbol, freq, effective_asof });
      } catch (e: any) {
        send({ error: String(e?.message || e) });
        return res.end();
      }
      const { effective_asof2, evidence } = prep;
      // 先把已就绪的结构化数据推给前端，UI 可立即渲染
      send({ phase: "preview", effective_asof: effective_asof2, evidence });

      const controller = new AbortController();
      req.on("close", () => controller.abort());

      send({ phase: "llm" });
      const r = await qwenStreamChatCompletion({
        model: process.env.ALI_MODEL?.trim() || "qwen3-max",
        temperature: 0.25,
        signal: controller.signal,
        onDelta: (d) => send({ delta: d }),
        messages: buildAiSummaryPrompt({ symbol, freq, effective_asof: effective_asof2, evidence }),
      });

      const summary: any =
        (r.ok && parseAiSummaryText(String(r.text || "").trim())) ||
        buildStockAiSummary({ symbol, freq, effective_asof: effective_asof2, evidence });

      const ai = await createStockAiAnalysis({
        user_id: uid,
        symbol,
        effective_asof: effective_asof2,
        freq,
        request_json: { asof, freq },
        response_json: summary,
      });

      const initialText = [
        `【结构化解读】${symbol} · ${summary.effective_asof} · ${freq}`,
        `- 总体：${summary.overall_view}（风险分 ${summary.risk_score ?? "—"}）`,
        `- 策略：${(summary.signals || [])
          .map((s: any) => `${s.strategy}${s.status === "hit" ? "命中" : s.status === "near" ? "接近" : "未命中"}`)
          .join("；")}`,
        `- 关键位：${(summary.key_levels || [])
          .map((k: any) => `${k.kind === "support" ? "支撑" : k.kind === "resistance" ? "压力" : "止损"}${k.price ?? "—"}`)
          .join(" / ")}`,
        "",
        "你可以继续追问：",
        "1) 哪个策略更优先？入场/止损/止盈如何定？",
        "2) 为什么命中/接近？差距在哪里？",
        "3) 关键支撑/压力与失败条件是什么？",
      ].join("\n");
      await createStockAiMessage({ ai_analysis_id: ai.id, role: "assistant", content: initialText });

      send({
        done: true,
        ai_analysis_id: ai.id,
        effective_asof: effective_asof2,
        freq,
        summary,
      });
      res.end();
    } catch (e: any) {
      send({ error: String(e?.message || e) });
      res.end();
    }
  });

  // ---------- AI 追问流式（SSE）：data:{"delta":"..."} ... data:{"done":true,"text":"..."} ----------
  app.post("/api/ai-analyses/:aiAnalysisId/messages/stream", requireAuth, aiUserRateLimit(), async (req, res) => {
    const uid = (req as any).userId as number;
    const aiAnalysisId = Number(req.params.aiAnalysisId ?? "");
    if (!Number.isFinite(aiAnalysisId) || aiAnalysisId <= 0) return res.status(400).json({ error: "id_required" });
    const question = String(req.body?.question ?? "").trim();
    if (!question) return res.status(400).json({ error: "question_required" });

    const ai = await getStockAiAnalysisById(aiAnalysisId);
    if (!ai || ai.user_id !== uid) return res.status(404).json({ error: "not_found" });

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    (res as any).flushHeaders?.();

    const send = (obj: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    try {
      await createStockAiMessage({ ai_analysis_id: aiAnalysisId, role: "user", content: question });
      const history = await listStockAiMessages(aiAnalysisId, 12);
      const request_id = crypto.randomUUID();

      send({ meta: true, request_id, symbol: ai.symbol, freq: ai.freq, effective_asof: ai.effective_asof });

      const controller = new AbortController();
      req.on("close", () => controller.abort());

      const r = await qwenStreamChatCompletion({
        model: process.env.ALI_MODEL?.trim() || "qwen3-max",
        temperature: 0.35,
        signal: controller.signal,
        onDelta: (d) => send({ delta: d }),
        messages: [
          { role: "system", content: "你是严谨的A股研判助手。回答简体中文，结构清晰，先结论后依据，给出可执行纪律。不要提及模型名称或阶段标签。" },
          {
            role: "user",
            content: [
              `symbol=${ai.symbol}`,
              `effective_asof=${ai.effective_asof}`,
              `freq=${ai.freq}`,
              "",
              "summary_json=" + JSON.stringify(ai.response_json || {}),
              "",
              "history=" + JSON.stringify(history || []),
              "",
              "question=" + question,
            ].join("\n"),
          },
        ],
      });

      const reply: any = r.ok
        ? { request_id, effective_asof: ai.effective_asof, symbol: ai.symbol, freq: ai.freq as Freq, text: r.text, bullets: [], evidence: [] }
        : buildStockAiReply({
            symbol: ai.symbol,
            effective_asof: ai.effective_asof,
            freq: ai.freq as Freq,
            summary: ai.response_json,
            history,
            question,
            request_id,
          });

      // 流失败时把降级文本一次性下发，前端可平滑替换。
      if (!r.ok) send({ delta: reply.text });

      await createStockAiMessage({ ai_analysis_id: aiAnalysisId, role: "assistant", content: reply.text, meta_json: reply });
      send({ done: true, text: reply.text, request_id });
      res.end();
    } catch (e: any) {
      send({ error: String(e?.message || e) });
      res.end();
    }
  });

  // ---------- Screener (three strategies) ----------
  app.get("/api/stocks/screener/runs", requireAuth, async (req: any, res) => {
    try {
      const user_id = Number(req.userId || 0);
      if (!user_id) return res.status(401).json({ error: "unauthorized" });
      const limit = Number(req.query.limit || 20);
      const runs = await listStockScreenerRuns({ user_id, limit });
      return res.json({ runs });
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  app.delete("/api/stocks/screener/runs/:runId", requireAuth, async (req: any, res) => {
    try {
      const user_id = Number(req.userId || 0);
      if (!user_id) return res.status(401).json({ error: "unauthorized" });
      const run_id = Number(req.params.runId);
      if (!Number.isFinite(run_id) || run_id <= 0) return res.status(400).json({ error: "run_id_invalid" });
      const r = await deleteStockScreenerRunForUser({ run_id, user_id });
      if (!r.ok) {
        if (r.error === "not_found") return res.status(404).json({ error: "not_found" });
        if (r.error === "run_in_progress") return res.status(409).json({ error: "run_in_progress" });
        return res.status(400).json({ error: r.error || "bad_request" });
      }
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  app.get("/api/stocks/screener/runs/:runId/results", requireAuth, async (req: any, res) => {
    try {
      const user_id = Number(req.userId || 0);
      if (!user_id) return res.status(401).json({ error: "unauthorized" });
      const run_id = Number(req.params.runId);
      if (!Number.isFinite(run_id) || run_id <= 0) return res.status(400).json({ error: "run_id_invalid" });
      const run = await getStockScreenerRunById(run_id);
      if (!run || run.user_id !== user_id) return res.status(404).json({ error: "not_found" });
      const limit = Math.max(1, Math.min(300, Number(req.query.limit || 50)));
      const offset = Math.max(0, Number(req.query.offset || 0));
      const sortRaw = String(req.query.sort || "score");
      const sort = sortRaw === "symbol" || sortRaw === "created_at" ? (sortRaw as "symbol" | "created_at") : "score";
      const order = String(req.query.order || "desc") === "asc" ? "asc" : "desc";
      const filterMiss = String(req.query.filter_miss ?? "1") !== "0";
      const scoreMin = parseScreenerQueryNum(req.query.score_min);
      const scoreMax = parseScreenerQueryNum(req.query.score_max);
      const statusIn = parseScreenerStatusIn(req.query.status_in);
      const industryQ = String(req.query.industry_q ?? "").trim() || undefined;
      const industryIn = parseScreenerIndustryIn(req.query.industry_in);
      const marketIn = parseScreenerMarketIn(req.query.market_in);
      const rows = await buildFilteredScreenerRows({
        run_id,
        sort,
        order,
        filterMiss,
        scoreMin,
        scoreMax,
        statusIn,
        industryQ,
        industryIn,
        marketIn,
      });
      const total = rows.length;
      const itemsOut = rows.slice(offset, offset + limit);
      return res.json({ run_id, items: itemsOut, total, limit, offset, sort, order });
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  // 导出 CSV（仅本人 run）。返回 text/csv，前端直接保存。
  app.get("/api/stocks/screener/runs/:runId/results.csv", requireAuth, async (req: any, res) => {
    try {
      const user_id = Number(req.userId || 0);
      if (!user_id) return res.status(401).json({ error: "unauthorized" });
      const run_id = Number(req.params.runId);
      if (!Number.isFinite(run_id) || run_id <= 0) return res.status(400).json({ error: "run_id_invalid" });
      const run = await getStockScreenerRunById(run_id);
      if (!run || run.user_id !== user_id) return res.status(404).json({ error: "not_found" });
      const sortRaw = String(req.query.sort || "score");
      const sort = sortRaw === "symbol" || sortRaw === "created_at" ? (sortRaw as "symbol" | "created_at") : "score";
      const order = String(req.query.order || "desc") === "asc" ? "asc" : "desc";
      const filterMiss = String(req.query.filter_miss ?? "1") !== "0";
      const scoreMin = parseScreenerQueryNum(req.query.score_min);
      const scoreMax = parseScreenerQueryNum(req.query.score_max);
      const statusIn = parseScreenerStatusIn(req.query.status_in);
      const industryQ = String(req.query.industry_q ?? "").trim() || undefined;
      const industryIn = parseScreenerIndustryIn(req.query.industry_in);
      const marketIn = parseScreenerMarketIn(req.query.market_in);
      const rows = await buildFilteredScreenerRows({
        run_id,
        sort,
        order,
        filterMiss,
        scoreMin,
        scoreMax,
        statusIn,
        industryQ,
        industryIn,
        marketIn,
      });
      const enriched = rows.slice(0, 300);
      const esc = (v: any) => {
        if (v == null) return "";
        const s = String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = ["symbol", "name", "industry", "market", "score", "status", "pct1d", "k", "macd_dif", "tags", "created_at"];
      const lines = [header.join(",")];
      for (const it of enriched) {
        const feat: any = (it.reasons_json as any)?.features || {};
        const tagList: string[] = Array.isArray((it.reasons_json as any)?.tags) ? (it.reasons_json as any).tags : [];
        const status = (it.snapshot_json as any)?.status ?? "";
        lines.push(
          [
            esc(it.symbol),
            esc(it.name ?? ""),
            esc(it.industry ?? ""),
            esc(it.market ?? ""),
            esc(it.score ?? ""),
            esc(status),
            esc(feat.pct1d ?? ""),
            esc(feat.k ?? ""),
            esc(feat.macd_dif ?? ""),
            esc(tagList.join(";")),
            esc(it.created_at),
          ].join(",")
        );
      }
      const csv = "\uFEFF" + lines.join("\r\n") + "\r\n";
      const fname = `screener_run_${run_id}_${run.strategy}_${run.effective_asof}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`);
      return res.send(csv);
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  app.post("/api/stocks/screener/run", requireAuth, async (req: any, res) => {
    try {
      const user_id = Number(req.userId || 0);
      if (!user_id) return res.status(401).json({ error: "unauthorized" });
      const strategy = String(req.body?.strategy || "").trim();
      if (strategy !== "左侧埋伏" && strategy !== "右侧确认" && strategy !== "超短反转") {
        return res.status(400).json({ error: "strategy_invalid" });
      }
      const freq = parseFreq(req.body?.freq);
      const topN = req.body?.topN != null ? Number(req.body.topN) : undefined;
      const lookbackDays = req.body?.lookbackDays != null ? Number(req.body.lookbackDays) : undefined;
      const r = await runStockScreener({ user_id, strategy: strategy as any, freq, topN, lookbackDays });
      return res.json({ run_id: r.run_id });
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  // ---------- 行情缓存同步（手动触发；定时任务每日 17:00 自动运行） ----------
  app.get("/api/stocks/quotes/progress", requireAuth, async (_req: any, res) => {
    try {
      return res.json(getQuotesSyncProgress());
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  app.post("/api/stocks/quotes/sync", requireAuth, async (req: any, res) => {
    try {
      const user_id = Number(req.userId || 0);
      if (!user_id) return res.status(401).json({ error: "unauthorized" });
      if (isQuotesSyncing()) return res.status(409).json({ error: "already_syncing" });
      const start = req.body?.start ? String(req.body.start) : undefined;
      const end = req.body?.end ? String(req.body.end) : undefined;
      const lastNDays = req.body?.lastNDays != null ? Number(req.body.lastNDays) : undefined;
      const lastNTradeDays = req.body?.lastNTradeDays != null ? Number(req.body.lastNTradeDays) : undefined;
      const r = await syncStockDaily({ start, end, lastNDays, lastNTradeDays });
      return res.json(r);
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  // 行情同步 SSE：立即返回；浏览器持续收到 progress 事件，避免长 POST 504。
  app.post("/api/stocks/quotes/sync/stream", requireAuth, async (req: any, res) => {
    const user_id = Number(req.userId || 0);
    if (!user_id) return res.status(401).json({ error: "unauthorized" });

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    (res as any).flushHeaders?.();

    const send = (obj: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    if (isQuotesSyncing()) {
      // 已有同步在跑：直接挂上去推进度，不重复触发。
      send({ phase: "attached", progress: getQuotesSyncProgress() });
    } else {
      const start = req.body?.start ? String(req.body.start) : undefined;
      const end = req.body?.end ? String(req.body.end) : undefined;
      const lastNDays = req.body?.lastNDays != null ? Number(req.body.lastNDays) : undefined;
      const lastNTradeDays = req.body?.lastNTradeDays != null ? Number(req.body.lastNTradeDays) : undefined;
      send({ phase: "start" });
      // 触发但不等待：进度由轮询循环负责推送。
      void syncStockDaily({ start, end, lastNDays, lastNTradeDays }).catch(() => {
        // 忽略：错误会通过 progress.errors 反映
      });
    }

    let closed = false;
    req.on("close", () => {
      closed = true;
    });

    // 每 1s 推一次 progress；任务结束后再推 done 即收尾。
    const tick = async () => {
      while (!closed) {
        const p = getQuotesSyncProgress();
        send({ progress: p });
        if (!p.running) {
          send({ done: true, progress: p });
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      try {
        res.end();
      } catch {
        // ignore
      }
    };
    void tick();
  });
}
