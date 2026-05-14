import { syncStockDaily } from "./quotesSync.js";

let timer: NodeJS.Timeout | null = null;

/**
 * 计算下次"上海时区 17:00"的本地等效毫秒延时。
 */
function msUntilNextShanghai1700(): number {
  const now = new Date();
  // 上海时区固定 UTC+8。先得到当前的"上海挂钟时间"。
  const utcMs = now.getTime();
  const shTime = new Date(utcMs + 8 * 3600 * 1000);
  const shY = shTime.getUTCFullYear();
  const shM = shTime.getUTCMonth();
  const shD = shTime.getUTCDate();
  // 目标：今天上海 17:00（对应 UTC 09:00）
  let targetUtc = Date.UTC(shY, shM, shD, 9, 0, 0, 0);
  if (targetUtc <= utcMs) {
    targetUtc = Date.UTC(shY, shM, shD + 1, 9, 0, 0, 0);
  }
  return targetUtc - utcMs;
}

function isWeekendInShanghai(): boolean {
  const utcMs = Date.now();
  const sh = new Date(utcMs + 8 * 3600 * 1000);
  const day = sh.getUTCDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}

async function runDailyJob() {
  if (isWeekendInShanghai()) {
    console.log("[quotes-sync] skipped: weekend in Shanghai");
    return;
  }
  try {
    console.log("[quotes-sync] start daily job at", new Date().toISOString());
    const r = await syncStockDaily({});
    console.log(
      `[quotes-sync] done. range=${r.start_date}~${r.end_date}, tradeDays=${r.trade_dates_with_data.length}, rows=${r.rows_upserted}, errors=${r.errors.length}`
    );
  } catch (e: any) {
    console.error("[quotes-sync] failed:", e?.message || e);
  }
}

/**
 * 启动每日 17:00（上海时区）自动同步行情任务。
 */
export function startQuotesSyncScheduler() {
  if (timer) return;
  const schedule = () => {
    const delay = msUntilNextShanghai1700();
    timer = setTimeout(async () => {
      await runDailyJob();
      schedule();
    }, delay);
    const next = new Date(Date.now() + delay).toISOString();
    console.log(`[quotes-sync] next run at ${next} (in ${Math.round(delay / 1000)}s)`);
  };
  schedule();
}

export function stopQuotesSyncScheduler() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
