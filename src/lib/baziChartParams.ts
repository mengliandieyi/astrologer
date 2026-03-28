/**
 * 命盘补全参数：月令/日支描述、旺相休囚死、调候用神、格局专名、五行最旺与缺失（十神意象）、
 * 天干关系汇总、暗合与伏吟、大运/小运十神简称（依赖 lunar LunarUtil）。
 */

import lunar from "lunar-javascript";

const LunarUtil = (lunar as { LunarUtil: Record<string, unknown> }).LunarUtil;
const SHI_SHEN = LunarUtil.SHI_SHEN as Record<string, string>;
const ZHI_HIDE_GAN = LunarUtil.ZHI_HIDE_GAN as Record<string, string[]>;

const ZHI_STR = "子丑寅卯辰巳午未申酉戌亥";

/** 日干临官（建禄） */
const LU_ZHI: Record<string, string> = {
  甲: "寅",
  乙: "卯",
  丙: "巳",
  丁: "午",
  戊: "巳",
  己: "午",
  庚: "申",
  辛: "酉",
  壬: "亥",
  癸: "子",
};

/** 日干帝旺（阳刃） */
const REN_ZHI: Record<string, string> = {
  甲: "卯",
  乙: "寅",
  丙: "午",
  丁: "巳",
  戊: "午",
  己: "巳",
  庚: "酉",
  辛: "申",
  壬: "子",
  癸: "亥",
};

/** 地支暗合（常见四组） */
const AN_HE: [string, string][] = [
  ["午", "亥"],
  ["子", "巳"],
  ["卯", "申"],
  ["寅", "丑"],
];

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

const EL_ORDER = ["wood", "fire", "earth", "metal", "water"] as const;
const EL_CN: Record<(typeof EL_ORDER)[number], string> = {
  wood: "木",
  fire: "火",
  earth: "土",
  metal: "金",
  water: "水",
};

/** 生我 */
function shengWo(el: (typeof EL_ORDER)[number]): (typeof EL_ORDER)[number] {
  const m: Record<string, (typeof EL_ORDER)[number]> = {
    wood: "water",
    fire: "wood",
    earth: "fire",
    metal: "earth",
    water: "metal",
  };
  return m[el]!;
}

/** 我生 */
function woSheng(el: (typeof EL_ORDER)[number]): (typeof EL_ORDER)[number] {
  const m: Record<string, (typeof EL_ORDER)[number]> = {
    wood: "fire",
    fire: "earth",
    earth: "metal",
    metal: "water",
    water: "wood",
  };
  return m[el]!;
}

/** 克我 */
function keWo(el: (typeof EL_ORDER)[number]): (typeof EL_ORDER)[number] {
  const m: Record<string, (typeof EL_ORDER)[number]> = {
    wood: "metal",
    fire: "water",
    earth: "wood",
    metal: "fire",
    water: "earth",
  };
  return m[el]!;
}

/** 我克 */
function woKe(el: (typeof EL_ORDER)[number]): (typeof EL_ORDER)[number] {
  const m: Record<string, (typeof EL_ORDER)[number]> = {
    wood: "earth",
    fire: "metal",
    earth: "water",
    metal: "wood",
    water: "fire",
  };
  return m[el]!;
}

/** 某五行相对「日干」的十神分组名（比劫/印枭/食伤/财才/官杀） */
export function wuxingShishenGroup(
  dayGan: string,
  el: (typeof EL_ORDER)[number]
): string {
  const dm = STEM_ELEMENT[dayGan];
  if (!dm) return "—";
  if (el === dm) return "比劫";
  if (el === shengWo(dm)) return "印枭";
  if (el === woSheng(dm)) return "食伤";
  if (el === woKe(dm)) return "财才";
  if (el === keWo(dm)) return "官杀";
  return "—";
}

/** 并列最旺：金3个（官杀）、水3个（印绶） */
export function formatPeakWuxingTied(
  dayGan: string,
  counts: Record<(typeof EL_ORDER)[number], number>
): string {
  let maxN = -1;
  for (const e of EL_ORDER) maxN = Math.max(maxN, counts[e]);
  if (maxN < 0) return "—";
  const tops = EL_ORDER.filter((e) => counts[e] === maxN);
  return tops.map((e) => `${EL_CN[e]}${maxN}个（${wuxingShishenGroup(dayGan, e)}）`).join("、");
}

/** @deprecated 保留单峰场景；一般请用 formatPeakWuxingTied */
export function formatPeakWuxing(
  dayGan: string,
  counts: Record<(typeof EL_ORDER)[number], number>
): string {
  return formatPeakWuxingTied(dayGan, counts);
}

export function formatMissingWuxing(
  dayGan: string,
  counts: Record<(typeof EL_ORDER)[number], number>
): string {
  const miss = EL_ORDER.filter((e) => counts[e] === 0);
  if (!miss.length) return "无全缺五行（本计数法）";
  return miss
    .map((e) => `${EL_CN[e]}0个（${wuxingShishenGroup(dayGan, e)}）`)
    .join("；");
}

/** 月令：亥月 */
export function yueLingLine(monthPillar: string): string {
  const z = monthPillar?.charAt(1) ?? "";
  return z ? `${z}月` : "—";
}

/** 日支：午火 */
export function riZhiLine(dayPillar: string): string {
  const z = dayPillar?.charAt(1) ?? "";
  if (!z) return "—";
  const el = BRANCH_ELEMENT[z];
  return el ? `${z}${EL_CN[el]}` : z;
}

/** 旺相休囚死（以月支季节论五行） */
export function wangXiangXiuQiuLine(monthBranch: string): string {
  const zi = ZHI_STR.indexOf(monthBranch);
  if (zi < 0) return "—";
  // 亥子水月
  if (zi === 0 || zi === 11) return "水旺，木相，金休，土囚，火死";
  // 寅卯木月
  if (zi === 2 || zi === 3) return "木旺，火相，水休，金囚，土死";
  // 巳午火月
  if (zi === 5 || zi === 6) return "火旺，土相，木休，水囚，金死";
  // 申酉金月
  if (zi === 8 || zi === 9) return "金旺，水相，火休，木囚，土死";
  // 辰戌丑未土月
  return "土旺，金相，火休，木囚，水死";
}

/** 调候用神（天干，简化穷通宝鉴式，按月支） */
export function tiaoHouGanList(monthBranch: string): string[] {
  const map: Record<string, string[]> = {
    寅: ["丙", "癸"],
    卯: ["庚", "戊"],
    辰: ["壬", "甲"],
    巳: ["壬", "庚", "癸"],
    午: ["壬", "庚"],
    未: ["壬", "庚", "甲"],
    申: ["壬", "丁", "戊"],
    酉: ["壬", "丁"],
    戌: ["甲", "壬", "癸"],
    亥: ["甲", "庚", "戊"],
    子: ["丙", "壬"],
    丑: ["丙", "甲"],
  };
  return map[monthBranch] ?? ["—"];
}

/** 十神全称 → 单字简称（用于「杀才」） */
export function shishenAbbrev(full: string): string {
  const m: Record<string, string> = {
    比肩: "比",
    劫财: "劫",
    食神: "食",
    伤官: "伤",
    偏财: "才",
    正财: "财",
    七杀: "杀",
    正官: "官",
    偏印: "枭",
    正印: "印",
    日主: "主",
  };
  return m[full] ?? full.slice(-1);
}

/** 地支本气十神（相对日干）单字简称 */
export function zhiMainQiShishenAbbrev(dayGan: string, zhi: string): string {
  const hides = ZHI_HIDE_GAN[zhi] ?? [];
  const h0 = hides[0];
  if (!h0) return "—";
  const full = SHI_SHEN[dayGan + h0] ?? "—";
  return shishenAbbrev(full);
}

/** 日柱专用：元 + 日支本气十神简称（示例：元伤） */
export function dayPillarYuanShangLabel(dayGan: string, dayPillar: string): string {
  const z = dayPillar.charAt(1);
  const hides = ZHI_HIDE_GAN[z] ?? [];
  const h0 = hides[0];
  if (!h0) return "元—";
  const full = SHI_SHEN[dayGan + h0] ?? "";
  return `元${shishenAbbrev(full)}`;
}

/** 年/月/时柱：干+支本气 两字简称；日柱请用 dayPillarYuanShangLabel */
export function pillarLabelShort(
  dayGan: string,
  pillar: string,
  role: "year" | "month" | "day" | "hour"
): string {
  if (role === "day") return dayPillarYuanShangLabel(dayGan, pillar);
  return pillarTenGodShort(dayGan, pillar);
}

/** 与示例一致：壬申年（枭杀）、辛亥月（官枭）、甲午日（元伤）、壬申时（枭杀） */
export function fourPillarsCompactLine(
  dayGan: string,
  pillars: { year: string; month: string; day: string; hour: string }
): string {
  const y = `${pillars.year}年（${pillarLabelShort(dayGan, pillars.year, "year")}）`;
  const m = `${pillars.month}月（${pillarLabelShort(dayGan, pillars.month, "month")}）`;
  const d = `${pillars.day}日（${pillarLabelShort(dayGan, pillars.day, "day")}）`;
  const h = `${pillars.hour}时（${pillarLabelShort(dayGan, pillars.hour, "hour")}）`;
  return `${y}、${m}、${d}、${h}`;
}

/** 干支相对日干：天干十神 + 地支本气十神 → 如 杀才 */
export function pillarTenGodShort(dayGan: string, ganZhi: string): string {
  if (ganZhi.length < 2) return "—";
  const g = ganZhi.charAt(0);
  const z = ganZhi.charAt(1);
  const sg = SHI_SHEN[dayGan + g] ?? "—";
  const hides = ZHI_HIDE_GAN[z] ?? [];
  const sz = hides[0] ? SHI_SHEN[dayGan + hides[0]] ?? "—" : "—";
  return `${shishenAbbrev(sg)}${shishenAbbrev(sz)}`;
}

/** 格局专名：建禄格 / 羊刃格 / 月支主气十神格 */
export function refineGeJuName(monthMainGod: string, dayGan: string, monthZhi: string): string {
  if (monthZhi && LU_ZHI[dayGan] === monthZhi) return "建禄格";
  if (monthZhi && REN_ZHI[dayGan] === monthZhi) return "羊刃格";
  return `${monthMainGod}格`;
}

/** 身强 / 身弱 / 中和 */
export function bodyStrengthLabel(level: "weak" | "balanced" | "strong"): string {
  if (level === "strong") return "身强";
  if (level === "weak") return "身弱";
  return "中和";
}

/** 仅四柱天干之间的合冲（用于单独汇总） */
export function tianGanPairsSummary(pillars: {
  year: string;
  month: string;
  day: string;
  hour: string;
}): string[] {
  const labels = ["年", "月", "日", "时"] as const;
  const gs = [pillars.year, pillars.month, pillars.day, pillars.hour].map((p) => p?.charAt(0) ?? "");
  const TIAN_GAN_HE: [string, string][] = [
    ["甲", "己"],
    ["乙", "庚"],
    ["丙", "辛"],
    ["丁", "壬"],
    ["戊", "癸"],
  ];
  const TIAN_GAN_CHONG: [string, string][] = [
    ["甲", "庚"],
    ["乙", "辛"],
    ["丙", "壬"],
    ["丁", "癸"],
  ];
  const out: string[] = [];
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const a = gs[i];
      const b = gs[j];
      if (!a || !b) continue;
      for (const [x, y] of TIAN_GAN_HE) {
        if ((a === x && b === y) || (a === y && b === x)) {
          out.push(`${labels[i]}干与${labels[j]}干：天干五合（${x}${y}）`);
        }
      }
      for (const [x, y] of TIAN_GAN_CHONG) {
        if ((a === x && b === y) || (a === y && b === x)) {
          out.push(`${labels[i]}干与${labels[j]}干：天干相冲（${x}${y}）`);
        }
      }
    }
  }
  return [...new Set(out)];
}

/** 伏吟：四柱中两柱干支完全相同（壬申（枭杀）伏吟） */
export function fuYinLines(
  dayGan: string,
  pillars: {
    year: string;
    month: string;
    day: string;
    hour: string;
  }
): string[] {
  const labels = ["年柱", "月柱", "日柱", "时柱"];
  const ps = [pillars.year, pillars.month, pillars.day, pillars.hour];
  const out: string[] = [];
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      if (ps[i] && ps[i] === ps[j]) {
        const gz = ps[i];
        const sh = pillarTenGodShort(dayGan, gz);
        out.push(`${labels[i]}与${labels[j]}：${gz}（${sh}）伏吟`);
      }
    }
  }
  return out;
}

/** 示例风格：壬申（枭杀）伏吟（多组以分号分隔） */
export function fuYinCompactLine(
  dayGan: string,
  pillars: { year: string; month: string; day: string; hour: string }
): string | null {
  const ps = [pillars.year, pillars.month, pillars.day, pillars.hour];
  const seen = new Set<string>();
  const parts: string[] = [];
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const gz = ps[i];
      if (gz && gz === ps[j] && !seen.has(gz)) {
        seen.add(gz);
        const sh = pillarTenGodShort(dayGan, gz);
        parts.push(`${gz}（${sh}）伏吟`);
      }
    }
  }
  return parts.length ? parts.join("；") : null;
}

/** 暗合（地支） */
export function anHeLines(pillars: {
  year: string;
  month: string;
  day: string;
  hour: string;
}): string[] {
  const zs = [pillars.year, pillars.month, pillars.day, pillars.hour].map((p) => p?.charAt(1) ?? "");
  const labels = ["年柱", "月柱", "日柱", "时柱"];
  const out: string[] = [];
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const a = zs[i];
      const b = zs[j];
      for (const [x, y] of AN_HE) {
        if ((a === x && b === y) || (a === y && b === x)) {
          out.push(`${labels[i]}与${labels[j]}：地支暗合（${x}${y}）`);
        }
      }
    }
  }
  return [...new Set(out)];
}

/** 仅四柱地支：午亥（伤枭）暗合（地支按子→亥序排列） */
export function anHeSiZhuCompact(dayGan: string, pillars: {
  year: string;
  month: string;
  day: string;
  hour: string;
}): string[] {
  const zs = [pillars.year, pillars.month, pillars.day, pillars.hour].map((p) => p?.charAt(1) ?? "");
  const zi = (z: string) => ZHI_STR.indexOf(z);
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const a = zs[i];
      const b = zs[j];
      for (const [x, y] of AN_HE) {
        if ((a === x && b === y) || (a === y && b === x)) {
          const [z1, z2] = zi(a) <= zi(b) ? [a, b] : [b, a];
          const key = `${z1}${z2}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const s1 = zhiMainQiShishenAbbrev(dayGan, z1);
          const s2 = zhiMainQiShishenAbbrev(dayGan, z2);
          out.push(`${z1}${z2}（${s1}${s2}）暗合`);
        }
      }
    }
  }
  return out;
}

const LIU_HAI_ZHI: [string, string][] = [
  ["子", "未"],
  ["丑", "午"],
  ["寅", "巳"],
  ["卯", "辰"],
  ["申", "亥"],
  ["酉", "戌"],
];

/** 仅四柱地支六害：申亥（杀枭）相害 */
export function liuHaiSiZhuCompact(dayGan: string, pillars: {
  year: string;
  month: string;
  day: string;
  hour: string;
}): string[] {
  const zs = [pillars.year, pillars.month, pillars.day, pillars.hour].map((p) => p?.charAt(1) ?? "");
  const zi = (z: string) => ZHI_STR.indexOf(z);
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const a = zs[i];
      const b = zs[j];
      for (const [x, y] of LIU_HAI_ZHI) {
        if ((a === x && b === y) || (a === y && b === x)) {
          const [z1, z2] = zi(a) <= zi(b) ? [a, b] : [b, a];
          const key = `${z1}${z2}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const s1 = zhiMainQiShishenAbbrev(dayGan, z1);
          const s2 = zhiMainQiShishenAbbrev(dayGan, z2);
          out.push(`${z1}${z2}（${s1}${s2}）相害`);
        }
      }
    }
  }
  return out;
}

/** 原局地支一行：暗合、相害（与技能1示例「午亥暗合、申亥相害」对齐） */
export function diZhiYuanJuSummary(dayGan: string, pillars: {
  year: string;
  month: string;
  day: string;
  hour: string;
}): string {
  const p1 = anHeSiZhuCompact(dayGan, pillars);
  const p2 = liuHaiSiZhuCompact(dayGan, pillars);
  return [...p1, ...p2].join("、") || "无";
}

export function cangGanLinesWithShishen(
  dayGan: string,
  pillars: { year: string; month: string; day: string; hour: string }
): { year: string; month: string; day: string; hour: string } {
  const keys: (keyof typeof pillars)[] = ["year", "month", "day", "hour"];
  const out: { year: string; month: string; day: string; hour: string } = {
    year: "",
    month: "",
    day: "",
    hour: "",
  };
  for (const k of keys) {
    const z = pillars[k].charAt(1);
    const gans = ZHI_HIDE_GAN[z] ?? [];
    const desc = gans
      .map((g) => {
        const ss = SHI_SHEN[dayGan + g] ?? "—";
        return `${g}(${ss})`;
      })
      .join("、");
    out[k] = z ? `${z}藏：${desc}` : "—";
  }
  return out;
}
