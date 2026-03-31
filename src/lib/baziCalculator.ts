import lunar from "lunar-javascript";
import { branchLoveHint, daYunFortune, liuNianFortune, liuYueFortune } from "./baziFortuneNarrative.js";
import { buildBirthMeta, type BirthMeta } from "./baziExtendedMeta.js";
import { pillarTenGodShort, refineGeJuName } from "./baziChartParams.js";
import { computeBaziShenSha, computeFlowShenSha, type ShenShaByPillar, type ShenShaItem } from "./baziShenSha.js";
import {
  formatDateTimeInZone,
  standardMeridianEastDegrees,
  utcInstantToBeijingYmdHms,
  zonedWallTimeToUtc,
} from "./timeZoneWall.js";

const STEM_ELEMENT: Record<string, "wood" | "fire" | "earth" | "metal" | "water"> = {
  甲: "wood",
  乙: "wood",
  丙: "fire",
  丁: "fire",
  戊: "earth",
  己: "earth",
  庚: "metal",
  辛: "metal",
  壬: "water",
  癸: "water",
};

const BRANCH_ELEMENT: Record<string, "wood" | "fire" | "earth" | "metal" | "water"> = {
  子: "water",
  丑: "earth",
  寅: "wood",
  卯: "wood",
  辰: "earth",
  巳: "fire",
  午: "fire",
  未: "earth",
  申: "metal",
  酉: "metal",
  戌: "earth",
  亥: "water",
};

const CITY_LONGITUDE: Record<string, number> = {
  beijing: 116.4074,
  shanghai: 121.4737,
  guangzhou: 113.2644,
  shenzhen: 114.0579,
  hangzhou: 120.1551,
  chengdu: 104.0665,
  wuhan: 114.3054,
  chongqing: 106.5516,
  nanjing: 118.7969,
  xian: 108.9398,
  tianjin: 117.2000,
};

export type CalculatedChart = {
  pillars: {
    year: string;
    month: string;
    day: string;
    hour: string;
  };
  five_elements: Record<"wood" | "fire" | "earth" | "metal" | "water", number>;
  basic_summary: string;
  true_solar_time: string;
  jie_qi: string;
  ten_gods: {
    gan: { year: string; month: string; day: string; hour: string };
    zhi_main: { year: string; month: string; day: string; hour: string };
  };
  ge_ju: string;
  jie_qi_window: {
    current: string;
    prev: { name: string; time: string };
    next: { name: string; time: string };
  };
  day_master: {
    gan: string;
    element: "wood" | "fire" | "earth" | "metal" | "water";
    strength_score: number;
    strength_level: "weak" | "balanced" | "strong";
    useful_elements: string[];
    avoid_elements: string[];
  };
  calendar_meta: {
    input_calendar: "solar" | "lunar";
    solar_datetime: string;
    lunar_datetime: string;
  };
  fortune_cycles: {
    yun_start: string;
    da_yun: Array<{
      gan_zhi: string;
      start_year: number;
      end_year: number;
      start_age: number;
      ten_god_short: string;
      love: string;
      wealth: string;
      career: string;
      health: string;
      summary: string;
      shen_sha: ShenShaItem[];
    }>;
    liu_nian_preview: Array<{
      year: number;
      gan_zhi: string;
      ten_god_short: string;
      love: string;
      wealth: string;
      career: string;
      health: string;
      summary: string;
      shen_sha: ShenShaItem[];
    }>;
    /** 自当前月起未来若干公历月（排盘时刻快照） */
    liu_yue_preview: Array<{
      year: number;
      month: number;
      gan_zhi: string;
      ten_god_short: string;
      love: string;
      wealth: string;
      career: string;
      health: string;
      summary: string;
      shen_sha: ShenShaItem[];
    }>;
  };
  /** 四柱分桶；与 flat 二选一展示时优先 by_pillar */
  shen_sha_by_pillar: ShenShaByPillar;
  /** 全部神煞扁平列表（兼容旧逻辑、风险提示） */
  shen_sha: ShenShaItem[];
  user_readable: {
    one_line: string;
    actions: string[];
    cautions: string[];
    liu_nian_tips: Array<{ year: number; label: string; tip: string }>;
  };
  /** 纳音、胎命身宫、十二长生、小运、干支关系等 */
  birth_meta: BirthMeta;
};

export function calculateBaziFromSolar(
  birthDate: string,
  birthTime: string,
  location = "beijing",
  calendarType: "solar" | "lunar" = "solar",
  gender: 0 | 1 = 1,
  timeZone = "Asia/Shanghai",
  lunarLeapMonth = false
): CalculatedChart {
  const [yearStr, monthStr, dayStr] = birthDate.split("-");
  const [hourStr, minuteStr] = birthTime.split(":");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr ?? "0");

  if ([year, month, day, hour, minute].some((n) => Number.isNaN(n))) {
    throw new Error("invalid_datetime");
  }

  const Solar = (lunar as any).Solar;
  const Lunar = (lunar as any).Lunar;

  // Normalize: for lunar input, convert to solar first, then do timezone & true-solar-time correction.
  let baseY = year;
  let baseM = month;
  let baseD = day;
  let baseH = hour;
  let baseMi = minute;
  let inputLunarObj: any | null = null;
  let inputSolarObj: any | null = null;
  if (calendarType === "lunar") {
    try {
      inputLunarObj = Lunar.fromYmd(year, month, day, Boolean(lunarLeapMonth));
      inputSolarObj = inputLunarObj.getSolar();
      baseY = inputSolarObj.getYear();
      baseM = inputSolarObj.getMonth();
      baseD = inputSolarObj.getDay();
      baseH = hour;
      baseMi = minute;
    } catch {
      throw new Error("invalid_lunar_datetime");
    }
  } else {
    inputSolarObj = Solar.fromYmdHms(year, month, day, hour, minute, 0);
  }

  let utcMs0: number;
  try {
    utcMs0 = zonedWallTimeToUtc(baseY, baseM, baseD, baseH, baseMi, timeZone).getTime();
  } catch {
    throw new Error("invalid_datetime");
  }

  // 真太阳时：均时差 +（出生地经度 − 所选时区标准经度）×4 分钟/度
  const lon = resolveLongitude(location);
  const correctionMinutes = trueSolarCorrectionMinutes(baseY, baseM, baseD, lon, timeZone, utcMs0);
  const corrected = new Date(utcMs0 + correctionMinutes * 60 * 1000);

  const bj = utcInstantToBeijingYmdHms(corrected);

  // After correction, recompute chart by corrected solar datetime (Beijing snapshot).
  // For lunar input, keep calendar_meta.lunar_datetime from original lunar input.
  const solarObj = Solar.fromYmdHms(bj.y, bj.m, bj.d, bj.h, bj.mi, bj.s);
  const lunarObj = solarObj.getLunar();
  const eight = lunarObj.getEightChar();
  eight.setSect(2);

  const yearPillar = eight.getYear();
  const monthPillar = eight.getMonth();
  const dayPillar = eight.getDay();
  const hourPillar = eight.getTime();

  const counts = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
  [yearPillar, monthPillar, dayPillar, hourPillar].forEach((pillar) => {
    const stem = pillar.charAt(0);
    const branch = pillar.charAt(1);
    const stemEl = STEM_ELEMENT[stem];
    const branchEl = BRANCH_ELEMENT[branch];
    if (stemEl) counts[stemEl] += 1;
    if (branchEl) counts[branchEl] += 1;
  });

  const strongest = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const weakest = Object.entries(counts).sort((a, b) => a[1] - b[1])[0][0];
  const dayGan = eight.getDayGan();
  const monthMainGod = eight.getMonthShiShenZhi()?.[0] ?? "平";
  const monthZhi = monthPillar.charAt(1);
  const geJu = refineGeJuName(monthMainGod, dayGan, monthZhi);
  const prevJieQi = lunarObj.getPrevJieQi(true);
  const nextJieQi = lunarObj.getNextJieQi(true);
  const currentJieQi = lunarObj.getJieQi() || "非交节时段";
  const dayMasterElement = STEM_ELEMENT[dayGan] ?? "earth";
  const strength = calcDayMasterStrength(dayMasterElement, counts);
  const yun = eight.getYun(gender, 2);
  const pillarRecord = {
    year: yearPillar,
    month: monthPillar,
    day: dayPillar,
    hour: hourPillar,
  };
  const birth_meta = buildBirthMeta(eight, yun, { y: bj.y, m: bj.m, d: bj.d }, pillarRecord, {
    five_elements: counts,
    strength_level: strength.level,
    month_main_god: monthMainGod,
  });
  const daYunList = yun
    .getDaYun(14)
    .slice(1, 11)
    .map((d: any) => {
      const gz = d.getGanZhi();
      const f = daYunFortune(dayGan, gz);
      return {
        gan_zhi: gz,
        start_year: d.getStartYear(),
        end_year: d.getEndYear(),
        start_age: d.getStartAge(),
        ten_god_short: pillarTenGodShort(dayGan, gz),
        ...f,
        shen_sha: computeFlowShenSha(pillarRecord, gz, "大运"),
      };
    });
  const currentYear = new Date().getFullYear();
  const liuNianPreview = Array.from({ length: 11 }).map((_, i) => {
    const y = currentYear - 5 + i;
    const gz = getYearGanZhi(y);
    const f = liuNianFortune(dayGan, gz);
    return {
      year: y,
      gan_zhi: gz,
      ten_god_short: pillarTenGodShort(dayGan, gz),
      ...f,
      shen_sha: computeFlowShenSha(pillarRecord, gz, "流年"),
    };
  });
  const liuYuePreview = buildLiuYuePreview(6, dayGan).map((m) => ({
    ...m,
    ten_god_short: pillarTenGodShort(dayGan, m.gan_zhi),
    shen_sha: computeFlowShenSha(pillarRecord, m.gan_zhi, "流月"),
  }));
  const shenShaResult = computeBaziShenSha(pillarRecord, { gender });
  const userReadable = buildUserReadable({
    strongest: toCn(strongest),
    weakest: toCn(weakest),
    strengthLevel: strength.level,
    useful: strength.useful.map(toCn),
    avoid: strength.avoid.map(toCn),
    geJu,
    liuNianPreview,
    shenSha: shenShaResult.flat,
  });

  return {
    pillars: {
      year: yearPillar,
      month: monthPillar,
      day: dayPillar,
      hour: hourPillar,
    },
    five_elements: counts,
    basic_summary: `五行偏${toCn(strongest)}，${toCn(weakest)}相对偏弱，建议以稳健节奏推进长期规划。`,
    true_solar_time: formatDateTimeInZone(corrected, timeZone),
    jie_qi: lunarObj.getJieQi() || "无",
    ten_gods: {
      gan: {
        year: eight.getYearShiShenGan(),
        month: eight.getMonthShiShenGan(),
        day: "日主",
        hour: eight.getTimeShiShenGan(),
      },
      zhi_main: {
        year: eight.getYearShiShenZhi()?.[0] ?? "",
        month: eight.getMonthShiShenZhi()?.[0] ?? "",
        day: eight.getDayShiShenZhi()?.[0] ?? "",
        hour: eight.getTimeShiShenZhi()?.[0] ?? "",
      },
    },
    ge_ju: geJu,
    jie_qi_window: {
      current: currentJieQi,
      prev: {
        name: prevJieQi.getName(),
        time: prevJieQi.getSolar().toYmdHms(),
      },
      next: {
        name: nextJieQi.getName(),
        time: nextJieQi.getSolar().toYmdHms(),
      },
    },
    day_master: {
      gan: dayGan,
      element: dayMasterElement,
      strength_score: strength.score,
      strength_level: strength.level,
      useful_elements: strength.useful.map(toCn),
      avoid_elements: strength.avoid.map(toCn),
    },
    calendar_meta: {
      input_calendar: calendarType,
      solar_datetime: solarObj.toYmdHms(),
      lunar_datetime: inputLunarObj ? inputLunarObj.toString() : lunarObj.toString(),
    },
    fortune_cycles: {
      yun_start: yun.getStartSolar().toYmd(),
      da_yun: daYunList,
      liu_nian_preview: liuNianPreview,
      liu_yue_preview: liuYuePreview,
    },
    shen_sha_by_pillar: shenShaResult.by_pillar,
    shen_sha: shenShaResult.flat,
    user_readable: userReadable,
    birth_meta,
  };
}

function resolveLongitude(location: string): number {
  const normalized = location.trim().toLowerCase();
  const direct = Number(normalized);
  if (!Number.isNaN(direct) && direct >= -180 && direct <= 180) {
    return direct;
  }
  return CITY_LONGITUDE[normalized] ?? 120;
}

function trueSolarCorrectionMinutes(
  year: number,
  month: number,
  day: number,
  longitude: number,
  timeZone: string,
  utcMsBeforeCorrection: number
): number {
  const doy = dayOfYear(year, month, day);
  const b = ((360 / 365) * (doy - 81) * Math.PI) / 180;
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const stdMer = standardMeridianEastDegrees(timeZone, utcMsBeforeCorrection);
  const longitudeOffset = (longitude - stdMer) * 4;
  return Math.round(eot + longitudeOffset);
}

function dayOfYear(year: number, month: number, day: number): number {
  const d = new Date(Date.UTC(year, month - 1, day));
  const start = new Date(Date.UTC(year, 0, 1));
  return Math.floor((d.getTime() - start.getTime()) / 86400000) + 1;
}

function calcDayMasterStrength(
  dayMasterElement: "wood" | "fire" | "earth" | "metal" | "water",
  counts: Record<"wood" | "fire" | "earth" | "metal" | "water", number>
): {
  score: number;
  level: "weak" | "balanced" | "strong";
  useful: Array<"wood" | "fire" | "earth" | "metal" | "water">;
  avoid: Array<"wood" | "fire" | "earth" | "metal" | "water">;
} {
  const generatedBy: Record<string, "wood" | "fire" | "earth" | "metal" | "water"> = {
    wood: "water",
    fire: "wood",
    earth: "fire",
    metal: "earth",
    water: "metal",
  };
  const controls: Record<string, "wood" | "fire" | "earth" | "metal" | "water"> = {
    wood: "earth",
    fire: "metal",
    earth: "water",
    metal: "wood",
    water: "fire",
  };
  const self = counts[dayMasterElement];
  const resource = counts[generatedBy[dayMasterElement]];
  const controlledBy = Object.entries(controls).find(([, v]) => v === dayMasterElement)?.[0] as
    | "wood"
    | "fire"
    | "earth"
    | "metal"
    | "water";
  const pressure = counts[controlledBy];
  const score = Math.max(0, Math.min(100, 50 + (self + resource - pressure) * 12));
  const level = score < 45 ? "weak" : score > 65 ? "strong" : "balanced";

  /** 我生者（食伤），用于中和格同数时优先「泄秀」 */
  const outputEl: Record<typeof dayMasterElement, (typeof dayMasterElement) | undefined> = {
    wood: "fire",
    fire: "earth",
    earth: "metal",
    metal: "water",
    water: "wood",
  };

  const els = ["wood", "fire", "earth", "metal", "water"] as const;
  /** 局中个数由多到少（扶抑用）：各档喜忌都至少给出两个五行，避免忌神为空或只有一项 */
  const sortedDesc = [...els].sort((a, b) => {
    const d = counts[b] - counts[a];
    if (d !== 0) return d;
    return els.indexOf(a) - els.indexOf(b);
  });

  /** 官杀（克日主者），与 controlledBy 一致；若查找失败则用最旺一行作忌 */
  const killer = controlledBy ?? sortedDesc[0];

  function pickSecondAvoid(primary: typeof killer): typeof els[number] {
    const other = sortedDesc.find((e) => e !== primary);
    return other ?? sortedDesc[0];
  }

  if (level === "weak") {
    return {
      score,
      level,
      useful: [dayMasterElement, generatedBy[dayMasterElement]],
      avoid: [killer, pickSecondAvoid(killer)],
    };
  }
  if (level === "strong") {
    return {
      score,
      level,
      useful: [controls[dayMasterElement], generatedBy[controls[dayMasterElement]]],
      avoid: [dayMasterElement, generatedBy[dayMasterElement]],
    };
  }

  // 中和：按局中五行个数「扶弱抑旺」，避免固定成「印+财」导致印已过旺仍标为喜用、忌神为空
  const resourceEl = generatedBy[dayMasterElement];
  const wealthEl = controls[dayMasterElement];
  const shishang = outputEl[dayMasterElement];
  const inkStrong = counts[resourceEl] >= 3;

  const sortedAsc = [...els].sort((a, b) => {
    const d = counts[a] - counts[b];
    if (d !== 0) return d;
    if (!inkStrong) {
      return els.indexOf(a) - els.indexOf(b);
    }
    // 印偏旺：计数相同时优先「财星、食伤」，靠后的才是比劫与印
    const pri = (e: (typeof els)[number]) => {
      if (e === wealthEl) return 0;
      if (shishang && e === shishang) return 1;
      if (e === dayMasterElement) return 2;
      if (e === controlledBy) return 3;
      if (e === resourceEl) return 4;
      return 5;
    };
    return pri(a) - pri(b);
  });

  return {
    score,
    level,
    useful: [sortedAsc[0], sortedAsc[1]],
    avoid: [sortedDesc[0], sortedDesc[1]],
  };
}

function toCn(el: string): string {
  if (el === "wood") return "木";
  if (el === "fire") return "火";
  if (el === "earth") return "土";
  if (el === "metal") return "金";
  return "水";
}

function buildUserReadable(input: {
  strongest: string;
  weakest: string;
  strengthLevel: "weak" | "balanced" | "strong";
  useful: string[];
  avoid: string[];
  geJu: string;
  liuNianPreview: Array<{ year: number; gan_zhi: string; summary: string }>;
  shenSha: Array<{ name: string; type: "ji" | "xiong" | "neutral"; effect: string }>;
}) {
  const oneLine = `你整体属于“${input.geJu} + ${levelToCn(input.strengthLevel)}”的类型，做事更适合先稳住基本盘，再逐步放大。`;
  const actions = [
    `优先做长期可复利的事，近期重点放在“${input.strongest}”相关优势上。`,
    `每季度设一个明确目标，避免短期频繁换方向。`,
    `多用“${input.useful.join("、") || "平衡"}”对应的节奏：先准备、再放量。`,
  ];
  const cautions = [
    `${input.weakest}偏弱时，情绪和决策容易波动，重大决定建议隔天再确认。`,
    input.avoid.length ? `近期少走“${input.avoid.join("、")}”风格的冒进行为。` : "近期避免冲动型决策，先小试再扩大。",
    topRiskFromShenSha(input.shenSha),
  ];
  const liuNianTips = input.liuNianPreview.map((x) => {
    const branch = x.gan_zhi.charAt(1) || "";
    const extra = branchLoveHint(branch);
    return {
      year: x.year,
      label: extra ? "地支提示" : "年度提示",
      tip: extra || `流年柱「${x.gan_zhi}」：请对照上方总述与感情、财运、事业、健康各栏综合看。`,
    };
  });
  return { one_line: oneLine, actions, cautions, liu_nian_tips: liuNianTips };
}

function levelToCn(level: "weak" | "balanced" | "strong"): string {
  if (level === "weak") return "偏弱";
  if (level === "strong") return "偏强";
  return "中和";
}

function topRiskFromShenSha(shensha: Array<{ name: string; type: "ji" | "xiong" | "neutral"; effect: string }>): string {
  const risk = shensha.find((x) => x.type === "xiong");
  if (!risk) return "神煞层面无明显大凶信号，保持稳健即可。";
  return `神煞提示“${risk.name}”：${risk.effect}`;
}

function getYearGanZhi(year: number): string {
  const Solar = (lunar as any).Solar;
  const solar = Solar.fromYmd(year, 6, 15);
  const lunarObj = solar.getLunar();
  return lunarObj.getYearInGanZhiExact?.() ?? lunarObj.getYearInGanZhi?.() ?? String(year);
}

/** 自当前月起未来 count 个公历月的流月干支（以月中取样） */
function buildLiuYuePreview(
  count: number,
  dayGan: string
): Array<{
  year: number;
  month: number;
  gan_zhi: string;
  love: string;
  wealth: string;
  career: string;
  health: string;
  summary: string;
}> {
  const Solar = (lunar as any).Solar;
  const now = new Date();
  const out: Array<{
    year: number;
    month: number;
    gan_zhi: string;
    love: string;
    wealth: string;
    career: string;
    health: string;
    summary: string;
  }> = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 15);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const solar = Solar.fromYmd(y, m, 15);
    const lo = solar.getLunar();
    const gz = lo.getMonthInGanZhiExact?.() ?? lo.getMonthInGanZhi?.() ?? "";
    const f = liuYueFortune(dayGan, gz);
    out.push({ year: y, month: m, gan_zhi: gz, ...f });
  }
  return out;
}
