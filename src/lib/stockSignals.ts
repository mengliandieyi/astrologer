export type StrategyName = "左侧埋伏" | "右侧确认" | "超短反转";
export type StrategyStatus = "hit" | "near" | "miss";

const STRATEGY_MIN_BARS = (() => {
  const v = Number(process.env.SCREENER_MIN_BARS ?? 60);
  if (!Number.isFinite(v)) return 60;
  return Math.max(30, Math.min(120, Math.floor(v)));
})();

export type StrategySignal = {
  strategy: StrategyName;
  status: StrategyStatus;
  why: string[];
  /** 0-100，与大富翁 B1/B2/B3 同口径 */
  score?: number;
  /** 仅左侧埋伏（B1）使用：1/2/3/4 类买点 */
  b1_category?: number;
  b1_category_label?: string;
};

export type SignalsResult = {
  signals: StrategySignal[];
  reasons_json: Record<string, any>;
};

type Candle = { t: string; open: number; high: number; low: number; close: number; vol: number; amount: number };

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function sma(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  let sum = 0;
  const q: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    q.push(v);
    sum += v;
    if (q.length > period) sum -= q.shift()!;
    if (q.length === period) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Array<number | null> {
  if (period <= 1) return values.map((v) => (Number.isFinite(v) ? v : null));
  const k = 2 / (period + 1);
  const out: Array<number | null> = new Array(values.length).fill(null);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) {
      out[i] = null;
      continue;
    }
    if (prev === null) prev = v;
    else prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const eFast = ema(values, fast);
  const eSlow = ema(values, slow);
  const dif: Array<number | null> = values.map((_, i) => {
    const a = eFast[i];
    const b = eSlow[i];
    if (a == null || b == null) return null;
    return a - b;
  });
  const difFilled = dif.map((d) => (d == null ? 0 : d));
  const dea = ema(difFilled, signal);
  const hist: Array<number | null> = dif.map((d, i) => {
    const s = dea[i];
    if (d == null || s == null) return null;
    return (d - s) * 2;
  });
  return { dif, dea, hist };
}

/** 最近一根 K 相对前一根是否出现常见技术信号（用于列表/导出展示；不构成投资建议）。 */
function collectTechnicalSignalTags(args: {
  i: number;
  dif: Array<number | null>;
  dea: Array<number | null>;
  k: number[];
  d: number[];
  ma5: Array<number | null>;
  ma20: Array<number | null>;
  rsi: Array<number | null>;
}): string[] {
  const { i, dif, dea, k, d, ma5, ma20, rsi } = args;
  const tags: string[] = [];
  if (i < 1) return tags;

  const di = dif[i];
  const de = dea[i];
  const dip = dif[i - 1];
  const dep = dea[i - 1];
  if (di != null && de != null && dip != null && dep != null) {
    if (dip <= dep && di > de) tags.push("MACD金叉");
    if (dip >= dep && di < de) tags.push("MACD死叉");
    if (dip <= 0 && di > 0) tags.push("DIF上穿0轴");
    if (dip >= 0 && di < 0) tags.push("DIF下穿0轴");
  }

  const ki = k[i];
  const kd = d[i];
  const kip = k[i - 1];
  const kdp = d[i - 1];
  if (Number.isFinite(ki) && Number.isFinite(kd) && Number.isFinite(kip) && Number.isFinite(kdp)) {
    if (kip <= kdp && ki > kd) tags.push("KDJ金叉");
    if (kip >= kdp && ki < kd) tags.push("KDJ死叉");
  }

  const m5 = ma5[i];
  const m20 = ma20[i];
  const m5p = ma5[i - 1];
  const m20p = ma20[i - 1];
  if (m5 != null && m20 != null && m5p != null && m20p != null) {
    if (m5p <= m20p && m5 > m20) tags.push("MA5上穿MA20");
    if (m5p >= m20p && m5 < m20) tags.push("MA5下穿MA20");
  }

  const ri = rsi[i];
  const rip = rsi[i - 1];
  if (ri != null && rip != null) {
    if (rip < 30 && ri >= 30) tags.push("RSI上穿30");
    if (rip > 70 && ri <= 70) tags.push("RSI下穿70");
  }

  return tags;
}

/** KDJ：与大富翁一致，N=9，K/D 用 SMA 迭代（(M-1)/M * prev + 1/M * cur） */
export function kdj(rows: Array<{ high: number; low: number; close: number }>, n = 9, m1 = 3, m2 = 3) {
  const len = rows.length;
  const rsv: Array<number> = new Array(len).fill(0);
  for (let i = 0; i < len; i++) {
    const lo = Math.max(0, i - (n - 1));
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = lo; j <= i; j++) {
      hh = Math.max(hh, rows[j].high);
      ll = Math.min(ll, rows[j].low);
    }
    const den = hh - ll;
    rsv[i] = den === 0 ? 0 : ((rows[i].close - ll) / den) * 100;
  }
  const kArr: number[] = new Array(len).fill(50);
  const dArr: number[] = new Array(len).fill(50);
  const jArr: number[] = new Array(len).fill(50);
  let kPrev = 50;
  let dPrev = 50;
  for (let i = 0; i < len; i++) {
    const kNow = ((m1 - 1) / m1) * kPrev + (1 / m1) * rsv[i];
    const dNow = ((m2 - 1) / m2) * dPrev + (1 / m2) * kNow;
    kArr[i] = kNow;
    dArr[i] = dNow;
    jArr[i] = 3 * kNow - 2 * dNow;
    kPrev = kNow;
    dPrev = dNow;
  }
  return { k: kArr, d: dArr, j: jArr };
}

/** RSI(period)：使用 SMA 平均（与大富翁默认 rolling 平均一致） */
export function rsi(values: number[], period: number): Array<number | null> {
  const len = values.length;
  const out: Array<number | null> = new Array(len).fill(null);
  const gains: number[] = new Array(len).fill(0);
  const losses: number[] = new Array(len).fill(0);
  for (let i = 1; i < len; i++) {
    const diff = values[i] - values[i - 1];
    gains[i] = diff > 0 ? diff : 0;
    losses[i] = diff < 0 ? -diff : 0;
  }
  for (let i = 0; i < len; i++) {
    if (i < period) continue;
    let sg = 0;
    let sl = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sg += gains[j];
      sl += losses[j];
    }
    const avgG = sg / period;
    const avgL = sl / period;
    if (avgL === 0) out[i] = avgG === 0 ? 50 : 100;
    else {
      const rs = avgG / avgL;
      out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}

/** Bollinger 布林带（period, mult），与前端口径一致：mid=SMA(period)，up/low=mid±mult*std */
export function bollinger(values: number[], period = 20, mult = 2) {
  const mid = sma(values, period);
  const up: Array<number | null> = new Array(values.length).fill(null);
  const low: Array<number | null> = new Array(values.length).fill(null);
  if (period <= 1) return { mid, up, low };
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    let sum = 0;
    for (let j = i - (period - 1); j <= i; j++) sum += values[j];
    const mean = sum / period;
    let vSum = 0;
    for (let j = i - (period - 1); j <= i; j++) {
      const d = values[j] - mean;
      vSum += d * d;
    }
    const sd = Math.sqrt(vSum / period);
    up[i] = mean + mult * sd;
    low[i] = mean - mult * sd;
  }
  return { mid, up, low };
}

/** ---------- 大富翁 B1 / B2 / B3 工具函数 ---------- */

const B1_CATEGORY_LABELS: Record<number, string> = {
  1: "类型一（十字星/小实体止跌，如华纳药厂、瑞芯生物）",
  2: "类型二（长下影/锤子线止跌，如方正科技、宁波韵升）",
  3: "类型三（早晨之星/启明星止跌，如昂利康、淳中科技）",
  4: "类型四（回踩MA20/MA60止跌，如澄天伟业、国轩高科）",
  0: "未明确归类",
};

function maContext(curr: Candle, ma20: number | null, ma60: number | null): string {
  if (!ma60 || ma60 <= 0) return "";
  const c = curr.close;
  const l = curr.low;
  const dist_l_ma20 = ma20 && ma20 > 0 ? Math.abs(l - ma20) / ma20 : 1;
  const dist_l_ma60 = Math.abs(l - ma60) / ma60;
  const aboveMa60 = c > ma60;
  const aboveMa20 = ma20 != null && ma20 > 0 ? c > ma20 : true;
  if (dist_l_ma20 <= 0.02) return "回踩MA20";
  if (dist_l_ma60 <= 0.02) return "回踩MA60";
  if (aboveMa20 && aboveMa60) {
    if (ma20 != null && ma20 > ma60) return "MA20上方(多头)";
    return "站上MA60";
  }
  if (aboveMa60 && !aboveMa20) return "MA20与MA60之间";
  return "贴近MA60";
}

function classifyB1BuyPoint(
  c: Candle[],
  ma20Arr: Array<number | null>,
  ma60Arr: Array<number | null>
): { category: number; label: string } {
  if (c.length < 3) return { category: 0, label: B1_CATEGORY_LABELS[0] };
  const i = c.length - 1;
  const curr = c[i];
  const prev = c[i - 1];
  const o = curr.open;
  const h = curr.high;
  const l = curr.low;
  const cl = curr.close;
  const body = Math.abs(cl - o);
  const bodyPct = body / (o || 1);
  const lowerShadow = Math.min(o, cl) - l;
  const upperShadow = h - Math.max(o, cl);
  const openVal = o || 1;
  const ma20 = ma20Arr[i];
  const ma60 = ma60Arr[i];
  const maCtx = maContext(curr, ma20, ma60);
  const label = (base: string) => (maCtx ? `${base}，${maCtx}` : base);

  // 类型四：回踩 MA20/MA60（2%内）且小实体
  if (ma20 != null && ma20 > 0) {
    if (Math.abs(l - ma20) / ma20 <= 0.02 && bodyPct <= 0.03) {
      return { category: 4, label: label(B1_CATEGORY_LABELS[4]) };
    }
  }
  if (ma60 != null && ma60 > 0) {
    if (Math.abs(l - ma60) / ma60 <= 0.02 && bodyPct <= 0.03) {
      return { category: 4, label: label(B1_CATEGORY_LABELS[4]) };
    }
  }
  // 类型三：早晨之星雏形
  const prevDown = prev.close < prev.open;
  const todayNotBigDown = cl >= o || bodyPct <= 0.02;
  const lowNearPrev = prev.low > 0 ? l <= prev.low * 1.01 : true;
  if (prevDown && todayNotBigDown && lowNearPrev && bodyPct <= 0.04) {
    return { category: 3, label: label(B1_CATEGORY_LABELS[3]) };
  }
  // 类型二：长下影锤子
  const lowerRatio = lowerShadow / openVal;
  if (lowerRatio >= 0.015 && lowerShadow > body && bodyPct <= 0.04) {
    return { category: 2, label: label(B1_CATEGORY_LABELS[2]) };
  }
  // 类型一：十字星/小实体
  if (bodyPct <= 0.02) {
    return { category: 1, label: label(B1_CATEGORY_LABELS[1]) };
  }
  if (bodyPct <= 0.04 && (lowerRatio >= 0.01 || upperShadow / openVal >= 0.01)) {
    return { category: 1, label: label(B1_CATEGORY_LABELS[1]) };
  }
  return { category: 0, label: B1_CATEGORY_LABELS[0] };
}

/** 出货形态（5 类）：参考大富翁 _has_distribution_pattern */
function hasDistributionPattern(
  c: Candle[],
  volMa5Arr: Array<number | null>,
  difArr: Array<number | null>,
  jArr: Array<number | null>,
  lookback = 60
): { hit: boolean; reason: string } {
  if (c.length < 60) return { hit: false, reason: "" };
  const use = Math.min(lookback, c.length);
  const startIdx = c.length - use;
  const idxs: number[] = [];
  for (let i = startIdx; i < c.length; i++) idxs.push(i);
  const n = idxs.length;

  // 1. 天量大阴线
  for (const i of idxs) {
    const row = c[i];
    if (row.close >= row.open) continue;
    const vMa5 = volMa5Arr[i];
    if (!vMa5 || row.vol < vMa5 * 2.2) continue;
    const bodyPct = Math.abs(row.close - row.open) / (row.open || 1);
    if (bodyPct >= 0.03) return { hit: true, reason: "近期天量大阴线(出货)" };
  }
  // 2. 次高点巨阴
  for (let k = Math.max(0, n - 25); k < n; k++) {
    const i = idxs[k];
    if (k === 0 || i === 0) continue;
    const row = c[i];
    const prevClose = c[i - 1].close;
    if (prevClose <= 0) continue;
    const pct = (row.close - prevClose) / prevClose;
    if (pct >= -0.06) continue;
    if (row.close >= row.open) continue;
    const vMa5 = volMa5Arr[i];
    if (!vMa5 || row.vol < vMa5 * 1.8) continue;
    const start = Math.max(startIdx, i - 20);
    let high20 = 0;
    for (let j = start; j < i; j++) high20 = Math.max(high20, c[j].high);
    if (high20 && row.open >= high20 * 0.98) return { hit: true, reason: "近期次高点巨阴(出货)" };
  }
  // 3. 阶梯放量下跌（最近5日）
  if (n >= 5) {
    const last5 = c.slice(c.length - 5);
    let badDays = 0;
    for (let j = 1; j < 5; j++) {
      if (last5[j].close < last5[j].open && last5[j].vol > last5[j - 1].vol) badDays += 1;
    }
    const c0 = last5[0].close;
    const c4 = last5[4].close;
    if (badDays >= 3 && c0 > 0 && (c4 - c0) / c0 < -0.03) {
      return { hit: true, reason: "近期阶梯放量下跌(出货)" };
    }
  }
  // 4. 海油发展式（高位天量绿柱 + DIF/J 拐头）
  let highN = -Infinity;
  for (const i of idxs) highN = Math.max(highN, c[i].high);
  for (let k = 1; k < Math.min(n, 25); k++) {
    const i = idxs[k];
    const row = c[i];
    const prevRow = c[i - 1];
    if (row.close >= row.open) continue;
    const vMa5 = volMa5Arr[i];
    if (!vMa5 || row.vol < vMa5 * 2.0) continue;
    if (!highN || row.high < highN * 0.88) continue;
    const dif = difArr[i];
    const difPrev = difArr[i - 1];
    const j = jArr[i];
    const jPrev = jArr[i - 1];
    const difDown = dif != null && difPrev != null && dif < difPrev;
    const jDown = j != null && jPrev != null && j < jPrev;
    if (difDown || jDown) return { hit: true, reason: "近期高位天量绿柱+指标拐头(出货)" };
    // 注意：j/dif 的位置参考 prevRow 仅为类型保持，不阻断
    void prevRow;
  }
  // 5. 最高点次日放量下跌
  if (n >= 4) {
    let highLookback = -Infinity;
    for (const i of idxs) highLookback = Math.max(highLookback, c[i].high);
    for (let k = 0; k < n - 1; k++) {
      const i = idxs[k];
      if (!highLookback || c[i].high < highLookback * 0.99) continue;
      const start = Math.max(startIdx, i - 20);
      let winHigh = 0;
      for (let j = start; j <= i; j++) winHigh = Math.max(winHigh, c[j].high);
      if (c[i].high < winHigh * 0.998) continue;
      const next = c[i + 1];
      if (next.close >= next.open) continue;
      const prevClose = c[i].close;
      if (prevClose > 0) {
        const pct = (next.close - prevClose) / prevClose;
        if (pct > -0.01) continue;
      }
      const baseMa5 = volMa5Arr[i + 1];
      if (!baseMa5 || baseMa5 <= 0) continue;
      const nextVol = next.vol || 0;
      const prevVol = c[i].vol || 0;
      if (nextVol >= baseMa5 * 1.5 && (prevVol <= 0 || nextVol >= prevVol * 1.2)) {
        return { hit: true, reason: "近期最高点次日放量下跌(出货)" };
      }
    }
  }
  return { hit: false, reason: "" };
}

/** RSI 谷底（与大富翁 _find_rsi_troughs 对齐：window=5，仅在 rsi<=50 处） */
function findRsiTroughs(rsiTail: Array<number | null>, rsiMax = 50, window = 5): number[] {
  const out: number[] = [];
  const n = rsiTail.length;
  if (n < 2 * window + 1) return out;
  for (let i = window; i < n - window; i++) {
    const v = rsiTail[i];
    if (v == null || v > rsiMax) continue;
    let isMin = true;
    for (let j = i - window; j <= i + window; j++) {
      const x = rsiTail[j];
      if (x != null && x < v) {
        isMin = false;
        break;
      }
    }
    if (isMin) out.push(i);
  }
  return out;
}

function hasDoubleBottomDivergence(
  closeTail: number[],
  rsiTail: Array<number | null>,
  minGap = 8,
  rsiFirstMax = 40,
  minRise = 2.5
): { hit: boolean; details: { rsi_up1?: number; rsi_up2?: number } } {
  const troughs = findRsiTroughs(rsiTail, 50, 5);
  if (troughs.length < 3) return { hit: false, details: {} };
  for (let k = 0; k < troughs.length - 2; k++) {
    const i1 = troughs[k];
    const i2 = troughs[k + 1];
    const i3 = troughs[k + 2];
    const r1 = rsiTail[i1];
    const r2 = rsiTail[i2];
    const r3 = rsiTail[i3];
    if (r1 == null || r2 == null || r3 == null) continue;
    if (r1 > rsiFirstMax) continue;
    if (i2 - i1 < minGap || i3 - i2 < minGap) continue;
    const pair1 = closeTail[i2] < closeTail[i1] && r2 > r1 && r2 - r1 >= minRise;
    if (!pair1) continue;
    const priceOk = closeTail[i3] <= closeTail[i2] * 1.005 || closeTail[i3] < closeTail[i2];
    const pair2 = r3 > r2 && r3 - r2 >= minRise && priceOk;
    if (pair2) {
      return { hit: true, details: { rsi_up1: r2 - r1, rsi_up2: r3 - r2 } };
    }
  }
  return { hit: false, details: {} };
}

function statusFromScore100(score: number): StrategyStatus {
  if (score >= 80) return "hit";
  if (score >= 60) return "near";
  return "miss";
}

/** ---------- B1 左侧埋伏 ---------- */
function evalB1(
  c: Candle[],
  ma5: Array<number | null>,
  ma10: Array<number | null>,
  ma20: Array<number | null>,
  ma60: Array<number | null>,
  volMa5: Array<number | null>,
  volMa20: Array<number | null>,
  jArr: number[],
  difArr: Array<number | null>
): StrategySignal {
  const i = c.length - 1;
  const curr = c[i];
  const prev = c[i - 1];
  const why: string[] = [];

  // 初筛硬条件
  if (c.length < STRATEGY_MIN_BARS) {
    return { strategy: "左侧埋伏", status: "miss", why: ["数据不足60天"], score: 0 };
  }
  const dist = hasDistributionPattern(c, volMa5, difArr, jArr);
  if (dist.hit) {
    return { strategy: "左侧埋伏", status: "miss", why: [dist.reason], score: 0 };
  }
  if (prev.close > 0) {
    const chg = (curr.close - prev.close) / prev.close;
    if (Math.abs(chg) >= 0.03) {
      return { strategy: "左侧埋伏", status: "miss", why: [`涨跌幅过大 (${(chg * 100).toFixed(2)}%)`], score: 0 };
    }
  }
  const ma60Now = ma60[i];
  if (ma60Now == null || curr.close <= ma60Now) {
    return { strategy: "左侧埋伏", status: "miss", why: ["股价在MA60之下 (趋势不符)"], score: 0 };
  }
  const bias = (curr.close - ma60Now) / (ma60Now || 1);
  if (bias > 0.5) {
    return { strategy: "左侧埋伏", status: "miss", why: [`乖离率过大 (${(bias * 100).toFixed(2)}%) (高位风险)`], score: 0 };
  }
  const jNow = jArr[i];
  if (jNow >= 30) {
    return { strategy: "左侧埋伏", status: "miss", why: [`J值过高 (${jNow.toFixed(2)}) (未调整到位)`], score: 0 };
  }
  const v5 = volMa5[i];
  if (v5 != null && curr.vol > v5) {
    return { strategy: "左侧埋伏", status: "miss", why: ["未明显缩量 (大于5日均量)"], score: 0 };
  }
  const bodyPct = Math.abs(curr.close - curr.open) / (curr.open || 1);
  if (bodyPct > 0.04) {
    return { strategy: "左侧埋伏", status: "miss", why: [`K线实体过大 (${(bodyPct * 100).toFixed(2)}%)`], score: 0 };
  }
  if (curr.close < curr.open) {
    if (v5 != null && v5 > 0 && curr.vol > v5 * 1.2) {
      return { strategy: "左侧埋伏", status: "miss", why: ["放量阴线 (出货嫌疑)"], score: 0 };
    }
  }

  // 通过硬筛后打分（满分100）
  let score = 0;
  const ma5Now = ma5[i];
  const ma10Now = ma10[i];
  const ma20Now = ma20[i];
  // 趋势 40
  let trendScore = 15;
  let trendDesc = "站上支撑";
  const perfectTrend =
    ma5Now != null &&
    ma20Now != null &&
    ma60Now != null &&
    ma5Now > ma20Now &&
    ma20Now > ma60Now &&
    (ma10Now == null || (ma5Now > ma10Now && ma10Now > ma20Now));
  if (perfectTrend) {
    trendScore = 35;
    trendDesc = "均线多头";
    if (c.length >= 5) {
      const ma20Prev5 = ma20[i - 4];
      if (ma20Now != null && ma20Prev5 != null && ma20Now > ma20Prev5) {
        trendScore = 40;
        trendDesc = "强势多头";
      }
    }
  } else if (ma20Now != null && ma60Now != null && curr.close > ma20Now && ma20Now > ma60Now) {
    trendScore = 25;
    trendDesc = "趋势向上";
  }
  score += trendScore;
  why.push(`趋势：${trendDesc}（${trendScore}/40）`);

  // 量价 25
  let volScore = 10;
  const vMa5 = (v5 ?? 0) + 1;
  const vMa20 = (volMa20[i] ?? 0) + 1;
  const r20 = curr.vol / vMa20;
  const r5 = curr.vol / vMa5;
  if (r20 < 0.6) volScore = 25;
  else if (r5 < 0.8) volScore = 20;
  else if (r5 < 1.0) volScore = 15;
  score += volScore;
  why.push(`缩量度（${volScore}/25）`);

  // 指标与位置 20
  let indScore = 0;
  if (jNow < -10) indScore += 10;
  else if (jNow < 20) indScore += 8;
  else if (jNow < 30) indScore += 6;
  const d60 = ma60Now ? Math.abs(curr.low - ma60Now) / ma60Now : 1;
  const d20 = ma20Now ? Math.abs(curr.low - ma20Now) / ma20Now : 1;
  if (d60 < 0.02 || d20 < 0.02) indScore += 10;
  else if (d60 < 0.05) indScore += 7;
  else indScore += 3;
  score += indScore;
  why.push(`指标与位置（${indScore}/20）`);

  // 图形与盈亏比 15
  const cat = classifyB1BuyPoint(c, ma20, ma60);
  let shapeScore = 7;
  if (cat.category === 1) shapeScore += 2;
  else if (cat.category === 2 || cat.category === 3 || cat.category === 4) shapeScore += 1;
  let recentHigh = -Infinity;
  for (let k = Math.max(0, c.length - 60); k < c.length; k++) recentHigh = Math.max(recentHigh, c[k].high);
  const risk = curr.close - (ma60Now || 0);
  const reward = Math.max(0, recentHigh - curr.close);
  const rr = risk <= 0 ? 10 : reward / risk;
  if (rr >= 3) shapeScore += 5;
  else if (rr >= 2) shapeScore += 3;
  score += shapeScore;
  why.push(`图形与盈亏比（${shapeScore}/15）`);
  why.push(`买点：${cat.label}`);

  const finalScore = Math.min(100, score);
  return {
    strategy: "左侧埋伏",
    status: statusFromScore100(finalScore),
    why: why.slice(0, 6),
    score: round2(finalScore),
    b1_category: cat.category,
    b1_category_label: cat.label,
  };
}

/** ---------- B2 右侧确认 ---------- */
function evalB2(
  c: Candle[],
  ma20: Array<number | null>,
  ma60: Array<number | null>,
  volMa5: Array<number | null>,
  jArr: number[]
): StrategySignal {
  if (c.length < STRATEGY_MIN_BARS) return { strategy: "右侧确认", status: "miss", why: ["数据不足60天"], score: 0 };
  const i = c.length - 1;
  const curr = c[i];
  const prev = c[i - 1];
  const ma60Now = ma60[i];
  const why: string[] = [];

  if (ma60Now == null || curr.close <= ma60Now) {
    return { strategy: "右侧确认", status: "miss", why: ["股价在MA60之下 (趋势不符)"], score: 0 };
  }
  const chg = prev.close > 0 ? (curr.close - prev.close) / prev.close : 0;
  if (chg < 0.04) {
    return { strategy: "右侧确认", status: "miss", why: [`涨幅不足4% (${(chg * 100).toFixed(2)}%)`], score: 0 };
  }
  if (curr.close <= curr.open) {
    return { strategy: "右侧确认", status: "miss", why: ["非阳线"], score: 0 };
  }
  const volUp = curr.vol > prev.vol;
  const isEngulfing = curr.close > prev.open && prev.close < prev.open;
  if (!volUp) {
    const flat = prev.vol > 0 ? curr.vol / (prev.vol + 1) : 0;
    const isFlat = flat >= 0.9 && flat <= 1.1;
    if (!(isFlat && isEngulfing)) {
      return { strategy: "右侧确认", status: "miss", why: ["量能未放大且非阳包阴"], score: 0 };
    }
  }
  if (jArr[i] >= 55) {
    return { strategy: "右侧确认", status: "miss", why: [`J值过高 (${jArr[i].toFixed(2)}) (风险区)`], score: 0 };
  }
  const bias = (curr.close - ma60Now) / (ma60Now || 1);
  if (bias > 0.5) {
    return { strategy: "右侧确认", status: "miss", why: [`乖离率过大 (${(bias * 100).toFixed(2)}%) (高位风险)`], score: 0 };
  }

  // 打分
  let score = 55;
  why.push(`基础（55）`);
  // 形态 20
  let shape = 0;
  const closeVal = curr.close || 1;
  const openVal = curr.open || 1;
  const upper = (curr.high - curr.close) / closeVal;
  if (upper < 0.005) shape += 10;
  else if (upper < 0.01) shape += 5;
  const lower = (curr.open - curr.low) / openVal;
  if (lower < 0.005) shape += 10;
  else if (lower < 0.01) shape += 5;
  score += shape;
  why.push(`形态（${shape}/20）`);

  // 量能 20
  let volScore = 0;
  const ratio = curr.vol / (prev.vol + 1);
  if (ratio >= 1.8) volScore += 10;
  else if (ratio >= 1.5) volScore += 5;
  if (curr.vol > (volMa5[i] ?? 0)) volScore += 10;
  score += volScore;
  why.push(`量能（${volScore}/20）`);

  // 经典形态加分
  let extra = 0;
  const engulf = curr.close > curr.open && prev.close < prev.open && curr.close > prev.open;
  if (engulf) {
    extra += 3;
    why.push("阳包阴 +3");
  }
  const v5 = volMa5[i] ?? 0;
  if (v5 > 0 && c.length >= 5) {
    const prevWasDown = prev.close < prev.open;
    const downer3 = c.length >= 4 && c[c.length - 3].close < c[c.length - 4].close;
    if ((prevWasDown || downer3) && ratio >= 1.3) {
      extra += 4;
      why.push("缩量后放量回补 +4");
    }
  }
  const ma20Now = ma20[i];
  let touched20 = false;
  if (ma20Now && ma20Now > 0 && Math.abs(curr.low - ma20Now) / ma20Now < 0.02) {
    extra += 2;
    touched20 = true;
    why.push("回踩MA20 +2");
  }
  if (!touched20 && ma60Now && ma60Now > 0 && Math.abs(curr.low - ma60Now) / ma60Now < 0.02) {
    extra += 2;
    why.push("回踩MA60 +2");
  }
  score += extra;

  // 突破平台 5
  let high20 = -Infinity;
  if (c.length >= 21) {
    for (let k = c.length - 21; k < c.length - 1; k++) high20 = Math.max(high20, c[k].high);
  } else {
    for (let k = 0; k < c.length - 1; k++) high20 = Math.max(high20, c[k].high);
  }
  if (curr.close > high20) {
    score += 5;
    why.push("突破20日平台 +5");
  }
  const finalScore = Math.min(100, score);
  return {
    strategy: "右侧确认",
    status: statusFromScore100(finalScore),
    why: why.slice(0, 6),
    score: round2(finalScore),
  };
}

/** ---------- B3 超短反转 ---------- */
function evalB3(
  c: Candle[],
  ma20: Array<number | null>,
  ma60: Array<number | null>,
  volMa5: Array<number | null>,
  rsiArr: Array<number | null>
): StrategySignal {
  if (c.length < STRATEGY_MIN_BARS) return { strategy: "超短反转", status: "miss", why: ["数据不足60天"], score: 0 };
  const i = c.length - 1;
  const curr = c[i];
  const rsiCurr = rsiArr[i] ?? 50;

  const tailStart = c.length - 60;
  const closeTail = c.slice(tailStart).map((x) => x.close);
  const rsiTail = rsiArr.slice(tailStart);

  const div = hasDoubleBottomDivergence(closeTail, rsiTail);
  if (!div.hit) {
    return { strategy: "超短反转", status: "miss", why: ["未形成RSI两次底背离"], score: 0 };
  }
  if (rsiCurr > 70) {
    return { strategy: "超短反转", status: "miss", why: [`RSI过高(${rsiCurr.toFixed(1)})，不宜追涨`], score: 0 };
  }

  const why: string[] = [];
  let score = 50;
  why.push("基础（50）");

  // 背离强度 20
  let divScore = 10;
  if ((div.details.rsi_up1 ?? 0) > 5 && (div.details.rsi_up2 ?? 0) > 5) divScore = 20;
  else if ((div.details.rsi_up1 ?? 0) > 3 && (div.details.rsi_up2 ?? 0) > 3) divScore = 15;
  score += divScore;
  why.push(`背离强度（${divScore}/20）`);

  // RSI 区间 15
  let rsiZone = 5;
  if (rsiCurr >= 30 && rsiCurr <= 55) rsiZone = 15;
  else if ((rsiCurr >= 25 && rsiCurr < 30) || (rsiCurr > 55 && rsiCurr <= 60)) rsiZone = 10;
  score += rsiZone;
  why.push(`RSI区间（${rsiZone}/15）`);

  // 趋势与均线 10
  const ma60Now = ma60[i];
  const ma20Now = ma20[i];
  let trend = 2;
  if (ma60Now && curr.close > ma60Now) trend = 10;
  else if (ma20Now && curr.close > ma20Now) trend = 6;
  score += trend;
  why.push(`均线（${trend}/10）`);

  // 量能 5
  const v5 = volMa5[i] ?? 0;
  let volScore = 0;
  if (v5 > 0) {
    const r = curr.vol / v5;
    if (r >= 0.8 && r <= 1.5) volScore = 5;
    else if ((r >= 0.5 && r < 0.8) || (r > 1.5 && r <= 2.0)) volScore = 3;
  }
  score += volScore;
  why.push(`量能（${volScore}/5）`);

  // 第三点后反弹 5
  let bounce = 0;
  if (c.length >= 8) {
    let low8 = Infinity;
    for (let k = c.length - 8; k < c.length; k++) low8 = Math.min(low8, c[k].low);
    let rsiMin5: number | null = null;
    for (let k = c.length - 5; k < c.length; k++) {
      const v = rsiArr[k];
      if (v != null) rsiMin5 = rsiMin5 == null ? v : Math.min(rsiMin5, v);
    }
    if (curr.close > low8 * 1.01 && (rsiMin5 == null || rsiCurr > rsiMin5)) {
      bounce = 5;
    }
  }
  score += bounce;
  why.push(`反弹（${bounce}/5）`);

  const finalScore = Math.min(100, score);
  return {
    strategy: "超短反转",
    status: statusFromScore100(finalScore),
    why: why.slice(0, 6),
    score: round2(finalScore),
  };
}

/** ---------- 主入口 ---------- */
export function computeSignals(input: { candlesAsc: Candle[] }): SignalsResult {
  const c = input.candlesAsc;
  if (c.length < 30) {
    return {
      signals: [
        { strategy: "左侧埋伏", status: "miss", why: ["样本不足（至少需要约30根K线）"], score: 0 },
        { strategy: "右侧确认", status: "miss", why: ["样本不足（至少需要约30根K线）"], score: 0 },
        { strategy: "超短反转", status: "miss", why: ["样本不足（至少需要约30根K线）"], score: 0 },
      ],
      reasons_json: { note: "not_enough_candles", n: c.length, tags: [] },
    };
  }

  const closes = c.map((x) => x.close);
  const vols = c.map((x) => x.vol);
  const ma5 = sma(closes, 5);
  const ma10 = sma(closes, 10);
  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const volMa5 = sma(vols, 5);
  const volMa20 = sma(vols, 20);
  const kdjOut = kdj(c.map((x) => ({ high: x.high, low: x.low, close: x.close })));
  const macdOut = macd(closes);
  // 与大富翁一致：RSI 周期 6（B3 双底背离）
  const rsi6 = rsi(closes, 6);

  const sigB1 = evalB1(c, ma5, ma10, ma20, ma60, volMa5, volMa20, kdjOut.j, macdOut.dif);
  const sigB2 = evalB2(c, ma20, ma60, volMa5, kdjOut.j);
  const sigB3 = evalB3(c, ma20, ma60, volMa5, rsi6);

  const i = c.length - 1;
  const last = c[i];
  const prev = c[i - 1];
  const pct1d = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;
  const ma5Now = ma5[i];
  const ma10Now = ma10[i];
  const ma20Now = ma20[i];
  const ma60Now = ma60[i];
  const v5Now = volMa5[i];
  const v20Now = volMa20[i];
  const difNow = macdOut.dif[i];
  const deaNow = macdOut.dea[i];
  const histNow = macdOut.hist[i];
  const rsiNow = rsi6[i];

  const tags = collectTechnicalSignalTags({
    i,
    dif: macdOut.dif,
    dea: macdOut.dea,
    k: kdjOut.k,
    d: kdjOut.d,
    ma5,
    ma20,
    rsi: rsi6,
  });

  const reasons_json = {
    asof: last.t,
    tags,
    features: {
      close: last.close,
      pct1d: round2(pct1d),
      ma5: ma5Now == null ? null : round2(ma5Now),
      ma10: ma10Now == null ? null : round2(ma10Now),
      ma20: ma20Now == null ? null : round2(ma20Now),
      ma60: ma60Now == null ? null : round2(ma60Now),
      vol: last.vol,
      vol_ma5: v5Now == null ? null : round2(v5Now),
      vol_ma20: v20Now == null ? null : round2(v20Now),
      j: round2(kdjOut.j[i]),
      k: round2(kdjOut.k[i]),
      d: round2(kdjOut.d[i]),
      macd_dif: difNow == null ? null : round2(difNow),
      macd_dea: deaNow == null ? null : round2(deaNow),
      macd_hist: histNow == null ? null : round2(histNow),
      rsi6: rsiNow == null ? null : round2(rsiNow),
      high: last.high,
      low: last.low,
      prev_close: prev.close,
    },
    scores: {
      "左侧埋伏": sigB1.score ?? 0,
      "右侧确认": sigB2.score ?? 0,
      "超短反转": sigB3.score ?? 0,
    },
    b1: {
      category: sigB1.b1_category ?? 0,
      label: sigB1.b1_category_label ?? B1_CATEGORY_LABELS[0],
    },
    notes: {
      disclaimer:
        "策略规则参考大富翁 B1/B2/B3：B1 回调埋伏 / B2 启动确认 / B3 RSI两次底背离。0-100 分制，仅供研判，不构成投资建议。",
    },
  };

  return { signals: [sigB1, sigB2, sigB3], reasons_json };
}
