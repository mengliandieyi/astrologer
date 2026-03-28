/**
 * 扩展命盘：实岁、纳音、胎元/命宫/身宫、十二长生（星运/自坐）、小运、干支刑冲合害。
 * 依赖 lunar-javascript 的 LunarUtil 与八字地势算法。
 */

import lunar from "lunar-javascript";
import {
  anHeLines,
  bodyStrengthLabel,
  cangGanLinesWithShishen,
  diZhiYuanJuSummary,
  formatMissingWuxing,
  formatPeakWuxingTied,
  fourPillarsCompactLine,
  fuYinCompactLine,
  fuYinLines,
  pillarTenGodShort,
  riZhiLine,
  tiaoHouGanList,
  wangXiangXiuQiuLine,
  yueLingLine,
  tianGanPairsSummary,
} from "./baziChartParams.js";

const LunarUtil = (lunar as { LunarUtil: { CHANG_SHENG_OFFSET: Record<string, number>; NAYIN: Record<string, string> } })
  .LunarUtil;

/** 与 lunar 库输出顺序一致（用于自坐/地势索引） */
const SHI_ER_ZHANG_SHENG = ["长生", "沐浴", "冠带", "临官", "帝旺", "衰", "病", "死", "墓", "绝", "胎", "养"];

const ZHI_STR = "子丑寅卯辰巳午未申酉戌亥";
const GAN_STR = "甲乙丙丁戊己庚辛壬癸";

export function stemBranchOf(pillar: string): { g: string; z: string } {
  return { g: pillar?.charAt(0) ?? "", z: pillar?.charAt(1) ?? "" };
}

/** 实岁：周岁，以 ref 日为界是否已过生日 */
export function computeAgeShisui(
  birthYear: number,
  birthMonth: number,
  birthDay: number,
  ref: Date = new Date()
): number {
  const y = ref.getFullYear();
  const m = ref.getMonth() + 1;
  const d = ref.getDate();
  let age = y - birthYear;
  if (m < birthMonth || (m === birthMonth && d < birthDay)) age--;
  return Math.max(0, age);
}

/** 某天干在某地支的十二长生（自坐），与 lunar EightChar._getDiShi 同算法 */
export function diShiForStem(stem: string, branch: string): string {
  const zi = ZHI_STR.indexOf(branch);
  if (zi < 0) return "—";
  const offset = LunarUtil.CHANG_SHENG_OFFSET[stem];
  if (offset === undefined) return "—";
  const gi = GAN_STR.indexOf(stem);
  let index = offset + (gi % 2 === 0 ? zi : -zi);
  while (index >= 12) index -= 12;
  while (index < 0) index += 12;
  return SHI_ER_ZHANG_SHENG[index] ?? "—";
}

/** 天干五合 */
const TIAN_GAN_HE: [string, string][] = [
  ["甲", "己"],
  ["乙", "庚"],
  ["丙", "辛"],
  ["丁", "壬"],
  ["戊", "癸"],
];

/** 天干相冲（常见四冲） */
const TIAN_GAN_CHONG: [string, string][] = [
  ["甲", "庚"],
  ["乙", "辛"],
  ["丙", "壬"],
  ["丁", "癸"],
];

const LIU_HE: [string, string][] = [
  ["子", "丑"],
  ["寅", "亥"],
  ["卯", "戌"],
  ["辰", "酉"],
  ["巳", "申"],
  ["午", "未"],
];

const LIU_CHONG: [string, string][] = [
  ["子", "午"],
  ["丑", "未"],
  ["寅", "申"],
  ["卯", "酉"],
  ["辰", "戌"],
  ["巳", "亥"],
];

const LIU_HAI: [string, string][] = [
  ["子", "未"],
  ["丑", "午"],
  ["寅", "巳"],
  ["卯", "辰"],
  ["申", "亥"],
  ["酉", "戌"],
];

const SAN_HE_GROUPS = [
  ["申", "子", "辰"],
  ["寅", "午", "戌"],
  ["亥", "卯", "未"],
  ["巳", "酉", "丑"],
];

function hasPair(a: string, b: string, pairs: [string, string][]): boolean {
  for (const [x, y] of pairs) {
    if ((a === x && b === y) || (a === y && b === x)) return true;
  }
  return false;
}

function sanHeTag(a: string, b: string): string | null {
  for (const g of SAN_HE_GROUPS) {
    if (g.includes(a) && g.includes(b) && a !== b) {
      return `半合（${g.join("")}局）`;
    }
  }
  return null;
}

/** 刑：常见支刑成对 */
function xingTag(a: string, b: string): string | null {
  const pairs: [string, string][] = [
    ["子", "卯"],
    ["丑", "戌"],
    ["丑", "未"],
    ["戌", "未"],
    ["寅", "巳"],
    ["巳", "申"],
  ];
  if (hasPair(a, b, pairs)) return "刑";
  if (a === b && ["辰", "午", "酉", "亥"].includes(a)) return "自刑";
  return null;
}

export type LabeledPillar = { label: string; pillar: string };

export type BirthMeta = {
  age_shisui: number;
  nayin: { year: string; month: string; day: string; hour: string };
  /** 日干在年/月/日/时支的十二长生（星运） */
  xing_yun: { year: string; month: string; day: string; hour: string }; // hour=时柱
  /** 各柱天干在本柱地支的十二长生（自坐） */
  zi_zuo: { year: string; month: string; day: string; hour: string };
  tai_yuan: string;
  tai_yuan_nayin: string;
  ming_gong: string;
  ming_gong_nayin: string;
  shen_gong: string;
  shen_gong_nayin: string;
  xiao_yun: Array<{ year: number; age: number; gan_zhi: string; ten_god_short?: string }>;
  ganzhi_relations: string[];
  /** 月令如「亥月」（旧库存可能无） */
  yue_ling?: string;
  /** 日支五行如「午火」 */
  ri_zhi_desc?: string;
  /** 月令旺相休囚死 */
  wang_xiang?: string;
  /** 调候用神（天干列表，简化表） */
  tiao_hou?: string;
  /** 身强 / 身弱 / 中和 */
  body_strength_label?: string;
  /** 最旺一行 + 十神分组，如「金3个（官杀）」 */
  wuxing_peak_label?: string;
  /** 缺失五行 + 十神意象 */
  wuxing_missing_label?: string;
  /** 四柱地支藏干（相对日干十神） */
  cang_gan?: { year: string; month: string; day: string; hour: string };
  /** 四柱天干合冲汇总（无则空数组） */
  tian_gan_summary?: string[];
  /** 暗合 */
  an_he?: string[];
  /** 伏吟 */
  fu_yin?: string[];
  /** 与示例一致的四柱一行：壬申年（枭杀）、… */
  four_pillars_compact?: string;
  /** 星运：年坐绝、月坐长生… */
  xing_yun_zuo?: string;
  /** 自坐：年坐长生、… */
  zi_zuo_zuo?: string;
  /** 壬申（枭杀）伏吟 */
  fu_yin_compact?: string;
  /** 原局地支：午亥（伤枭）暗合、申亥（杀枭）相害 */
  di_zhi_yuan_ju?: string;
};

/**
 * 四柱 + 胎元、命宫、身宫 等干支之间的刑冲合害（成对扫描，含半合提示）
 */
export function computeGanzhiRelations(pillars: LabeledPillar[]): string[] {
  const items = pillars
    .map((p) => ({ label: p.label, ...stemBranchOf(p.pillar) }))
    .filter((x) => x.g && x.z);
  const out: string[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const pairLabel = `${a.label}与${b.label}`;

      for (const [x, y] of TIAN_GAN_HE) {
        if ((a.g === x && b.g === y) || (a.g === y && b.g === x)) {
          out.push(`${pairLabel}：天干五合（${x}${y}）`);
        }
      }
      for (const [x, y] of TIAN_GAN_CHONG) {
        if ((a.g === x && b.g === y) || (a.g === y && b.g === x)) {
          out.push(`${pairLabel}：天干相冲（${x}${y}）`);
        }
      }
      if (hasPair(a.z, b.z, LIU_CHONG)) {
        out.push(`${pairLabel}：地支六冲（${a.z}冲${b.z}）`);
      }
      if (hasPair(a.z, b.z, LIU_HE)) {
        out.push(`${pairLabel}：地支六合`);
      }
      if (hasPair(a.z, b.z, LIU_HAI)) {
        out.push(`${pairLabel}：地支六害`);
      }
      const he = sanHeTag(a.z, b.z);
      if (he) out.push(`${pairLabel}：${he}`);
      const xing = xingTag(a.z, b.z);
      if (xing) out.push(`${pairLabel}：${xing}`);
    }
  }
  return dedupe(out);
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}

/** 从 lunar EightChar、Yun 与真太阳时日期组装扩展字段 */
export function buildBirthMeta(
  eight: {
    getYearDiShi: () => string;
    getMonthDiShi: () => string;
    getDayDiShi: () => string;
    getTimeDiShi: () => string;
    getYearNaYin: () => string;
    getMonthNaYin: () => string;
    getDayNaYin: () => string;
    getTimeNaYin: () => string;
    getTaiYuan: () => string;
    getTaiYuanNaYin: () => string;
    getMingGong: () => string;
    getMingGongNaYin: () => string;
    getShenGong: () => string;
    getShenGongNaYin: () => string;
  },
  yun: { getDaYun: (n: number) => unknown[] },
  bj: { y: number; m: number; d: number },
  pillars: { year: string; month: string; day: string; hour: string },
  opts: {
    five_elements: Record<"wood" | "fire" | "earth" | "metal" | "water", number>;
    strength_level: "weak" | "balanced" | "strong";
    month_main_god: string;
  }
): BirthMeta {
  const { g: yg, z: yz } = stemBranchOf(pillars.year);
  const { g: mg, z: mz } = stemBranchOf(pillars.month);
  const { g: dg, z: dz } = stemBranchOf(pillars.day);
  const { g: hg, z: hz } = stemBranchOf(pillars.hour);
  const dayGan = dg;

  const xiaoYun: BirthMeta["xiao_yun"] = [];
  try {
    const da0 = (yun.getDaYun(12) as { getXiaoYun?: (n: number) => unknown[] }[])[0] as {
      getXiaoYun: (n: number) => Array<{ getYear: () => number; getAge: () => number; getGanZhi: () => string }>;
    };
    if (da0?.getXiaoYun) {
      for (const row of da0.getXiaoYun(12)) {
        const gz = row.getGanZhi();
        xiaoYun.push({
          year: row.getYear(),
          age: row.getAge(),
          gan_zhi: gz,
          ten_god_short: pillarTenGodShort(dayGan, gz),
        });
      }
    }
  } catch {
    // ignore
  }

  const taiYuan = eight.getTaiYuan();
  const mingGong = eight.getMingGong();
  const shenGong = eight.getShenGong();

  const ganzhi_relations = computeGanzhiRelations([
    { label: "年柱", pillar: pillars.year },
    { label: "月柱", pillar: pillars.month },
    { label: "日柱", pillar: pillars.day },
    { label: "时柱", pillar: pillars.hour },
    { label: "胎元", pillar: taiYuan },
    { label: "命宫", pillar: mingGong },
    { label: "身宫", pillar: shenGong },
  ]);

  const monthZhi = mz;
  const tianGanSummary = tianGanPairsSummary(pillars);
  const anHe = anHeLines(pillars);
  const fuYin = fuYinLines(dayGan, pillars);
  const xingYunVals = {
    year: eight.getYearDiShi(),
    month: eight.getMonthDiShi(),
    day: eight.getDayDiShi(),
    hour: eight.getTimeDiShi(),
  };
  const ziZuoVals = {
    year: diShiForStem(yg, yz),
    month: diShiForStem(mg, mz),
    day: diShiForStem(dg, dz),
    hour: diShiForStem(hg, hz),
  };

  return {
    age_shisui: computeAgeShisui(bj.y, bj.m, bj.d),
    nayin: {
      year: eight.getYearNaYin(),
      month: eight.getMonthNaYin(),
      day: eight.getDayNaYin(),
      hour: eight.getTimeNaYin(),
    },
    xing_yun: xingYunVals,
    zi_zuo: ziZuoVals,
    xing_yun_zuo: `年坐${xingYunVals.year}、月坐${xingYunVals.month}、日坐${xingYunVals.day}、时坐${xingYunVals.hour}`,
    zi_zuo_zuo: `年坐${ziZuoVals.year}、月坐${ziZuoVals.month}、日坐${ziZuoVals.day}、时坐${ziZuoVals.hour}`,
    tai_yuan: taiYuan,
    tai_yuan_nayin: eight.getTaiYuanNaYin(),
    ming_gong: mingGong,
    ming_gong_nayin: eight.getMingGongNaYin(),
    shen_gong: shenGong,
    shen_gong_nayin: eight.getShenGongNaYin(),
    xiao_yun: xiaoYun,
    ganzhi_relations,
    yue_ling: yueLingLine(pillars.month),
    ri_zhi_desc: riZhiLine(pillars.day),
    wang_xiang: wangXiangXiuQiuLine(monthZhi),
    tiao_hou: tiaoHouGanList(monthZhi).join("、"),
    body_strength_label: bodyStrengthLabel(opts.strength_level),
    wuxing_peak_label: formatPeakWuxingTied(dayGan, opts.five_elements),
    wuxing_missing_label: formatMissingWuxing(dayGan, opts.five_elements),
    cang_gan: cangGanLinesWithShishen(dayGan, pillars),
    tian_gan_summary: tianGanSummary,
    an_he: anHe,
    fu_yin: fuYin,
    four_pillars_compact: fourPillarsCompactLine(dayGan, pillars),
    fu_yin_compact: fuYinCompactLine(dayGan, pillars) ?? undefined,
    di_zhi_yuan_ju: diZhiYuanJuSummary(dayGan, pillars),
  };
}
