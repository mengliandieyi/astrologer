export type Factor = {
  factor_code: string;
  factor_name: string;
  weight: number;
  direction: "support" | "neutral" | "conflict";
  reason: string;
};

export type EvidenceItem = {
  insight_id: string;
  claim: string;
  plain_explanation: string;
  factors: Factor[];
  risk_note: string;
  confidence: number;
};

type ChartInput = {
  ten_god_officer_strong?: boolean;
  wealth_weak?: boolean;
  day_master?: "strong" | "weak" | "balanced";
};

/**
 * Build structured evidence chain from rule output.
 * Keep this deterministic so reports are explainable.
 */
export function buildEvidence(input: ChartInput): EvidenceItem[] {
  const factors: Factor[] = [];
  if (input.ten_god_officer_strong) {
    factors.push({
      factor_code: "TEN_GOD_OFFICER_STRONG",
      factor_name: "官星偏强",
      weight: 0.36,
      direction: "support",
      reason: "责任感与规则意识较强，倾向稳态发展。",
    });
  }
  if (input.wealth_weak) {
    factors.push({
      factor_code: "WEALTH_WEAK",
      factor_name: "财星偏弱",
      weight: 0.22,
      direction: "support",
      reason: "短线波动承受力较低，宜先积累能力再扩大投入。",
    });
  }
  if (input.day_master === "weak") {
    factors.push({
      factor_code: "DAY_MASTER_WEAK",
      factor_name: "日主偏弱",
      weight: 0.18,
      direction: "neutral",
      reason: "需要借助环境与团队资源提升稳定输出。",
    });
  }

  const normalized = normalizeWeights(factors.slice(0, 5));
  const confidence = scoreConfidence(normalized);

  return [
    {
      insight_id: "ins_001",
      claim: "职业选择更适合先稳后进。",
      plain_explanation: "你做决定会优先长期确定性，不适合频繁高风险切换。",
      factors: normalized.length >= 2 ? normalized : fallbackFactors(),
      risk_note: "仅作趋势参考，不构成投资或医疗建议。",
      confidence,
    },
  ];
}

function fallbackFactors(): Factor[] {
  return [
    {
      factor_code: "DEFAULT_STABILITY",
      factor_name: "稳态偏好",
      weight: 0.5,
      direction: "neutral",
      reason: "当前样本不足，采用通用稳态建议。",
    },
    {
      factor_code: "DEFAULT_PROGRESS",
      factor_name: "渐进成长",
      weight: 0.5,
      direction: "neutral",
      reason: "建议通过阶段目标逐步验证路径。",
    },
  ];
}

function normalizeWeights(factors: Factor[]): Factor[] {
  const total = factors.reduce((sum, f) => sum + f.weight, 0);
  if (!total) return factors;
  return factors.map((f) => ({ ...f, weight: Number((f.weight / total).toFixed(4)) }));
}

function scoreConfidence(factors: Factor[]): number {
  const base = 60;
  const quality = Math.min(30, factors.length * 8);
  const supportBonus = factors.filter((f) => f.direction === "support").length * 2;
  return Math.min(90, base + quality + supportBonus);
}
