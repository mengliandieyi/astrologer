type FortuneTextRow = {
  gan_zhi?: string;
  summary?: string;
  love?: string;
  wealth?: string;
  career?: string;
  health?: string;
};

type DaYunRow = FortuneTextRow & {
  start_year?: number;
  end_year?: number;
};

type LiuNianRow = FortuneTextRow & {
  year?: number;
};

type LiuYueRow = FortuneTextRow & {
  year?: number;
  month?: number;
};

type DreamFortuneChart = {
  fortune_cycles?: {
    da_yun?: DaYunRow[];
    liu_nian_preview?: LiuNianRow[];
    liu_yue_preview?: LiuYueRow[];
  };
};

function dateParts(now: Date): { ymd: string; year: number; month: number } {
  const ymd = now.toISOString().slice(0, 10);
  const [y, m] = ymd.split("-").map((x) => Number(x));
  return { ymd, year: y, month: m };
}

function rowText(row: FortuneTextRow | null | undefined): string {
  if (!row) return "未命中";
  const parts = [
    row.gan_zhi ? `干支：${row.gan_zhi}` : "",
    row.summary ? `总述：${row.summary}` : "",
    row.career ? `事业：${row.career}` : "",
    row.wealth ? `财运：${row.wealth}` : "",
    row.love ? `感情：${row.love}` : "",
    row.health ? `健康：${row.health}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join("；") : "已命中，但暂无详细文字";
}

export function buildDreamFortuneContext(chart: DreamFortuneChart, now = new Date()): string {
  const { ymd, year, month } = dateParts(now);
  const cycles = chart.fortune_cycles || {};
  const daYun =
    cycles.da_yun?.find((x) => Number(x.start_year) <= year && year <= Number(x.end_year)) ||
    null;
  const liuNian = cycles.liu_nian_preview?.find((x) => Number(x.year) === year) || null;
  const liuYue =
    cycles.liu_yue_preview?.find((x) => Number(x.year) === year && Number(x.month) === month) ||
    null;

  return [
    `当前日期：${ymd}`,
    daYun
      ? `当前大运：${daYun.start_year ?? "?"}-${daYun.end_year ?? "?"} ${rowText(daYun)}`
      : "当前大运：未在命盘预览中命中",
    liuNian ? `当前流年：${year} ${rowText(liuNian)}` : `当前流年：${year} 未在命盘预览中命中`,
    liuYue ? `当前流月：${year}年${month}月 ${rowText(liuYue)}` : `当前流月：${year}年${month}月 未在命盘预览中命中`,
  ].join("\n");
}
