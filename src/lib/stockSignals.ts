export type StrategyName = "左侧埋伏" | "右侧确认" | "超短反转";
export type StrategyStatus = "hit" | "near" | "miss";

export type StrategySignal = {
  strategy: StrategyName;
  status: StrategyStatus;
  why: string[];
};

export type SignalsResult = {
  signals: StrategySignal[];
  reasons_json: Record<string, any>;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function sma(values: number[], period: number): Array<number | null> {
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

function ema(values: number[], period: number): Array<number | null> {
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

function macd(values: number[], fast = 12, slow = 26, signal = 9) {
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

function kdj(rows: Array<{ high: number; low: number; close: number }>, n = 9, kPeriod = 3, dPeriod = 3) {
  const rsv: Array<number | null> = new Array(rows.length).fill(null);
  for (let i = 0; i < rows.length; i++) {
    if (i < n - 1) continue;
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - (n - 1); j <= i; j++) {
      hh = Math.max(hh, rows[j].high);
      ll = Math.min(ll, rows[j].low);
    }
    const den = hh - ll;
    rsv[i] = den === 0 ? 50 : ((rows[i].close - ll) / den) * 100;
  }
  const kArr: Array<number | null> = new Array(rows.length).fill(null);
  const dArr: Array<number | null> = new Array(rows.length).fill(null);
  const jArr: Array<number | null> = new Array(rows.length).fill(null);
  let kPrev = 50;
  let dPrev = 50;
  for (let i = 0; i < rows.length; i++) {
    const v = rsv[i];
    if (v == null) continue;
    const kNow = (1 / kPeriod) * v + (1 - 1 / kPeriod) * kPrev;
    const dNow = (1 / dPeriod) * kNow + (1 - 1 / dPeriod) * dPrev;
    const jNow = 3 * kNow - 2 * dNow;
    kPrev = kNow;
    dPrev = dNow;
    kArr[i] = kNow;
    dArr[i] = dNow;
    jArr[i] = jNow;
  }
  return { k: kArr, d: dArr, j: jArr };
}

function statusFromScore(score: number): StrategyStatus {
  if (score >= 1) return "hit";
  if (score >= 0.5) return "near";
  return "miss";
}

export function computeSignals(input: {
  candlesAsc: Array<{ t: string; open: number; high: number; low: number; close: number; vol: number; amount: number }>;
}): SignalsResult {
  const c = input.candlesAsc;
  if (c.length < 30) {
    return {
      signals: [
        { strategy: "左侧埋伏", status: "miss", why: ["样本不足（至少需要约30根K线）"] },
        { strategy: "右侧确认", status: "miss", why: ["样本不足（至少需要约30根K线）"] },
        { strategy: "超短反转", status: "miss", why: ["样本不足（至少需要约30根K线）"] },
      ],
      reasons_json: { note: "not_enough_candles", n: c.length },
    };
  }

  const closes = c.map((x) => x.close);
  const highs = c.map((x) => x.high);
  const lows = c.map((x) => x.low);
  const vols = c.map((x) => x.vol);
  const lastIdx = c.length - 1;
  const prevIdx = c.length - 2;

  const ma5 = sma(closes, 5);
  const ma10 = sma(closes, 10);
  const ma20 = sma(closes, 20);
  const bbi = (() => {
    const ma3 = sma(closes, 3);
    const ma6 = sma(closes, 6);
    const ma12 = sma(closes, 12);
    const ma24 = sma(closes, 24);
    return closes.map((_, i) => {
      const a = ma3[i],
        b = ma6[i],
        c0 = ma12[i],
        d = ma24[i];
      if (a == null || b == null || c0 == null || d == null) return null;
      return (a + b + c0 + d) / 4;
    });
  })();
  const kdjOut = kdj(c.map((x) => ({ high: x.high, low: x.low, close: x.close })));
  const macdOut = macd(closes);

  const last = c[lastIdx];
  const prev = c[prevIdx];

  const kNow = kdjOut.k[lastIdx];
  const dNow = kdjOut.d[lastIdx];
  const kPrev = kdjOut.k[prevIdx];
  const dPrev = kdjOut.d[prevIdx];

  const difNow = macdOut.dif[lastIdx];
  const deaNow = macdOut.dea[lastIdx];
  const histNow = macdOut.hist[lastIdx];
  const histPrev = macdOut.hist[prevIdx];

  const ma5Now = ma5[lastIdx];
  const ma10Now = ma10[lastIdx];
  const ma20Now = ma20[lastIdx];
  const bbiNow = bbi[lastIdx];

  // volume average (5)
  const v5 = sma(vols, 5)[lastIdx];

  // Left-side ambush: oversold turning + weakening downside momentum + near BBI/MA20
  let leftScore = 0;
  const leftWhy: string[] = [];
  const kCrossUp = kPrev != null && dPrev != null && kNow != null && dNow != null && kPrev <= dPrev && kNow > dNow;
  if (kNow != null && kNow < 30) {
    leftScore += 0.5;
    leftWhy.push(`KDJ偏低（K=${round2(kNow)}）`);
  } else if (kNow != null && kNow < 40) {
    leftScore += 0.25;
    leftWhy.push(`KDJ偏低（K=${round2(kNow)}，接近超卖）`);
  }
  if (kCrossUp) {
    leftScore += 0.35;
    leftWhy.push("KDJ金叉向上");
  }
  if (histNow != null && histPrev != null && histNow > histPrev) {
    leftScore += 0.25;
    leftWhy.push("MACD柱体回升（下跌动能减弱）");
  }
  const nearMa20 = ma20Now != null ? Math.abs(last.close - ma20Now) / ma20Now : null;
  const nearBbi = bbiNow != null ? Math.abs(last.close - bbiNow) / bbiNow : null;
  if (nearMa20 != null && nearMa20 < 0.03) {
    leftScore += 0.2;
    leftWhy.push("价格靠近MA20");
  }
  if (nearBbi != null && nearBbi < 0.03) {
    leftScore += 0.2;
    leftWhy.push("价格靠近BBI");
  }
  if (last.close > prev.close) {
    leftScore += 0.1;
    leftWhy.push("当日收涨");
  }

  // Right-side confirmation: uptrend structure + MACD above signal + price above MA20/BBI
  let rightScore = 0;
  const rightWhy: string[] = [];
  if (ma5Now != null && ma10Now != null && ma20Now != null && ma5Now > ma10Now && ma10Now > ma20Now) {
    rightScore += 0.45;
    rightWhy.push("均线多头排列（MA5>MA10>MA20）");
  }
  if (ma20Now != null && last.close >= ma20Now) {
    rightScore += 0.25;
    rightWhy.push("收盘站上MA20");
  }
  if (bbiNow != null && last.close >= bbiNow) {
    rightScore += 0.15;
    rightWhy.push("收盘站上BBI");
  }
  if (difNow != null && deaNow != null && difNow > deaNow) {
    rightScore += 0.25;
    rightWhy.push("MACD DIF 上穿/高于 DEA");
  }
  if (difNow != null && difNow > 0) {
    rightScore += 0.1;
    rightWhy.push("MACD DIF 位于 0 轴上方");
  }
  if (kNow != null && kNow > 50) {
    rightScore += 0.1;
    rightWhy.push("KDJ 强势区（K>50）");
  }

  // Ultra-short reversal: 3-day pullback + strong up day + volume expansion + KDJ turn
  let revScore = 0;
  const revWhy: string[] = [];
  const down3 =
    c.length >= 4 && c[lastIdx - 1].close < c[lastIdx - 2].close && c[lastIdx - 2].close < c[lastIdx - 3].close;
  if (down3) {
    revScore += 0.35;
    revWhy.push("近3日回撤/连跌");
  }
  const pct1d = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;
  if (pct1d >= 2) {
    revScore += 0.35;
    revWhy.push(`当日反弹力度较强（${round2(pct1d)}%）`);
  } else if (pct1d > 0) {
    revScore += 0.2;
    revWhy.push(`当日收涨（${round2(pct1d)}%）`);
  }
  if (v5 != null && last.vol >= v5 * 1.3) {
    revScore += 0.25;
    revWhy.push("量能放大（>= 5日均量 1.3x）");
  }
  if (kCrossUp && kNow != null && kNow < 60) {
    revScore += 0.2;
    revWhy.push("KDJ 低位金叉/拐头");
  }

  const signals: StrategySignal[] = [
    { strategy: "左侧埋伏", status: statusFromScore(leftScore), why: leftWhy.slice(0, 5) },
    { strategy: "右侧确认", status: statusFromScore(rightScore), why: rightWhy.slice(0, 5) },
    { strategy: "超短反转", status: statusFromScore(revScore), why: revWhy.slice(0, 5) },
  ];

  const reasons_json = {
    asof: last.t,
    features: {
      close: last.close,
      pct1d: round2(pct1d),
      ma5: ma5Now == null ? null : round2(ma5Now),
      ma10: ma10Now == null ? null : round2(ma10Now),
      ma20: ma20Now == null ? null : round2(ma20Now),
      bbi: bbiNow == null ? null : round2(bbiNow),
      k: kNow == null ? null : round2(kNow),
      d: dNow == null ? null : round2(dNow),
      macd_dif: difNow == null ? null : round2(difNow),
      macd_dea: deaNow == null ? null : round2(deaNow),
      macd_hist: histNow == null ? null : round2(histNow),
      vol: last.vol,
      vol_ma5: v5 == null ? null : round2(v5),
      high: last.high,
      low: last.low,
      prev_close: prev.close,
      down3,
      kCrossUp,
      histUp: histNow != null && histPrev != null ? histNow > histPrev : null,
    },
    scores: { "左侧埋伏": round2(leftScore), "右侧确认": round2(rightScore), "超短反转": round2(revScore) },
    notes: {
      disclaimer:
        "策略信号为规则版本（阈值/规则可迭代），用于展示可解释 reasons_json，不构成投资建议。",
    },
  };

  return { signals, reasons_json };
}

