export type StockAiSummary = {
  effective_asof: string;
  symbol: string;
  freq: "1d" | "1w" | "1m";
  overall_view: "bullish" | "neutral" | "bearish";
  /** 0-100，分值越高风险越高 */
  risk_score: number;
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
  freq: "1d" | "1w" | "1m";
  text: string;
  bullets: string[];
  evidence: Array<{ source: string; fields: string[] }>;
};

type KeyLevel = { kind: "support" | "resistance" | "stop_loss"; price: number | null; note: string };
type Signal = { strategy: "左侧埋伏" | "右侧确认" | "超短反转"; status: "hit" | "near" | "miss"; why: string[] };

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function toNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function computeRiskScore(args: {
  signals: Signal[];
  snapshot: any;
  reasons: any;
  key_levels: KeyLevel[];
}): number {
  const { signals, snapshot, reasons, key_levels } = args;
  const feat = (reasons?.features || {}) as any;

  const right = signals.find((s) => s.strategy === "右侧确认")?.status ?? "miss";
  const left = signals.find((s) => s.strategy === "左侧埋伏")?.status ?? "miss";
  const rev = signals.find((s) => s.strategy === "超短反转")?.status ?? "miss";

  // Baseline: 50. Add negatives / subtract positives, clamp to [0,100].
  let score = 50;

  // 1) Strategy confirmation (weight high)
  if (right === "hit") score -= 18;
  else if (right === "near") score -= 6;
  else score += 10;
  if (right === "miss" && (left === "hit" || rev === "hit")) score += 10; // left/reversal without confirmation
  if (left === "hit") score += 2;
  if (rev === "hit") score += 3;

  // 2) Trend / momentum (MA + MACD + down3)
  const close = toNum(feat?.close);
  const ma5 = toNum(feat?.ma5);
  const ma10 = toNum(feat?.ma10);
  const ma20 = toNum(feat?.ma20);
  const dif = toNum(feat?.macd_dif);
  const down3 = feat?.down3 === true;

  if (ma5 != null && ma10 != null && ma20 != null) {
    if (ma5 > ma10 && ma10 > ma20) score -= 6;
    else if (ma5 < ma10 && ma10 < ma20) score += 8;
    else score += 2;
  }
  if (close != null && ma20 != null) {
    if (close >= ma20) score -= 2;
    else score += 4;
  }
  if (dif != null) score += dif >= 0 ? -2 : 4;
  if (down3) score += 4;

  // 3) Volatility (abs pct1d or snapshot pct_chg_1d)
  const pct1d = toNum(feat?.pct1d) ?? toNum(snapshot?.pct_chg_1d);
  if (pct1d != null) {
    const a = Math.abs(pct1d);
    if (a >= 8) score += 10;
    else if (a >= 5) score += 6;
    else if (a >= 3) score += 3;
    else score += 0;
  }

  // 4) Liquidity (amount, unit: thousand RMB in tushare; frontend uses /1e4 => 亿)
  const amount = toNum(snapshot?.amount);
  if (amount != null) {
    const yi = amount / 1e4;
    if (yi < 2) score += 8;
    else if (yi < 5) score += 5;
    else if (yi < 10) score += 2;
    else score -= 1;
  }

  // 5) Valuation (PE(TTM) extremes increase risk)
  const pe = toNum(snapshot?.pe_ttm);
  if (pe != null) {
    if (pe <= 0) score += 6;
    else if (pe >= 80) score += 10;
    else if (pe >= 50) score += 6;
    else if (pe >= 35) score += 3;
    else if (pe <= 10) score += 1; // value can be trap; keep mild
  }

  // 6) Distance to stop-loss (if close near/below stop loss -> higher risk)
  const sl = key_levels.find((k) => k.kind === "stop_loss")?.price;
  if (close != null && typeof sl === "number" && Number.isFinite(sl) && sl > 0) {
    const d = (close - sl) / sl;
    if (d < 0) score += 12;
    else if (d < 0.03) score += 6;
    else if (d < 0.06) score += 3;
    else score += 0;
  }

  return clamp(Math.round(score), 0, 100);
}

export function buildStockAiSummary(input: {
  symbol: string;
  freq: "1d" | "1w" | "1m";
  effective_asof: string;
  evidence: {
    note?: string;
    snapshot_json?: Record<string, unknown>;
    signals?: Array<{ strategy: "左侧埋伏" | "右侧确认" | "超短反转"; status: "hit" | "near" | "miss"; why: string[] }>;
    reasons_json?: Record<string, unknown>;
    key_levels?: Array<{ kind: "support" | "resistance" | "stop_loss"; price: number | null; note: string }>;
  };
}): StockAiSummary {
  const signals: Signal[] =
    input.evidence.signals && input.evidence.signals.length
      ? input.evidence.signals
      : [
          { strategy: "左侧埋伏", status: "miss", why: ["暂无策略信号"] } as const,
          { strategy: "右侧确认", status: "miss", why: ["暂无策略信号"] } as const,
          { strategy: "超短反转", status: "miss", why: ["暂无策略信号"] } as const,
        ];

  const right = signals.find((s) => s.strategy === "右侧确认")?.status ?? "miss";
  const left = signals.find((s) => s.strategy === "左侧埋伏")?.status ?? "miss";
  const rev = signals.find((s) => s.strategy === "超短反转")?.status ?? "miss";

  const overall_view =
    right === "hit" ? "bullish" : left === "hit" || rev === "hit" ? "neutral" : right === "near" ? "neutral" : "bearish";

  const key_levels: KeyLevel[] =
    input.evidence.key_levels && input.evidence.key_levels.length
      ? input.evidence.key_levels
      : [
          { kind: "support", price: null, note: "待计算" } as const,
          { kind: "resistance", price: null, note: "待计算" } as const,
          { kind: "stop_loss", price: null, note: "待计算" } as const,
        ];

  const risk_points: string[] = [];
  if (right === "miss" && (left === "hit" || rev === "hit")) risk_points.push("当前更偏左侧/反转信号，需严格控制仓位与止损。");
  if (right === "miss") risk_points.push("右侧确认未完成，追高风险更大，优先等待结构确认。");
  if (!risk_points.length) risk_points.push("注意：指标信号需要结合趋势位置与量能验证。");

  const action_rules: string[] = [];
  const sl = key_levels.find((k) => k.kind === "stop_loss")?.price;
  if (typeof sl === "number" && Number.isFinite(sl)) action_rules.push(`参考止损：跌破 ${sl} 附近（以收盘为准）优先减仓/退出。`);
  action_rules.push("分型与量能优先：放量突破更可信，缩量反弹需谨慎。");
  action_rules.push("策略信号用于筛选与解释，不等于交易指令。");

  const snapshot = (input.evidence.snapshot_json || {}) as any;
  const reasons = (input.evidence.reasons_json || {}) as any;
  const risk_score = computeRiskScore({ signals, snapshot, reasons, key_levels });

  return {
    effective_asof: input.effective_asof,
    symbol: input.symbol,
    freq: input.freq,
    overall_view,
    risk_score,
    key_levels,
    signals,
    risk_points,
    action_rules,
    evidence_note: input.evidence.note || undefined,
    snapshot_json: input.evidence.snapshot_json,
    reasons_json: input.evidence.reasons_json,
  };
}

export function buildStockAiReply(input: {
  request_id: string;
  symbol: string;
  effective_asof: string;
  freq: "1d" | "1w" | "1m";
  summary: unknown;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  question: string;
}): StockAiAnswer {
  const q = input.question.trim();
  const q0 = q.toLowerCase();
  const s = (input.summary || {}) as any;
  const signals: Array<any> = Array.isArray(s.signals) ? s.signals : [];
  const keyLevels: Array<any> = Array.isArray(s.key_levels) ? s.key_levels : [];
  const support = keyLevels.find((k) => k.kind === "support")?.price ?? null;
  const resistance = keyLevels.find((k) => k.kind === "resistance")?.price ?? null;
  const stopLoss = keyLevels.find((k) => k.kind === "stop_loss")?.price ?? null;
  const snap = (s.snapshot_json || {}) as any;
  const reasons = (s.reasons_json || {}) as any;
  const feat = (reasons.features || {}) as any;

  const sigText = signals
    .map((x) => `${x.strategy}:${x.status === "hit" ? "命中" : x.status === "near" ? "接近" : "未命中"}`)
    .join("；");

  const asof = /^\d{4}-\d{2}-\d{2}$/.test(String(input.effective_asof || "")) ? String(input.effective_asof) : String(input.effective_asof || "").slice(0, 10);
  const header = `周期：${input.freq}；分析日：${asof || input.effective_asof}；标的：${input.symbol}${snap?.name ? `（${snap.name}）` : ""}`;
  const baseContext = [
    header,
    `快照：1D ${snap?.pct_chg_1d == null ? "—" : `${Number(snap.pct_chg_1d).toFixed(2)}%`} · 5D ${
      snap?.pct_chg_5d == null ? "—" : `${Number(snap.pct_chg_5d).toFixed(2)}%`
    } · 20D ${snap?.pct_chg_20d == null ? "—" : `${Number(snap.pct_chg_20d).toFixed(2)}%`} · PE(TTM) ${
      snap?.pe_ttm == null ? "—" : Number(snap.pe_ttm).toFixed(2)
    }`,
    `策略：${sigText || "暂无"}`,
    `关键位：支撑${support ?? "—"} / 压力${resistance ?? "—"} / 止损${stopLoss ?? "—"}`,
  ];

  const statusRank = (st: string) => (st === "hit" ? 2 : st === "near" ? 1 : 0);
  const byStrategy = (name: string) => signals.find((x) => x.strategy === name) || null;
  const left = byStrategy("左侧埋伏");
  const right = byStrategy("右侧确认");
  const rev = byStrategy("超短反转");

  const answerLines: string[] = [];
  const bullets: string[] = [];

  const askPriority =
    ((/哪个|优先|策略|左侧|右侧|反转/.test(q) && /策略|优先|哪个|更/.test(q)) || /which|priority|strategy/.test(q0));
  const askLevels = /关键|支撑|压力|止损|止盈|位|价/.test(q) || /support|resistance|stop/.test(q0);
  const askWhy = /为什么|原因|依据|证据|命中|接近|没命中/.test(q) || /why|reason|evidence/.test(q0);
  const askTrend = /趋势|强弱|多空|走势|结构/.test(q) || /trend/.test(q0);

  if (askTrend) {
    answerLines.push("## 趋势判断");
    const rs = s?.risk_score ?? (s?.risk_level != null ? Number(s.risk_level) * 20 : null);
    answerLines.push(`- 总体：${String(s?.overall_view || "neutral")}（风险分 ${rs == null || Number.isNaN(Number(rs)) ? "—" : String(Math.round(Number(rs)))}）`);
    if (feat?.ma5 != null && feat?.ma10 != null && feat?.ma20 != null) {
      const stack =
        feat.ma5 > feat.ma10 && feat.ma10 > feat.ma20
          ? "多头排列"
          : feat.ma5 < feat.ma10 && feat.ma10 < feat.ma20
            ? "空头排列"
            : "纠结/震荡";
      answerLines.push(`- 均线结构：${stack}（MA5=${feat.ma5} / MA10=${feat.ma10} / MA20=${feat.ma20}）`);
    }
    if (feat?.macd_dif != null && feat?.macd_dea != null) {
      answerLines.push(`- MACD：DIF=${feat.macd_dif}，DEA=${feat.macd_dea}，柱=${feat.macd_hist ?? "—"}`);
    }
  }

  if (askPriority) {
    answerLines.push("## 策略优先级（可执行）");
    const candidates = [
      { name: "右侧确认", s: right },
      { name: "左侧埋伏", s: left },
      { name: "超短反转", s: rev },
    ].filter((x) => x.s);
    candidates.sort((a, b) => statusRank(b.s.status) - statusRank(a.s.status));
    const top = candidates[0];
    if (top?.s) {
      answerLines.push(`- 当前更优先：**${top.name}**（${top.s.status === "hit" ? "命中" : top.s.status === "near" ? "接近" : "未命中"}）`);
      if (top.s.why?.length) answerLines.push(`- 依据：${top.s.why.slice(0, 5).join("；")}`);
    } else {
      answerLines.push("- 当前无明确优先策略（信号不足或样本不足）。");
    }
    if ((right?.status || "miss") === "miss" && (left?.status === "hit" || rev?.status === "hit")) {
      answerLines.push("- 纪律：右侧确认未完成，若参与偏左侧/反转，**只能小仓位 + 严格止损**。");
    }
  }

  if (askLevels) {
    answerLines.push("## 关键价位与纪律");
    answerLines.push(`- 支撑：${support ?? "—"}（跌破后多看少动）`);
    answerLines.push(`- 压力：${resistance ?? "—"}（放量突破更有效）`);
    answerLines.push(`- 止损：${stopLoss ?? "—"}（以收盘为准，先纪律后观点）`);
  }

  if (askWhy) {
    answerLines.push("## 证据（为什么）");
    const pack = (x: any) =>
      x?.why?.length ? x.why.slice(0, 6).map((w: string) => `- ${x.strategy}：${w}`).join("\n") : "";
    const whyText = [pack(left), pack(right), pack(rev)].filter(Boolean).join("\n");
    if (whyText) answerLines.push(whyText);
    else answerLines.push("- 暂无可用证据条目。");
  }

  if (!answerLines.length) {
    answerLines.push("## 回答（默认）");
    answerLines.push(`- 你问的是：${q}`);
    answerLines.push("- 我可以从三块给出结论：趋势（MA/BBI/MACD/KDJ）→ 策略（命中/接近/未命中）→ 关键位（支撑/压力/止损）。");
    answerLines.push("- 你可以继续问：`哪个策略更优先？` / `止损怎么定？` / `为什么命中/接近？` / `压力位在哪里？`");
  }

  const rs2 = s?.risk_score ?? (s?.risk_level != null ? Number(s.risk_level) * 20 : null);
  bullets.push(`总体：${String(s?.overall_view || "neutral")}；风险分：${rs2 == null || Number.isNaN(Number(rs2)) ? "—" : String(Math.round(Number(rs2)))}`);
  if (stopLoss != null) bullets.push(`纪律：参考止损 ${stopLoss}（收盘破位优先减仓/退出）`);
  if (Array.isArray(s?.risk_points) && s.risk_points.length) bullets.push(`风险点：${String(s.risk_points[0])}`);

  const text = [...baseContext, "", `你问的是：${q}`, "", ...answerLines, "", "（规则输出，不构成投资建议）"].join("\n");
  return {
    request_id: input.request_id,
    effective_asof: input.effective_asof,
    symbol: input.symbol,
    freq: input.freq,
    text,
    bullets,
    evidence: [{ source: "analysis", fields: ["snapshot_json", "signals", "reasons_json", "key_levels"] }],
  };
}

