type TushareRequest = {
  api_name: string;
  token: string;
  params?: Record<string, unknown>;
  fields?: string;
};

type TushareResponse<T = any> = {
  code: number;
  msg?: string;
  data?: { fields: string[]; items: any[][] };
};

function tushareToken(): string {
  const t = process.env.TUSHARE_TOKEN?.trim();
  if (!t) throw new Error("tushare_token_not_set");
  return t;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function tushareQueryRaw(args: {
  api_name: string;
  params?: Record<string, unknown>;
  fields?: string[];
}): Promise<Array<Record<string, any>>> {
  const token = tushareToken();
  const body: TushareRequest = {
    api_name: args.api_name,
    token,
    params: args.params ?? {},
    fields: args.fields?.join(","),
  };
  const res = await fetch("https://api.tushare.pro", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`tushare_http_${res.status}`);
  const json = (await res.json()) as TushareResponse;
  if (json.code !== 0) throw new Error(String(json.msg || `tushare_error_${json.code}`));
  const fields = json.data?.fields || [];
  const items = json.data?.items || [];
  return items.map((row) => {
    const out: Record<string, any> = {};
    for (let i = 0; i < fields.length; i++) out[fields[i]] = row[i];
    return out;
  });
}

/** 仅对可恢复错误重试（5xx / 频控 / 超时类）；非业务错误 */
function isTransientTushareError(err: any): boolean {
  const msg = String(err?.message || err || "");
  if (/tushare_http_(5\d\d|429)/.test(msg)) return true;
  if (/timeout|aborted|ECONN|ENOTFOUND|fetch failed/i.test(msg)) return true;
  if (/抱歉|频率|超过|每分钟/.test(msg)) return true;
  return false;
}

/** daily API 失败时尝试从 stock_daily_cache 兜底（仅对单标的 + start_date/end_date 组合） */
async function fallbackDailyFromCache(args: {
  api_name: string;
  params?: Record<string, unknown>;
}): Promise<Array<Record<string, any>>> {
  if (args.api_name !== "daily") throw new Error("no_cache_fallback");
  const ts_code = String((args.params as any)?.ts_code || "").trim();
  const start_date = String((args.params as any)?.start_date || "").trim();
  const end_date = String((args.params as any)?.end_date || "").trim();
  if (!ts_code || !start_date || !end_date) throw new Error("no_cache_fallback");
  // 动态引入避免顶层循环依赖
  const mod = await import("./store.js");
  const rows = await (mod as any).getStockDailyRange?.({
    ts_code,
    start_date,
    end_date,
  });
  if (!rows || !rows.length) throw new Error("no_cache_data");
  // 兜底无 pre_close/pct_chg：补 null，避免上游 NaN
  return rows.map((r: any) => ({
    ts_code: r.ts_code,
    trade_date: r.trade_date,
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    pre_close: null,
    pct_chg: null,
    vol: Number(r.vol),
    amount: Number(r.amount),
  }));
}

export async function tushareQuery<T = any>(args: {
  api_name: string;
  params?: Record<string, unknown>;
  fields?: string[];
}): Promise<Array<Record<string, any>>> {
  let lastErr: any = null;
  // 一次正常 + 一次重试（指数退避 800ms）
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await tushareQueryRaw(args);
    } catch (e: any) {
      lastErr = e;
      if (!isTransientTushareError(e)) break;
      if (attempt === 0) await sleep(800);
    }
  }
  // 兜底：daily API 走本地 cache
  try {
    return await fallbackDailyFromCache(args);
  } catch {
    throw lastErr;
  }
}

