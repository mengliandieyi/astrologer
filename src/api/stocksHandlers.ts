import type express from "express";
import crypto from "node:crypto";
import { buildStockAiReply, buildStockAiSummary } from "../lib/stockAi.js";
import { qwenChatCompletion } from "../lib/aiClient.js";
import { tushareQuery } from "../lib/tushareClient.js";
import { searchSymbolMaster } from "../lib/symbolMaster.js";
import { computeSignals } from "../lib/stockSignals.js";
import { runStockScreener } from "../lib/stockScreener.js";
import {
  createStockAiAnalysis,
  createStockAiMessage,
  getStockAiAnalysisById,
  listStockAiMessages,
  listStockScreenerResults,
  listStockScreenerRuns,
} from "../lib/store.js";

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

export function registerStocksRoutes(app: express.Express, requireAuth: express.RequestHandler) {
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
      const symbol = normalizeSymbol(String(req.params.symbol ?? ""));
      // Pull last ~40 trading days, pick latest trade_date as asof.
      const end = ymdToday();
      const start = new Date(Date.now() - 80 * 24 * 3600 * 1000).toISOString().slice(0, 10).replaceAll("-", "");

      const dailyRows = await tushareQuery({
        api_name: "daily",
        params: { ts_code: symbol, start_date: start, end_date: end },
        fields: ["ts_code", "trade_date", "open", "high", "low", "close", "pre_close", "pct_chg", "vol", "amount"],
      });
      if (!dailyRows.length) return res.status(404).json({ error: "no_market_data", symbol });
      dailyRows.sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
      const last = dailyRows[dailyRows.length - 1] as any;
      const effective_asof = fmtYmdDash(String(last.trade_date)) || nowIso().slice(0, 10);

      const closes = dailyRows.map((r: any) => Number(r.close));
      const pct = (n0: number, n1: number) => (n0 > 0 ? ((n1 - n0) / n0) * 100 : null);
      const closeLast = Number(last.close);
      const close5 = closes.length >= 6 ? closes[closes.length - 6] : null;
      const close20 = closes.length >= 21 ? closes[closes.length - 21] : null;

      const basicRows = await tushareQuery({
        api_name: "daily_basic",
        params: { ts_code: symbol, trade_date: String(last.trade_date) },
        fields: ["ts_code", "trade_date", "pe_ttm", "pb", "ps_ttm", "dv_ttm", "turnover_rate", "total_mv", "circ_mv"],
      });
      const basic = (basicRows?.[0] as any) || {};

      const basicInfoRows = await tushareQuery({
        api_name: "stock_basic",
        params: { ts_code: symbol },
        fields: ["ts_code", "name", "industry", "area", "market", "exchange"],
      });
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

  // ---------- Klines & indicators (for chart) ----------
  app.get("/api/symbols/:symbol/klines", requireAuth, async (req, res) => {
    try {
      const symbol = normalizeSymbol(String(req.params.symbol ?? ""));
      const from = String(req.query.from ?? "").trim();
      const to = String(req.query.to ?? "").trim();
      const freq = parseFreq(req.query.freq);
      const adjust = String(req.query.adjust ?? "hfq").trim();
      if (!from || !to) return res.status(400).json({ error: "from_to_required" });
      const start = from.replaceAll("-", "");
      const end = to.replaceAll("-", "");
      const rows = await tushareQuery({
        api_name: "daily",
        params: { ts_code: symbol, start_date: start, end_date: end },
        fields: ["ts_code", "trade_date", "open", "high", "low", "close", "vol", "amount"],
      });
      // tushare returns trade_date desc by default; sort asc for chart
      rows.sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
      const daily = rows.map((r) => ({
        trade_date: String(r.trade_date),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        vol: Number(r.vol),
        amount: Number(r.amount),
      }));
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
      const symbol = normalizeSymbol(String(req.params.symbol ?? ""));
      const from = String(req.query.from ?? "").trim();
      const to = String(req.query.to ?? "").trim();
      const freq = parseFreq(req.query.freq);
      if (!from || !to) return res.status(400).json({ error: "from_to_required" });
      return res.status(422).json({ error: "market_data_not_configured", symbol, from, to, freq });
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  // ---------- AI analysis (button-triggered + follow-up Q&A) ----------
  app.post("/api/symbols/:symbol/ai-analyses", requireAuth, async (req, res) => {
    const uid = (req as any).userId as number;
    try {
      const symbol = normalizeSymbol(String(req.params.symbol ?? ""));
      const freq = parseFreq(req.body?.freq);
      const asof = String(req.body?.asof ?? "today").trim() || "today";
      const effective_asof = asof === "today" ? nowIso().slice(0, 10) : asof;

      // Build evidence from real snapshot + signals, fixed to current freq.
      const end = toUtcYmd(effective_asof || nowIso().slice(0, 10));
      const start = new Date(Date.now() - 900 * 24 * 3600 * 1000).toISOString().slice(0, 10).replaceAll("-", "");
      const dailyRows = await tushareQuery({
        api_name: "daily",
        params: { ts_code: symbol, start_date: start, end_date: end },
        fields: ["ts_code", "trade_date", "open", "high", "low", "close", "pre_close", "pct_chg", "vol", "amount"],
      });
      if (!dailyRows.length) return res.status(404).json({ error: "no_market_data", symbol });
      dailyRows.sort((a, b) => String(a.trade_date).localeCompare(String(b.trade_date)));
      const last = dailyRows[dailyRows.length - 1] as any;
      const effective_asof2 = fmtYmdDash(String(last.trade_date)) || effective_asof;

      const basicRows = await tushareQuery({
        api_name: "daily_basic",
        params: { ts_code: symbol, trade_date: String(last.trade_date) },
        fields: ["ts_code", "trade_date", "pe_ttm", "turnover_rate", "total_mv", "circ_mv"],
      });
      const basic = (basicRows?.[0] as any) || {};
      const basicInfoRows = await tushareQuery({
        api_name: "stock_basic",
        params: { ts_code: symbol },
        fields: ["ts_code", "name", "industry", "area", "market", "exchange"],
      });
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

      // Aggregate to selected freq for evidence/signals.
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

      const evidence = {
        snapshot_json,
        signals,
        reasons_json,
        key_levels,
        note: "证据链：快照 + 策略信号 + 指标特征。",
      };

      const qwen = await qwenChatCompletion({
        model: process.env.ALI_MODEL?.trim() || "qwen3-max",
        temperature: 0.25,
        messages: [
          {
            role: "system",
            content:
              "你是严谨的A股研判助手。输出必须是严格JSON（不要Markdown，不要解释），字段需匹配给定schema。数值保留合理小数，字符串用简体中文。",
          },
          {
            role: "user",
            content:
              [
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
                `symbol=${symbol}`,
                `freq=${freq}`,
                `effective_asof=${effective_asof2}`,
                "",
                "evidence_json=" + JSON.stringify(evidence),
              ].join("\n"),
          },
        ],
      });

      const summary: any = (() => {
        if (qwen.ok) {
          try {
            const raw = String(qwen.text || "").trim();
            const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
            const tryTexts = [stripped, raw];
            for (const t of tryTexts) {
              try {
                const obj = JSON.parse(t);
                if (obj && typeof obj === "object") return obj;
              } catch {
                // continue
              }
            }
            // Last resort: extract first JSON object from text.
            const m = stripped.match(/\{[\s\S]*\}/);
            if (m?.[0]) {
              const obj = JSON.parse(m[0]);
              if (obj && typeof obj === "object") return obj;
            }
          } catch {
            // ignore
          }
        }
        return buildStockAiSummary({ symbol, freq, effective_asof: effective_asof2, evidence });
      })();

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

  app.post("/api/ai-analyses/:aiAnalysisId/messages", requireAuth, async (req, res) => {
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

  // ---------- Screener (three strategies) ----------
  app.get("/api/stocks/screener/runs", requireAuth, async (req: any, res) => {
    try {
      const user_id = Number(req.user?.id || 0);
      if (!user_id) return res.status(401).json({ error: "unauthorized" });
      const limit = Number(req.query.limit || 20);
      const runs = await listStockScreenerRuns({ user_id, limit });
      return res.json({ runs });
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  app.get("/api/stocks/screener/runs/:runId/results", requireAuth, async (req: any, res) => {
    try {
      const user_id = Number(req.user?.id || 0);
      if (!user_id) return res.status(401).json({ error: "unauthorized" });
      const run_id = Number(req.params.runId);
      if (!Number.isFinite(run_id) || run_id <= 0) return res.status(400).json({ error: "run_id_invalid" });
      const limit = Number(req.query.limit || 50);
      const items = await listStockScreenerResults({ run_id, limit });
      return res.json({ run_id, items });
    } catch (e: any) {
      return res.status(400).json({ error: String(e?.message || e) });
    }
  });

  app.post("/api/stocks/screener/run", requireAuth, async (req: any, res) => {
    try {
      const user_id = Number(req.user?.id || 0);
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
}

