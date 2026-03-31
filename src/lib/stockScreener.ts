import { tushareQuery } from "./tushareClient.js";
import { computeSignals, type StrategyName } from "./stockSignals.js";
import { searchSymbolMaster } from "./symbolMaster.js";
import {
  createStockScreenerRun,
  finishStockScreenerRun,
  insertStockScreenerResults,
} from "./store.js";

function nowIso() {
  return new Date().toISOString();
}

function ymdToday() {
  return nowIso().slice(0, 10).replaceAll("-", "");
}

function isoToYmd(iso: string) {
  return String(iso || "").slice(0, 10).replaceAll("-", "");
}

function dayAdd(ymd: string, deltaDays: number) {
  const m = String(ymd || "").match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + deltaDays);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${mo}${da}`;
}

export async function runStockScreener(args: {
  user_id: number;
  strategy: StrategyName;
  freq: "1d" | "1w" | "1m";
  topN?: number;
  lookbackDays?: number; // how many recent trade dates to build candles from (approx.)
}): Promise<{ run_id: number }> {
  const effective_asof = ymdToday(); // best-effort; actual data asof is from cache rows
  const topN = Number.isFinite(args.topN) ? Math.max(10, Math.min(200, Math.floor(args.topN!))) : 50;
  const lookbackDays = Number.isFinite(args.lookbackDays) ? Math.max(40, Math.min(200, Math.floor(args.lookbackDays!))) : 80;

  const run = await createStockScreenerRun({
    user_id: args.user_id,
    strategy: args.strategy,
    effective_asof: `${effective_asof.slice(0, 4)}-${effective_asof.slice(4, 6)}-${effective_asof.slice(6, 8)}`,
    freq: args.freq,
    params_json: { topN, lookbackDays },
  });

  try {
    // 实际情况：避免对每个股票逐个拉行情（会被限频）。
    // 采用“按交易日批量拉全市场 daily”方式，取近 lookbackDays*2 天窗口，跳过无数据日期。
    const end = ymdToday();
    const start = dayAdd(end, -lookbackDays * 2);

    // Pull daily rows in one range per date (trade_date) to reduce requests.
    // We'll just try each day in [start..end], skipping empty responses (weekend/holiday).
    const days: string[] = [];
    for (let d = start; d <= end; ) {
      days.push(d);
      d = dayAdd(d, 1);
      if (!d) break;
    }

    // Build per-symbol candles from fetched rows.
    const perSymbol = new Map<
      string,
      Array<{ t: string; open: number; high: number; low: number; close: number; vol: number; amount: number }>
    >();

    for (const trade_date of days) {
      const rows = await tushareQuery({
        api_name: "daily",
        params: { trade_date },
        fields: ["ts_code", "trade_date", "open", "high", "low", "close", "vol", "amount"],
      });
      if (!rows?.length) continue;
      for (const r of rows as any[]) {
        const sym = String(r.ts_code || "").toUpperCase();
        if (!sym) continue;
        const arr = perSymbol.get(sym) || [];
        arr.push({
          t: String(r.trade_date),
          open: Number(r.open),
          high: Number(r.high),
          low: Number(r.low),
          close: Number(r.close),
          vol: Number(r.vol),
          amount: Number(r.amount),
        });
        perSymbol.set(sym, arr);
      }
    }

    // Compute signals and rank.
    const scored: Array<{
      symbol: string;
      score: number | null;
      reasons_json: Record<string, unknown>;
      snapshot_json: Record<string, unknown>;
    }> = [];

    for (const [symbol, candles] of perSymbol.entries()) {
      candles.sort((a, b) => String(a.t).localeCompare(String(b.t)));
      const last = candles[candles.length - 1];
      if (!last) continue;
      const recent = candles.slice(Math.max(0, candles.length - lookbackDays));
      const { signals, reasons_json } = computeSignals({ candlesAsc: recent });
      const s = signals.find((x) => x.strategy === args.strategy);
      const scoreRaw = (reasons_json as any)?.scores?.[args.strategy];
      const score = scoreRaw == null ? null : Number(scoreRaw);
      // Only consider hit/near; miss will be placed after anyway.
      const status = s?.status || "miss";
      const statusBoost = status === "hit" ? 1000 : status === "near" ? 500 : 0;
      scored.push({
        symbol,
        score: score == null || !Number.isFinite(score) ? null : score,
        reasons_json: reasons_json as any,
        snapshot_json: {
          ts_code: symbol,
          asof: `${String(last.t).slice(0, 4)}-${String(last.t).slice(4, 6)}-${String(last.t).slice(6, 8)}`,
          close: last.close,
          status,
        },
      });
      // Use statusBoost in sort (below) without mutating stored score.
      (scored[scored.length - 1] as any)._rank = statusBoost + (Number.isFinite(score) ? Number(score) : 0);
    }

    scored.sort((a: any, b: any) => Number(b._rank || 0) - Number(a._rank || 0));
    const top = scored.slice(0, topN);

    // Enrich name in bulk-ish: use symbolMaster cache search by code.
    // We do best-effort: if cache isn't ready, keep name null.
    const enriched = [];
    for (const it of top) {
      const code = String(it.symbol).split(".")[0] || "";
      let name: string | null = null;
      try {
        const hits = await searchSymbolMaster({ q: code, limit: 1 });
        const hit = hits?.[0] as any;
        if (hit?.ts_code && String(hit.ts_code).toUpperCase() === it.symbol.toUpperCase()) name = String(hit.name || "") || null;
      } catch {
        // ignore
      }
      enriched.push({ ...it, name });
    }

    await insertStockScreenerResults({
      run_id: run.id,
      items: enriched.map((x) => ({
        symbol: x.symbol,
        name: x.name,
        score: x.score,
        snapshot_json: x.snapshot_json,
        reasons_json: x.reasons_json,
      })),
    });

    await finishStockScreenerRun({ run_id: run.id, status: "success" });
    return { run_id: run.id };
  } catch (e: any) {
    await finishStockScreenerRun({ run_id: run.id, status: "failed", error: String(e?.message || e) });
    throw e;
  }
}

