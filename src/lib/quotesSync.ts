import { tushareQuery } from "./tushareClient.js";
import { upsertStockDailyRows, getStockDailyMaxDate, type StockDailyRow } from "./store.js";

async function withTimeout<T>(p: Promise<T>, ms: number, code = "timeout"): Promise<T> {
  let t: any = null;
  const timeout = new Promise<T>((_, rej) => {
    t = setTimeout(() => rej(Object.assign(new Error(code), { code })), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${da}`;
}

function dayAdd(ymdStr: string, deltaDays: number): string {
  const m = String(ymdStr || "").match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return "";
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return ymd(d);
}

function shanghaiTodayYmd(): string {
  const now = new Date();
  const shanghai = new Date(now.getTime() + (8 * 60 - now.getTimezoneOffset() * -1) * 60 * 1000);
  return ymd(shanghai);
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

let isSyncing = false;
const progress: SyncProgress = { running: false };

export function isQuotesSyncing(): boolean {
  return isSyncing;
}

export function getQuotesSyncProgress(): SyncProgress {
  return { ...progress };
}

/**
 * 同步 stock_daily_cache：默认从“上次缓存最大日期+1”同步到今天。
 * 也可指定 args.start/end（YYYYMMDD 或 YYYY-MM-DD）。
 */
export async function syncStockDaily(args?: {
  start?: string;
  end?: string;
  /** 最近 N 天（覆盖 start/end 计算） */
  lastNDays?: number;
  /** 最近 N 个交易日（覆盖 start/end 计算；优先级高于 lastNDays） */
  lastNTradeDays?: number;
}): Promise<SyncQuotesResult> {
  if (isSyncing) {
    return {
      ok: false,
      start_date: "",
      end_date: "",
      trade_dates_attempted: [],
      trade_dates_with_data: [],
      rows_upserted: 0,
      errors: [{ trade_date: "", error: "already_syncing" }],
    };
  }
  isSyncing = true;
  progress.running = true;
  progress.start_date = "";
  progress.end_date = "";
  progress.total = 0;
  progress.done = 0;
  progress.current_date = "";
  progress.rows_upserted = 0;
  progress.errors = 0;
  progress.started_at = new Date().toISOString();
  try {
    const end = (args?.end || shanghaiTodayYmd()).replaceAll("-", "");
    let start = (args?.start || "").replaceAll("-", "");
    if (!start) {
      if (Number.isFinite(args?.lastNTradeDays)) {
        const n = Math.max(1, Math.floor(args!.lastNTradeDays!));
        // 用交易日历计算最近 N 个交易日的起点，避免“90天=自然日”导致交易日不足。
        let lookback = Math.max(120, n * 3);
        let openDates: string[] = [];
        for (let tries = 0; tries < 3; tries++) {
          const calStart = dayAdd(end, -lookback);
          const calRows = await withTimeout(
            tushareQuery({
              api_name: "trade_cal",
              params: { start_date: calStart, end_date: end, exchange: "SSE" },
              fields: ["cal_date", "is_open"],
            }),
            25_000,
            "tushare_trade_cal_timeout"
          );
          openDates = (calRows as any[])
            .filter((r) => Number(r?.is_open) === 1)
            .map((r) => String(r?.cal_date || "").trim())
            .filter((d) => /^\d{8}$/.test(d))
            .sort();
          if (openDates.length >= n) break;
          lookback *= 2;
        }
        if (openDates.length >= n) start = openDates[openDates.length - n];
        else start = dayAdd(end, -Math.max(1, n));
      } else if (Number.isFinite(args?.lastNDays)) {
        start = dayAdd(end, -Math.max(1, Math.floor(args!.lastNDays!)));
      } else {
        const maxDate = await getStockDailyMaxDate();
        if (maxDate && /^\d{8}$/.test(maxDate)) {
          start = dayAdd(maxDate, 1);
        } else {
          // 冷启动：默认拉取最近 90 天
          start = dayAdd(end, -90);
        }
      }
    }
    if (!/^\d{8}$/.test(start) || !/^\d{8}$/.test(end) || start > end) {
      return {
        ok: false,
        start_date: start,
        end_date: end,
        trade_dates_attempted: [],
        trade_dates_with_data: [],
        rows_upserted: 0,
        errors: [{ trade_date: "", error: "invalid_date_range" }],
      };
    }

    let dates: string[] = [];
    if (Number.isFinite(args?.lastNTradeDays) && !(args?.start || args?.end)) {
      // trade_cal 已经用于算 start，这里直接再取一遍 open dates 作为“尝试日期”，让进度条以交易日计数。
      const calRows = await withTimeout(
        tushareQuery({
          api_name: "trade_cal",
          params: { start_date: start, end_date: end, exchange: "SSE" },
          fields: ["cal_date", "is_open"],
        }),
        25_000,
        "tushare_trade_cal_timeout"
      );
      dates = (calRows as any[])
        .filter((r) => Number(r?.is_open) === 1)
        .map((r) => String(r?.cal_date || "").trim())
        .filter((d) => /^\d{8}$/.test(d))
        .sort();
    } else {
      for (let d = start; d && d <= end; d = dayAdd(d, 1)) dates.push(d);
    }

    progress.start_date = start;
    progress.end_date = end;
    progress.total = dates.length;

    const withData: string[] = [];
    const errors: Array<{ trade_date: string; error: string }> = [];
    let totalRows = 0;

    for (const trade_date of dates) {
      progress.current_date = trade_date;
      try {
        const rows = await withTimeout(
          tushareQuery({
            api_name: "daily",
            params: { trade_date },
            fields: ["ts_code", "trade_date", "open", "high", "low", "close", "vol", "amount"],
          }),
          25_000,
          "tushare_daily_timeout"
        );
        if (rows?.length) {
          const mapped: StockDailyRow[] = (rows as any[]).map((r) => ({
            ts_code: String(r.ts_code || "").toUpperCase(),
            trade_date: String(r.trade_date),
            open: Number(r.open),
            high: Number(r.high),
            low: Number(r.low),
            close: Number(r.close),
            vol: Number(r.vol),
            amount: Number(r.amount),
          }));
          const n = await upsertStockDailyRows(mapped);
          totalRows += n;
          withData.push(trade_date);
          progress.rows_upserted = totalRows;
        }
      } catch (e: any) {
        errors.push({ trade_date, error: String(e?.message || e) });
        progress.errors = errors.length;
      }
      progress.done = (progress.done || 0) + 1;
    }

    const summary = `${start}~${end}：覆盖 ${withData.length}/${dates.length} 个交易日，写入 ${totalRows} 行${errors.length ? `，失败 ${errors.length}` : ""}`;
    progress.last_summary = summary;
    progress.last_finished_at = new Date().toISOString();

    return {
      ok: errors.length === 0,
      start_date: start,
      end_date: end,
      trade_dates_attempted: dates,
      trade_dates_with_data: withData,
      rows_upserted: totalRows,
      errors,
    };
  } finally {
    isSyncing = false;
    progress.running = false;
    progress.current_date = "";
  }
}
