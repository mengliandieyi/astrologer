import { daYunFortune, liuNianFortune, liuYueFortune } from "./baziFortuneNarrative.js";
import type { StoredChart } from "./store.js";

type FlowFields = {
  love: string;
  wealth: string;
  career: string;
  health: string;
  summary: string;
};

function mergeFlow(
  stored: { love?: string; wealth?: string; career?: string; health?: string; summary?: string },
  computed: FlowFields
): FlowFields {
  return {
    love: stored.love || computed.love,
    wealth: stored.wealth || computed.wealth,
    career: stored.career || computed.career,
    health: stored.health || computed.health,
    summary: stored.summary || computed.summary,
  };
}

/** 旧库存盘缺少流运感情/财/事业/健康文案时，按日干与干支现场补全 */
export function enrichChartFortuneCycles(chart: StoredChart): StoredChart {
  const day = chart.pillars?.day;
  if (!day || day.length < 1) return chart;
  const dayStem = day.charAt(0);
  const fc = chart.fortune_cycles;
  if (!fc) return chart;

  const da_yun = (fc.da_yun ?? []).map((d) => {
    const f = daYunFortune(dayStem, d.gan_zhi);
    return { ...d, ...mergeFlow(d, f) };
  });

  const liu_nian_preview = (fc.liu_nian_preview ?? []).map((d) => {
    const f = liuNianFortune(dayStem, d.gan_zhi);
    return { ...d, ...mergeFlow(d, f) };
  });

  const liu_yue_preview = (fc.liu_yue_preview ?? []).map((d) => {
    const f = liuYueFortune(dayStem, d.gan_zhi);
    return { ...d, ...mergeFlow(d, f) };
  });

  return {
    ...chart,
    fortune_cycles: {
      ...fc,
      da_yun,
      liu_nian_preview,
      liu_yue_preview,
    },
  };
}
