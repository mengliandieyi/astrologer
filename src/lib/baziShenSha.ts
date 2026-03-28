/**
 * 八字四柱神煞（非黄历择日吉神）。结果按年/月/日/时柱分桶；流年、大运、流月另有「流运神煞」接口。
 *
 * **口径基线：问真八字 / Cantian 系通书**（以 Cantian 公开 wiki 与通行《三命通会》等表为主）。
 * 天乙：甲戊庚牛羊、乙己鼠猴乡、丙丁猪鸡位、壬癸兔蛇藏、六辛逢虎马；**年干与日干各查四柱地支**。
 * 文昌、福星、太极：**年干与日干各查**（与问真「年干或日干」一致）。
 * 德秀：俱全时在德/秀干所在柱各标；**仅秀干透出**时仍标德秀（问真常见展示）。
 * 羊刃/飞刃：**问真以帝旺为刃**（如丁刃在巳），飞刃为冲刃之支；与「禄后一支为刃」派不同。
 * 天德合/月德合/国印等：用 Cantian/通书月支表。
 * 扩展：十恶大败、天转/地转日、将星、学堂（年纳音长生支）、正词馆（月日时干坐禄或长生）、元辰（年支表；时支落空于年旬者不标）、
 * 金舆日柱统摄（金舆支在≥两柱时问真亦列日柱）、华盖（年月同支且皆命中时年柱不重复）、吊客与元辰同支则从吊客。
 * 勾绞：传入 gender 时默认计算，可用 `includeGouJiao: false` 关闭。
 * 问真若为闭源微调且无公开差异说明处，以本文件常量为准；发现与 APP 不符时可对照具体干支再改表。
 * 仅供文化娱乐参考。
 */

const STEMS = "甲乙丙丁戊己庚辛壬癸" as const;
const BR12 = "子丑寅卯辰巳午未申酉戌亥";

/** 六十甲子序（与旬空、纳音一致） */
const JIAZI60: string[] = Array.from({ length: 60 }, (_, i) => `${STEMS[i % 10]}${BR12[i % 12]}`);

const KONG_WANG_BY_XUN: (readonly [string, string])[] = [
  ["戌", "亥"],
  ["申", "酉"],
  ["午", "未"],
  ["辰", "巳"],
  ["寅", "卯"],
  ["子", "丑"],
];

/** 以该柱干支定六甲旬，返回旬空二支（常用于日柱定空亡） */
function kongWangForPillar(pillar: string): readonly [string, string] | undefined {
  const xi = JIAZI60.indexOf(pillar);
  if (xi < 0) return undefined;
  return KONG_WANG_BY_XUN[Math.floor(xi / 10)]!;
}

function offsetBranch(branch: string, delta: number): string {
  const i = BR12.indexOf(branch);
  if (i < 0) return "";
  return BR12[(i + delta + 120) % 12]!;
}

/** 年柱六十甲子纳音五行（童子煞等用） */
const NAYIN_WUXING: Record<string, "金" | "木" | "水" | "火" | "土"> = {
  甲子: "金",
  乙丑: "金",
  丙寅: "火",
  丁卯: "火",
  戊辰: "木",
  己巳: "木",
  庚午: "土",
  辛未: "土",
  壬申: "金",
  癸酉: "金",
  甲戌: "火",
  乙亥: "火",
  丙子: "水",
  丁丑: "水",
  戊寅: "土",
  己卯: "土",
  庚辰: "金",
  辛巳: "金",
  壬午: "木",
  癸未: "木",
  甲申: "水",
  乙酉: "水",
  丙戌: "土",
  丁亥: "土",
  戊子: "火",
  己丑: "火",
  庚寅: "木",
  辛卯: "木",
  壬辰: "水",
  癸巳: "水",
  甲午: "金",
  乙未: "金",
  丙申: "火",
  丁酉: "火",
  戊戌: "木",
  己亥: "木",
  庚子: "土",
  辛丑: "土",
  壬寅: "金",
  癸卯: "金",
  甲辰: "火",
  乙巳: "火",
  丙午: "水",
  丁未: "水",
  戊申: "土",
  己酉: "土",
  庚戌: "金",
  辛亥: "金",
  壬子: "木",
  癸丑: "木",
  甲寅: "水",
  乙卯: "水",
  丙辰: "土",
  丁巳: "土",
  戊午: "火",
  己未: "火",
  庚申: "木",
  辛酉: "木",
  壬戌: "水",
  癸亥: "水",
};

/** 灾煞（白虎）：以年支三合，四柱地支见冲将星之位 */
const ZAI_SHA: Record<string, string> = {
  申: "午",
  子: "午",
  辰: "午",
  寅: "子",
  午: "子",
  戌: "子",
  巳: "卯",
  酉: "卯",
  丑: "卯",
  亥: "酉",
  卯: "酉",
  未: "酉",
};

/** 吊客：以年支、日支为锚，四柱见对应支 */
const DIAO_KE: Record<string, string> = {
  子: "戌",
  丑: "亥",
  寅: "子",
  卯: "丑",
  辰: "寅",
  巳: "卯",
  午: "辰",
  未: "巳",
  申: "午",
  酉: "未",
  戌: "申",
  亥: "酉",
};

/** 红艳煞：日干见支 */
const HONG_YAN_ZHI: Record<string, string> = {
  甲: "午",
  乙: "申",
  丙: "寅",
  丁: "未",
  戊: "辰",
  己: "辰",
  庚: "戌",
  辛: "酉",
  壬: "子",
  癸: "申",
};

/** 血刃：日干见支；问真系与羊刃同取帝旺支 */
const XUE_REN_ZHI: Record<string, string> = {
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

/** 月令血刃：四柱地支见者（与日干血刃可并存，同柱合并依据） */
const XUE_REN_BY_MONTH: Record<string, string> = {
  寅: "丑",
  卯: "未",
  辰: "寅",
  巳: "申",
  午: "卯",
  未: "酉",
  申: "辰",
  酉: "戌",
  戌: "巳",
  亥: "亥",
  子: "午",
  丑: "子",
};

/** 词馆（子平法）：日干见全柱干支 */
const CI_GUAN_PILLAR: Record<string, string> = {
  甲: "庚寅",
  乙: "辛卯",
  丙: "乙巳",
  丁: "戊午",
  戊: "丁巳",
  己: "庚午",
  庚: "壬申",
  辛: "癸酉",
  壬: "癸亥",
  癸: "壬戌",
};

export function stemOf(pillar: string): string {
  return pillar?.charAt(0) ?? "";
}
export function branchOf(pillar: string): string {
  return pillar?.charAt(1) ?? "";
}

export type ShenShaItem = {
  name: string;
  type: "ji" | "xiong" | "neutral";
  effect: string;
  basis: string;
};

export type ShenShaByPillar = {
  year: ShenShaItem[];
  month: ShenShaItem[];
  day: ShenShaItem[];
  hour: ShenShaItem[];
};

/** 勾绞煞等需性别：0 女 1 男。传入 gender 时默认计算勾绞（与问真一致）；可显式 `includeGouJiao: false` 关闭。 */
export type ComputeBaziShenShaOptions = {
  gender?: 0 | 1;
  includeGouJiao?: boolean;
};

const PILLAR_KEYS: (keyof ShenShaByPillar)[] = ["year", "month", "day", "hour"];
const PILLAR_LABELS = ["年柱", "月柱", "日柱", "时柱"] as const;

function emptyBuckets(): ShenShaByPillar {
  return { year: [], month: [], day: [], hour: [] };
}

/** 同一柱上同名神煞只保留一条 */
function pushSha(b: ShenShaByPillar, idx: number, item: ShenShaItem) {
  const k = PILLAR_KEYS[idx];
  const list = b[k];
  if (list.some((x) => x.name === item.name)) return;
  list.push(item);
}

/** 太极贵人 */
const TAI_JI: Record<string, string[]> = {
  甲: ["子", "午"],
  乙: ["子", "午"],
  丙: ["卯", "酉"],
  丁: ["卯", "酉"],
  戊: ["辰", "戌", "丑", "未"],
  己: ["辰", "戌", "丑", "未"],
  庚: ["寅", "亥"],
  辛: ["寅", "亥"],
  壬: ["巳", "申"],
  癸: ["巳", "申"],
};

const KUI_GANG: Record<string, string[]> = {
  庚: ["辰", "戌"],
  壬: ["辰"],
  戊: ["戌"],
};

/** 金舆：问真口诀 甲龙乙蛇丙戊羊、丁己猴哥庚犬方、辛猪壬牛癸逢虎 */
const JIN_YU: Record<string, string> = {
  甲: "辰",
  乙: "巳",
  丙: "未",
  丁: "申",
  戊: "未",
  己: "申",
  庚: "戌",
  辛: "亥",
  壬: "丑",
  癸: "寅",
};

/** 金匮：甲戊见戌、乙己见巳、丙庚见未、丁辛见酉、壬癸见子 */
function jinGuiTargetBranch(dayStem: string): string | undefined {
  if ("甲戊".includes(dayStem)) return "戌";
  if ("乙己".includes(dayStem)) return "巳";
  if ("丙庚".includes(dayStem)) return "未";
  if ("丁辛".includes(dayStem)) return "酉";
  if ("壬癸".includes(dayStem)) return "子";
  return undefined;
}

const TIAN_YI: Record<string, string[]> = {
  甲: ["丑", "未"],
  乙: ["子", "申"],
  丙: ["亥", "酉"],
  丁: ["亥", "酉"],
  戊: ["丑", "未"],
  己: ["子", "申"],
  庚: ["丑", "未"],
  辛: ["寅", "午"],
  壬: ["卯", "巳"],
  癸: ["卯", "巳"],
};

/**
 * 文昌贵人：食神之禄（临官）。
 * 口诀：甲乙巳午报君知，丙戊申宫丁己鸡；庚猪辛鼠壬逢虎，癸人见兔入云梯。
 * 即甲巳、乙午、丙申、丁酉、戊申、己酉、庚亥、辛子、壬寅、癸卯。
 */
const WEN_CHANG: Record<string, string> = {
  甲: "巳",
  乙: "午",
  丙: "申",
  丁: "酉",
  戊: "申",
  己: "酉",
  庚: "亥",
  辛: "子",
  壬: "寅",
  癸: "卯",
};

const YI_MA: Record<string, string> = {
  申: "寅",
  子: "寅",
  辰: "寅",
  寅: "申",
  午: "申",
  戌: "申",
  巳: "亥",
  酉: "亥",
  丑: "亥",
  亥: "巳",
  卯: "巳",
  未: "巳",
};

const TAO_HUA: Record<string, string> = {
  申: "酉",
  子: "酉",
  辰: "酉",
  寅: "卯",
  午: "卯",
  戌: "卯",
  巳: "午",
  酉: "午",
  丑: "午",
  亥: "子",
  卯: "子",
  未: "子",
};

const HUA_GAI: Record<string, string> = {
  寅: "戌",
  午: "戌",
  戌: "戌",
  巳: "丑",
  酉: "丑",
  丑: "丑",
  申: "辰",
  子: "辰",
  辰: "辰",
  亥: "未",
  卯: "未",
  未: "未",
};

const LU_SHEN: Record<string, string> = {
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

/** 国印贵人：年干、日干各查四柱地支（甲戌、乙亥、丙丑…） */
const GUO_YIN_ZHI: Record<string, string> = {
  甲: "戌",
  乙: "亥",
  丙: "丑",
  丁: "寅",
  戊: "丑",
  己: "寅",
  庚: "辰",
  辛: "巳",
  壬: "未",
  癸: "申",
};

/**
 * 天德合：以月支，见指定天干或地支（Cantian/问真常用表）。
 * 午月见寅、酉月见亥、子月见申 等为支；其余多为干。
 */
const TIAN_DE_HE_BY_MONTH: Record<string, { stem?: string; branch?: string }> = {
  寅: { stem: "壬" },
  卯: { stem: "巳" },
  辰: { stem: "丁" },
  巳: { stem: "丙" },
  午: { branch: "寅" },
  未: { stem: "己" },
  申: { stem: "戊" },
  酉: { branch: "亥" },
  戌: { stem: "辛" },
  亥: { stem: "庚" },
  子: { branch: "申" },
  丑: { stem: "乙" },
};

/** 月德合：寅午戌辛、亥卯未己、申子辰丁、巳酉丑乙 */
const YUE_DE_HE_STEM: Record<string, string> = {
  寅: "辛",
  午: "辛",
  戌: "辛",
  亥: "己",
  卯: "己",
  未: "己",
  申: "丁",
  子: "丁",
  辰: "丁",
  巳: "乙",
  酉: "乙",
  丑: "乙",
};

/** 羊刃：问真/Cantian 以临官帝旺为刃（阴干亦取帝旺，非禄后一支） */
const YANG_REN: Record<string, string> = {
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

const JIU_CHOU_DAYS = new Set([
  "壬子",
  "壬午",
  "戊子",
  "戊午",
  "己卯",
  "己酉",
  "乙卯",
  "乙酉",
  "辛酉",
  "辛卯",
]);
const BA_ZHUAN_DAYS = new Set(["甲寅", "乙卯", "丁未", "戊戌", "己未", "庚申", "辛酉", "壬子"]);
/**
 * 天赦日：通书有戊寅、甲午、戊申、甲子四季之说；问真多张截图神煞栏未列夏甲午/秋戊申，
 * 故此处仅用春冬二日，以免与 APP 并列冲突。若要对齐全本通书，可改回四日全集。
 */
const TIAN_SHE_DAYS = new Set(["戊寅", "甲子"]);

/** 阴差阳错日（十二日） */
const YIN_CHA_YANG_CUO_DAYS = new Set([
  "丙子",
  "丙午",
  "丁丑",
  "丁未",
  "戊寅",
  "戊申",
  "辛卯",
  "辛酉",
  "壬辰",
  "壬戌",
  "癸巳",
  "癸亥",
]);

/** 六秀日 */
const LIU_XIU_DAYS = new Set(["丙午", "丁未", "戊子", "戊午", "己丑", "己未"]);

/** 十恶大败日（问真所列禄绝空亡等十日） */
const SHI_E_DA_BAI_DAYS = new Set([
  "甲辰",
  "乙巳",
  "丙申",
  "丁亥",
  "庚辰",
  "戊戌",
  "己丑",
  "壬申",
  "壬戌",
  "癸亥",
]);

/** 天转日 */
const TIAN_ZHUAN_DAYS = new Set(["乙卯", "丙午", "辛酉", "壬子"]);

/** 地转日 */
const DI_ZHUAN_DAYS = new Set(["辛卯", "戊午", "癸酉", "丙子"]);

/** 元辰（大耗）：年支 → 支（子未丑午寅巳卯辰辰卯巳寅午丑未申亥酉戌戌酉亥申） */
const YUAN_CHEN_BY_YEAR: Record<string, string> = {
  子: "未",
  丑: "午",
  寅: "巳",
  卯: "辰",
  辰: "卯",
  巳: "寅",
  午: "丑",
  未: "子",
  申: "亥",
  酉: "戌",
  戌: "酉",
  亥: "申",
};

/** 将星：三合中神 */
const JIANG_XING: Record<string, string> = {
  寅: "午",
  午: "午",
  戌: "午",
  申: "子",
  子: "子",
  辰: "子",
  巳: "酉",
  酉: "酉",
  丑: "酉",
  亥: "卯",
  卯: "卯",
  未: "卯",
};

/** 干之长生地支（问真正词馆：柱干坐长生，如壬见申） */
const CHANG_SHENG_BRANCH: Record<string, string> = {
  甲: "亥",
  乙: "午",
  丙: "寅",
  丁: "酉",
  戊: "寅",
  己: "酉",
  庚: "巳",
  辛: "子",
  壬: "申",
  癸: "卯",
};

/** 年柱纳音五行 → 学堂所主长生支 */
const XUE_TANG_BRANCH_BY_ELEMENT: Record<string, string> = {
  金: "巳",
  木: "亥",
  水: "申",
  火: "寅",
  土: "申",
};

/** 流霞：日干见支（问真常用表） */
const LIU_XIA_ZHI: Record<string, string> = {
  甲: "酉",
  乙: "戌",
  丙: "未",
  丁: "申",
  戊: "巳",
  己: "午",
  庚: "辰",
  辛: "卯",
  壬: "亥",
  癸: "寅",
};

const TIAN_DE_BY_MONTH_BRANCH: Record<string, { kind: "stem" | "branch"; value: string }> = {
  寅: { kind: "stem", value: "丁" },
  卯: { kind: "branch", value: "申" },
  辰: { kind: "stem", value: "壬" },
  巳: { kind: "stem", value: "辛" },
  午: { kind: "branch", value: "亥" },
  未: { kind: "stem", value: "甲" },
  申: { kind: "stem", value: "癸" },
  酉: { kind: "branch", value: "寅" },
  戌: { kind: "stem", value: "丙" },
  亥: { kind: "stem", value: "乙" },
  子: { kind: "branch", value: "巳" },
  丑: { kind: "stem", value: "庚" },
};

function yueDeStem(monthBranch: string): string | undefined {
  if (["寅", "午", "戌"].includes(monthBranch)) return "丙";
  if (["申", "子", "辰"].includes(monthBranch)) return "壬";
  if (["亥", "卯", "未"].includes(monthBranch)) return "甲";
  if (["巳", "酉", "丑"].includes(monthBranch)) return "庚";
  return undefined;
}

/**
 * 天厨贵人：食神建禄之宫，主衣食福禄。
 * 通行简表：甲巳丙巳、乙午丁午、戊申己酉、庚亥辛子、壬寅癸卯（与文昌同系但取法不同）。
 */
const TIAN_CHU_BRANCH: Record<string, string> = {
  甲: "巳",
  乙: "午",
  丙: "巳",
  丁: "午",
  戊: "申",
  己: "酉",
  庚: "亥",
  辛: "子",
  壬: "寅",
  癸: "卯",
};

/** 福星贵人：以日干查地支，甲丙寅子、乙癸卯丑、戊申丁亥己未庚午辛巳壬辰等。 */
const FU_XING_BRANCHES: Record<string, string[]> = {
  甲: ["寅", "子"],
  乙: ["卯", "丑"],
  丙: ["寅", "子"],
  丁: ["亥"],
  戊: ["申"],
  己: ["未"],
  庚: ["午"],
  辛: ["巳"],
  壬: ["辰"],
  癸: ["卯", "丑"],
};

const JIN_SHEN_PILLARS = new Set(["乙丑", "己巳", "癸酉"]);

/** 红鸾：以年支定咸池对冲系，常见为子卯、丑寅…亥辰 */
const HONG_LUAN: Record<string, string> = {
  子: "卯",
  丑: "寅",
  寅: "丑",
  卯: "子",
  辰: "亥",
  巳: "戌",
  午: "酉",
  未: "申",
  申: "未",
  酉: "午",
  戌: "巳",
  亥: "辰",
};

const LIU_CHONG: Record<string, string> = {
  子: "午",
  午: "子",
  丑: "未",
  未: "丑",
  寅: "申",
  申: "寅",
  卯: "酉",
  酉: "卯",
  辰: "戌",
  戌: "辰",
  巳: "亥",
  亥: "巳",
};

/** 孤辰：以年支三合分组，四柱地支见（亥子丑见寅、寅卯辰见巳、巳午未见申、申酉戌见亥） */
function guChenBranch(yearBranch: string): string | undefined {
  if (["亥", "子", "丑"].includes(yearBranch)) return "寅";
  if (["寅", "卯", "辰"].includes(yearBranch)) return "巳";
  if (["巳", "午", "未"].includes(yearBranch)) return "申";
  if (["申", "酉", "戌"].includes(yearBranch)) return "亥";
  return undefined;
}

/** 寡宿：以年支三合分组（亥子丑见戌、寅卯辰见丑、巳午未见辰、申酉戌见未） */
function guaSuBranch(yearBranch: string): string | undefined {
  if (["亥", "子", "丑"].includes(yearBranch)) return "戌";
  if (["寅", "卯", "辰"].includes(yearBranch)) return "丑";
  if (["巳", "午", "未"].includes(yearBranch)) return "辰";
  if (["申", "酉", "戌"].includes(yearBranch)) return "未";
  return undefined;
}

/** 劫煞：以年支或日支三合查（申子辰见巳、寅午戌见亥、巳酉丑见寅、亥卯未见申） */
const JIE_SHA: Record<string, string> = {
  申: "巳",
  子: "巳",
  辰: "巳",
  寅: "亥",
  午: "亥",
  戌: "亥",
  巳: "寅",
  酉: "寅",
  丑: "寅",
  亥: "申",
  卯: "申",
  未: "申",
};

/** 亡神：以年支或日支三合查（申子辰见亥、寅午戌见巳、巳酉丑见申、亥卯未见寅） */
const WANG_SHEN: Record<string, string> = {
  申: "亥",
  子: "亥",
  辰: "亥",
  寅: "巳",
  午: "巳",
  戌: "巳",
  巳: "申",
  酉: "申",
  丑: "申",
  亥: "寅",
  卯: "寅",
  未: "寅",
};

/** 序号兼顾问真四柱列内常见顺序 */
const ORDER: Record<string, number> = {
  天德: 0,
  月德: 2,
  天赦: 4,
  国印贵人: 5,
  天乙贵人: 6,
  福星: 7,
  德秀贵人: 8,
  天德合: 9,
  月德合: 10,
  飞刃: 11,
  太极贵人: 12,
  空亡: 13,
  文昌贵人: 14,
  学堂: 15,
  天厨: 16,
  金匮: 17,
  金舆: 18,
  禄神: 19,
  魁罡: 20,
  金神: 21,
  红鸾: 22,
  天喜: 23,
  十恶大败: 24,
  阴差阳错: 25,
  六秀日: 26,
  九丑日: 27,
  八专日: 28,
  天转日: 29,
  地转日: 30,
  正词馆: 31,
  词馆: 32,
  驿马: 33,
  桃花: 34,
  红艳煞: 35,
  童子煞: 36,
  华盖: 37,
  将星: 38,
  孤辰: 39,
  寡宿: 40,
  流霞: 41,
  劫煞: 42,
  亡神: 43,
  灾煞: 44,
  丧门: 45,
  吊客: 46,
  披麻: 47,
  元辰: 48,
  羊刃: 49,
  血刃: 50,
  勾煞: 51,
  绞煞: 52,
};

function sortBucket(items: ShenShaItem[]) {
  items.sort((a, b) => (ORDER[a.name] ?? 99) - (ORDER[b.name] ?? 99));
}

/**
 * 德秀贵人：以月支三合局，四柱天干须同时见「德」与「秀」两组（《三命通会》等）。
 * 寅午戌月丙丁为德、戊癸为秀；申子辰月壬癸戊己为德、丙辛甲己为秀；
 * 巳酉丑月庚辛为德、乙庚为秀；亥卯未月甲乙为德、丁壬为秀。
 */
function deXiuDeAndXiuSets(monthBranch: string): { de: string[]; xiu: string[] } | null {
  if (["寅", "午", "戌"].includes(monthBranch)) return { de: ["丙", "丁"], xiu: ["戊", "癸"] };
  if (["申", "子", "辰"].includes(monthBranch)) return { de: ["壬", "癸", "戊", "己"], xiu: ["丙", "辛", "甲", "己"] };
  if (["巳", "酉", "丑"].includes(monthBranch)) return { de: ["庚", "辛"], xiu: ["乙", "庚"] };
  if (["亥", "卯", "未"].includes(monthBranch)) return { de: ["甲", "乙"], xiu: ["丁", "壬"] };
  return null;
}

export function flattenShenShaByPillar(b: ShenShaByPillar): ShenShaItem[] {
  const flat = [...b.year, ...b.month, ...b.day, ...b.hour];
  flat.sort((a, x) => (ORDER[a.name] ?? 99) - (ORDER[x.name] ?? 99));
  return flat;
}

function fillBuckets(
  dayStem: string,
  pillars: [string, string, string, string],
  opts?: ComputeBaziShenShaOptions
): ShenShaByPillar {
  const b = emptyBuckets();
  const branches = pillars.map((p) => branchOf(p));
  const stems = pillars.map((p) => stemOf(p));
  const monthBranch = branches[1]!;
  const yearBranch = branches[0]!;
  const dayBranch = branches[2]!;
  const hourBranch = branches[3]!;
  const dayPillar = pillars[2];

  // 日柱专属
  if (JIU_CHOU_DAYS.has(dayPillar)) {
    pushSha(b, 2, {
      name: "九丑日",
      type: "xiong",
      effect: "多主感情婚姻与隐私事上易生波澜、口舌是非；宜守礼法、慎承诺，大事以稳为先。",
      basis: `日柱${dayPillar}（九丑日）`,
    });
  }
  if (BA_ZHUAN_DAYS.has(dayPillar)) {
    pushSha(b, 2, {
      name: "八专日",
      type: "neutral",
      effect: "自坐专气，主观强、执一而行；利深耕与坚持，忌固执与感情用事。",
      basis: `日柱${dayPillar}（八专日）`,
    });
  }
  if (TIAN_SHE_DAYS.has(dayPillar)) {
    pushSha(b, 2, {
      name: "天赦",
      type: "ji",
      effect: "赦过宥罪之象，利化解阻滞、重启局面；仍须守法合规，忌侥幸妄为。",
      basis: `日柱${dayPillar}（天赦日）`,
    });
  }
  if (YIN_CHA_YANG_CUO_DAYS.has(dayPillar)) {
    pushSha(b, 2, {
      name: "阴差阳错",
      type: "xiong",
      effect: "婚恋与合作易生反复、期望落差之象；宜沟通对齐、书面约定，忌冲动决断。",
      basis: `日柱${dayPillar}（阴差阳错日）`,
    });
  }
  if (LIU_XIU_DAYS.has(dayPillar)) {
    pushSha(b, 2, {
      name: "六秀日",
      type: "ji",
      effect: "清秀聪慧之象，利学艺、审美与表达；宜专精一行。",
      basis: `日柱${dayPillar}（六秀日）`,
    });
  }
  if (SHI_E_DA_BAI_DAYS.has(dayPillar)) {
    pushSha(b, 2, {
      name: "十恶大败",
      type: "xiong",
      effect: "禄落空亡之象，主破耗与计划落空；宜守成、重储蓄与合规，忌孤注一掷。",
      basis: `日柱${dayPillar}（十恶大败日）`,
    });
  }
  if (TIAN_ZHUAN_DAYS.has(dayPillar)) {
    pushSha(b, 2, {
      name: "天转日",
      type: "xiong",
      effect: "五行专旺之极端日，主起伏剧烈；宜见好就收，忌贪满与冒进。",
      basis: `日柱${dayPillar}（天转日）`,
    });
  }
  if (DI_ZHUAN_DAYS.has(dayPillar)) {
    pushSha(b, 2, {
      name: "地转日",
      type: "xiong",
      effect: "纳音专旺之极端日，主环境骤变；宜留余地与备份，忌孤注一掷。",
      basis: `日柱${dayPillar}（地转日）`,
    });
  }

  const kg = KUI_GANG[dayStem];
  if (kg?.includes(dayBranch)) {
    pushSha(b, 2, {
      name: "魁罡",
      type: "neutral",
      effect: "权势肃杀、果断见机之象；能掌事成局，但若遇刑冲破害则易反噬，须以自律与规则化用权。",
      basis: `日柱${dayStem}${dayBranch}（魁罡）`,
    });
  }

  if (JIN_SHEN_PILLARS.has(pillars[2])) {
    pushSha(b, 2, {
      name: "金神",
      type: "neutral",
      effect:
        "金气肃杀、刚毅果决之象（民间常称金口诀/金神煞）；能断事执行，忌刚愎与刑伤；宜以制度与专业化解锋芒。",
      basis: `日柱${pillars[2]}（金神）`,
    });
  }
  if (JIN_SHEN_PILLARS.has(pillars[3])) {
    pushSha(b, 3, {
      name: "金神",
      type: "neutral",
      effect:
        "金气肃杀、刚毅果决之象（民间常称金口诀/金神煞）；能断事执行，忌刚愎与刑伤；宜以制度与专业化解锋芒。",
      basis: `时柱${pillars[3]}（金神）`,
    });
  }

  // 金匮（日干 → 地支见于某柱）
  const jg = jinGuiTargetBranch(dayStem);
  if (jg) {
    for (let i = 0; i < 4; i++) {
      if (branches[i] === jg) {
        pushSha(b, i, {
          name: "金匮",
          type: "ji",
          effect: "财库与积蓄之象，利储蓄、资产与长期回报；忌贪快与杠杆失控。",
          basis: `日干${dayStem} · 金匮在支${jg} · ${PILLAR_LABELS[i]}支${branches[i]}`,
        });
      }
    }
  }

  // 红鸾、天喜（以年支起例，四柱地支见）
  const hl = HONG_LUAN[yearBranch];
  if (hl) {
    const tx = LIU_CHONG[hl];
    for (let i = 0; i < 4; i++) {
      if (branches[i] === hl) {
        pushSha(b, i, {
          name: "红鸾",
          type: "ji",
          effect: "婚恋喜庆与人缘之象；利订婚、公开关系与仪式类安排，忌冲动承诺。",
          basis: `年支${yearBranch} · 红鸾在支${hl} · ${PILLAR_LABELS[i]}支${branches[i]}`,
        });
      }
      if (tx && branches[i] === tx) {
        pushSha(b, i, {
          name: "天喜",
          type: "ji",
          effect: "喜庆与吉事之象，利庆贺、合作与缓和关系；宜顺势推进、少争讼。",
          basis: `年支${yearBranch} · 天喜在支${tx}（与红鸾相冲位） · ${PILLAR_LABELS[i]}支${branches[i]}`,
        });
      }
    }
  }

  // 孤辰、寡宿（以年支定，四柱地支见则归该柱）
  const gcb = guChenBranch(yearBranch);
  const gsb = guaSuBranch(yearBranch);
  if (gcb) {
    for (let i = 0; i < 4; i++) {
      if (branches[i] === gcb) {
        pushSha(b, i, {
          name: "孤辰",
          type: "neutral",
          effect: "孤清独处之象；利专研与独立作业，忌长期封闭与沟通缺失。",
          basis: `年支${yearBranch} · 孤辰在支${gcb} · ${PILLAR_LABELS[i]}支${branches[i]}`,
        });
      }
    }
  }
  if (gsb) {
    for (let i = 0; i < 4; i++) {
      if (branches[i] === gsb) {
        pushSha(b, i, {
          name: "寡宿",
          type: "neutral",
          effect: "情缘淡薄或晚成之象；宜明确边界与节奏，忌冷战与猜疑。",
          basis: `年支${yearBranch} · 寡宿在支${gsb} · ${PILLAR_LABELS[i]}支${branches[i]}`,
        });
      }
    }
  }

  // 天德
  const td = TIAN_DE_BY_MONTH_BRANCH[monthBranch];
  if (td) {
    if (td.kind === "stem") {
      for (let i = 0; i < 4; i++) {
        if (stems[i] === td.value) {
          pushSha(b, i, {
            name: "天德",
            type: "ji",
            effect: "德星护佑，利逢凶化吉、得人宽宥；宜行善积德、以柔克刚。",
            basis: `月支${monthBranch} · 天德在干${td.value} · ${PILLAR_LABELS[i]}干${stems[i]}`,
          });
        }
      }
    } else {
      for (let i = 0; i < 4; i++) {
        if (branches[i] === td.value) {
          pushSha(b, i, {
            name: "天德",
            type: "ji",
            effect: "德星护佑，利逢凶化吉、得人宽宥；宜行善积德、以柔克刚。",
            basis: `月支${monthBranch} · 天德在支${td.value} · ${PILLAR_LABELS[i]}支${branches[i]}`,
          });
        }
      }
    }
  }

  const yd = yueDeStem(monthBranch);
  if (yd) {
    for (let i = 0; i < 4; i++) {
      if (stems[i] === yd) {
        pushSha(b, i, {
          name: "月德",
          type: "ji",
          effect: "阴德和合之象，利人际缓和、化争为议；宜团队协作与换位思考。",
          basis: `月支${monthBranch} · 月德${yd} · ${PILLAR_LABELS[i]}干${stems[i]}`,
        });
      }
    }
  }

  const tdh = TIAN_DE_HE_BY_MONTH[monthBranch];
  if (tdh) {
    for (let i = 0; i < 4; i++) {
      const hitStem = tdh.stem && stems[i] === tdh.stem;
      const hitBr = tdh.branch && branches[i] === tdh.branch;
      if (!hitStem && !hitBr) continue;
      pushSha(b, i, {
        name: "天德合",
        type: "ji",
        effect: "与天德同类之吉，利化险为夷、得人宽宥；宜积德守礼。",
        basis: `月支${monthBranch} · 天德合（${hitStem ? `干${tdh.stem}` : `支${tdh.branch}`}）· ${PILLAR_LABELS[i]}`,
      });
    }
  }

  const ydh = YUE_DE_HE_STEM[monthBranch];
  if (ydh) {
    for (let i = 0; i < 4; i++) {
      if (stems[i] === ydh) {
        pushSha(b, i, {
          name: "月德合",
          type: "ji",
          effect: "与月德五合之干，利和合、少争；宜协作与换位思考。",
          basis: `月支${monthBranch} · 月德合干${ydh} · ${PILLAR_LABELS[i]}`,
        });
      }
    }
  }

  const dx = deXiuDeAndXiuSets(monthBranch);
  if (dx) {
    const hasDe = stems.some((s) => dx.de.includes(s));
    const hasXiu = stems.some((s) => dx.xiu.includes(s));
    const full = hasDe && hasXiu;
    const xiuOnlyWenzhen = hasXiu && !hasDe;
    if (full || xiuOnlyWenzhen) {
      for (let i = 0; i < 4; i++) {
        const s = stems[i]!;
        const inDe = dx.de.includes(s);
        const inXiu = dx.xiu.includes(s);
        if (full) {
          if (!inDe && !inXiu) continue;
          pushSha(b, i, {
            name: "德秀贵人",
            type: "ji",
            effect: "主聪慧温厚、气质清秀；若遇学堂财官更利。忌冲克破压。",
            basis: `月支${monthBranch} · 德秀俱全 · 本柱干${s}属${inDe && inXiu ? "德、秀" : inDe ? "德" : "秀"}`,
          });
        } else if (xiuOnlyWenzhen && inXiu) {
          pushSha(b, i, {
            name: "德秀贵人",
            type: "ji",
            effect: "主聪慧温厚、气质清秀；若遇学堂财官更利。忌冲克破压。",
            basis: `月支${monthBranch} · 德秀（问真等：仅秀干透出，德干未现）· 秀干${s}`,
          });
        }
      }
    }
  }

  const applyGuoYin = (stem: string, lab: string) => {
    const gz = GUO_YIN_ZHI[stem];
    if (!gz) return;
    for (let i = 0; i < 4; i++) {
      if (branches[i] === gz) {
        pushSha(b, i, {
          name: "国印贵人",
          type: "ji",
          effect: "信印权柄之象，利公职、契约与声誉；宜守法重诺，忌投机越界。",
          basis: `${lab}${stem} · 国印在支${gz} · ${PILLAR_LABELS[i]}`,
        });
      }
    }
  };
  applyGuoYin(stems[0]!, "年干");
  applyGuoYin(dayStem, "日干");

  const tc = TIAN_CHU_BRANCH[dayStem];
  if (tc) {
    for (let i = 0; i < 4; i++) {
      if (branches[i] === tc) {
        pushSha(b, i, {
          name: "天厨",
          type: "ji",
          effect: "食禄与口福之象，利餐饮、审美、生活品质与资源调配；忌暴饮暴食与铺张。",
          basis: `日干${dayStem} · 天厨在支${tc} · ${PILLAR_LABELS[i]}支${branches[i]}`,
        });
      }
    }
  }

  /** 太极：日干、年干分别查四柱地支；同柱合并依据 */
  const taiJiEffect =
    "遇难呈祥之象，利于钻研、思辨与玄学文化兴趣；心态平和时更易化阻力为养分。";
  const yearStem = stems[0];
  const taiJiBasisParts: string[][] = [[], [], [], []];
  for (let i = 0; i < 4; i++) {
    const br = branches[i];
    if (TAI_JI[dayStem]?.includes(br)) taiJiBasisParts[i].push(`日干${dayStem} · 见支${br}`);
    if (TAI_JI[yearStem]?.includes(br)) taiJiBasisParts[i].push(`年干${yearStem} · 见支${br}`);
  }
  for (let i = 0; i < 4; i++) {
    const parts = taiJiBasisParts[i];
    if (!parts.length) continue;
    pushSha(b, i, {
      name: "太极贵人",
      type: "ji",
      effect: taiJiEffect,
      basis: `${parts.join("；")} · ${PILLAR_LABELS[i]}`,
    });
  }

  // 福星：年干、日干各查地支（问真/Cantian）
  const fuXingLabels: string[][] = [[], [], [], []];
  for (let i = 0; i < 4; i++) {
    const br = branches[i];
    if (FU_XING_BRANCHES[dayStem]?.includes(br)) fuXingLabels[i].push(`日干${dayStem}`);
    if (FU_XING_BRANCHES[yearStem]?.includes(br)) fuXingLabels[i].push(`年干${yearStem}`);
  }
  for (let i = 0; i < 4; i++) {
    const labs = fuXingLabels[i];
    if (!labs.length) continue;
    pushSha(b, i, {
      name: "福星",
      type: "ji",
      effect: "福禄与安稳之象，利小成与日常顺遂；宜知足守常、积小胜为大安。",
      basis: `${labs.join("、")} · 福星见支${branches[i]} · ${PILLAR_LABELS[i]}`,
    });
  }

  // 天乙贵人：年干、日干各查（甲戊庚牛羊…）
  const tianYiLabels: string[][] = [[], [], [], []];
  for (let i = 0; i < 4; i++) {
    const br = branches[i];
    if (TIAN_YI[dayStem]?.includes(br)) tianYiLabels[i].push(`日干${dayStem}`);
    if (TIAN_YI[yearStem]?.includes(br)) tianYiLabels[i].push(`年干${yearStem}`);
  }
  for (let i = 0; i < 4; i++) {
    const labs = tianYiLabels[i];
    if (!labs.length) continue;
    pushSha(b, i, {
      name: "天乙贵人",
      type: "ji",
      effect: "贵人暗助、逢凶化吉之机；人际与关键节点上易得提携，宜主动沟通与守信。",
      basis: `${labs.join("、")} · 见支${branches[i]}（天乙）· ${PILLAR_LABELS[i]}`,
    });
  }

  // 文昌贵人：年干、日干各查
  const wenChangLabels: string[][] = [[], [], [], []];
  for (let i = 0; i < 4; i++) {
    const br = branches[i];
    const wd = WEN_CHANG[dayStem];
    const wy = WEN_CHANG[yearStem];
    if (wd && br === wd) wenChangLabels[i].push(`日干${dayStem}`);
    if (wy && br === wy) wenChangLabels[i].push(`年干${yearStem}`);
  }
  for (let i = 0; i < 4; i++) {
    const labs = wenChangLabels[i];
    if (!labs.length) continue;
    pushSha(b, i, {
      name: "文昌贵人",
      type: "ji",
      effect: "文思与考试、表达之利；适合学习、写作、考证与结构化输出。",
      basis: `${labs.join("、")} · 文昌在支${branches[i]} · ${PILLAR_LABELS[i]}`,
    });
  }

  // 禄、金舆、羊刃、飞刃：以日干为主
  for (let i = 0; i < 4; i++) {
    const br = branches[i];
    if (LU_SHEN[dayStem] === br) {
      pushSha(b, i, {
        name: "禄神",
        type: "ji",
        effect: "禄为养命之源，利资源与底气；宜稳岗增收、夯实主业，忌投机透支。",
        basis: `日干${dayStem} · ${PILLAR_LABELS[i]}支见禄${br}`,
      });
    }
    const jy = JIN_YU[dayStem];
    if (jy && br === jy) {
      pushSha(b, i, {
        name: "金舆",
        type: "ji",
        effect: "富贵与资源汇聚之象；利名利与项目/资金承接，宜重形象与合规边界，避免不明来源的“快财”。",
        basis: `日干${dayStem} · ${PILLAR_LABELS[i]}支${br}（金舆）`,
      });
    }
    const yr = YANG_REN[dayStem];
    if (yr && br === yr) {
      pushSha(b, i, {
        name: "羊刃",
        type: "xiong",
        effect: "性刚势急，易有冲突与破耗；大事宜缓、忌冲动决策，宜以规则与备份化解。",
        basis: `日干${dayStem} · ${PILLAR_LABELS[i]}支见刃${br}`,
      });
    }
    const yangBr = YANG_REN[dayStem];
    const feiBr = yangBr ? LIU_CHONG[yangBr] : undefined;
    if (feiBr && br === feiBr) {
      pushSha(b, i, {
        name: "飞刃",
        type: "xiong",
        effect: "冲羊刃之位，主突发伤耗、手术血光之象；宜守规则、缓决策，大事留备份。",
        basis: `日干${dayStem} · 羊刃在${yangBr} · 冲为飞刃${feiBr} · ${PILLAR_LABELS[i]}`,
      });
    }
  }

  const jyBrAll = JIN_YU[dayStem];
  if (jyBrAll && !b.day.some((x) => x.name === "金舆")) {
    const jyHits = branches.map((br, i) => (br === jyBrAll ? i : -1)).filter((i) => i >= 0);
    if (jyHits.length >= 2) {
      pushSha(b, 2, {
        name: "金舆",
        type: "ji",
        effect: "富贵与资源汇聚之象；利名利与项目/资金承接，宜重形象与合规边界，避免不明来源的“快财”。",
        basis: `日干${dayStem} · 金舆在支${jyBrAll}（两柱及以上见，问真亦列日柱）`,
      });
    }
  }

  // 驿马、桃花、华盖：年支、日支为锚，命中之柱分别归入
  const addAnchorStar = (
    name: ShenShaItem["name"],
    type: ShenShaItem["type"],
    effect: string,
    anchor: string,
    anchorLabel: string,
    targetBranch: string | undefined,
    i: number
  ) => {
    if (!targetBranch || branches[i] !== targetBranch) return;
    pushSha(b, i, {
      name,
      type,
      effect,
      basis: `${anchorLabel}${anchor} · 见于${PILLAR_LABELS[i]}支${branches[i]}`,
    });
  }

  for (const anchor of [yearBranch, dayBranch]) {
    const al = anchor === yearBranch ? "年支" : "日支";
    const ym = YI_MA[anchor];
    const th = TAO_HUA[anchor];
    const js = JIE_SHA[anchor];
    const ws = WANG_SHEN[anchor];
    for (let i = 0; i < 4; i++) {
      addAnchorStar("驿马", "neutral", "动中求财、出行、变动之象；利开拓与异地，忌根基未稳时频繁折腾。", anchor, al, ym, i);
      addAnchorStar("桃花", "neutral", "人缘与魅力之象；利社交与审美，感情需防暧昧与分心，事业宜把握边界。", anchor, al, th, i);
      addAnchorStar("劫煞", "xiong", "劫夺与突发之象；防破耗、纠纷与小人，大事宜留凭证与备份。", anchor, al, js, i);
      addAnchorStar("亡神", "xiong", "暗耗与虚惊之象；防疏忽、官非与健康波动，宜守规则与节奏。", anchor, al, ws, i);
    }
  }

  const applyHuaGai = (anchor: string, al: string) => {
    const hg = HUA_GAI[anchor];
    if (!hg) return;
    let hits: number[] = [];
    for (let i = 0; i < 4; i++) {
      if (branches[i] === hg) hits.push(i);
    }
    if (
      al === "年支" &&
      hits.includes(0) &&
      hits.includes(1) &&
      branches[0] === branches[1] &&
      hg === branches[0]
    ) {
      hits = hits.filter((i) => i !== 0);
    }
    for (const i of hits) {
      pushSha(b, i, {
        name: "华盖",
        type: "neutral",
        effect: "孤高与专研之象；利独处深学与技艺，忌过度封闭与固执。",
        basis: `${al}${anchor} · 见于${PILLAR_LABELS[i]}支${branches[i]}`,
      });
    }
  };
  applyHuaGai(yearBranch, "年支");
  applyHuaGai(dayBranch, "日支");

  for (const anchor of [yearBranch, dayBranch]) {
    const al = anchor === yearBranch ? "年支" : "日支";
    const jx = JIANG_XING[anchor];
    if (!jx) continue;
    for (let i = 0; i < 4; i++) {
      if (branches[i] !== jx) continue;
      pushSha(b, i, {
        name: "将星",
        type: "ji",
        effect: "权柄与统筹之象，利带队与决断；忌刚愎与人际失衡。",
        basis: `${al}${anchor} · 将星在支${jx} · ${PILLAR_LABELS[i]}`,
      });
    }
  }

  const nxWxYear = NAYIN_WUXING[pillars[0]!];
  const xueTangBr = nxWxYear ? XUE_TANG_BRANCH_BY_ELEMENT[nxWxYear] : undefined;
  if (xueTangBr) {
    for (let i = 0; i < 4; i++) {
      if (branches[i] !== xueTangBr) continue;
      pushSha(b, i, {
        name: "学堂",
        type: "ji",
        effect: "研学与考试之象，利读书、考证与结构化积累。",
        basis: `年柱纳音${nxWxYear} · 学堂长生在支${xueTangBr} · ${PILLAR_LABELS[i]}`,
      });
    }
  }

  for (let i = 0; i < 4; i++) {
    if (i === 0) continue;
    const st = stems[i]!;
    const brP = branches[i]!;
    const luB = LU_SHEN[st];
    const csB = CHANG_SHENG_BRANCH[st];
    const hitLu = luB && brP === luB;
    const hitCs = csB && brP === csB;
    if (!hitLu && !hitCs) continue;
    pushSha(b, i, {
      name: "正词馆",
      type: "ji",
      effect: "干坐禄或长生，利学业专精与表达。",
      basis: `${PILLAR_LABELS[i]}干${st}·支${brP}（${hitLu ? "临官禄" : "长生"}位 · 正词馆）`,
    });
  }

  const kwYearForYuanChen = kongWangForPillar(pillars[0]!);
  const yuanChenBr = YUAN_CHEN_BY_YEAR[yearBranch];
  if (yuanChenBr) {
    for (let i = 0; i < 4; i++) {
      if (branches[i] !== yuanChenBr) continue;
      if (i === 3 && kwYearForYuanChen?.includes(branches[i]!)) continue;
      pushSha(b, i, {
        name: "元辰",
        type: "xiong",
        effect: "大耗之象，主破耗与折腾；宜节制扩张，留应急与凭证。",
        basis: `年支${yearBranch} · 元辰在支${yuanChenBr} · ${PILLAR_LABELS[i]}`,
      });
    }
  }

  // —— 旬空、灾煞、吊客、红艳、血刃、词馆、勾绞、童子（扩展神煞）
  /** 旬空：年柱、日柱之旬空可套入四柱地支（与问真展示一致，如年空申酉见时支申）；月柱、时柱之旬空仅看本柱地支是否落空，不套到其它柱（避免日支因月旬而标空亡）。 */
  const mergeKong = (kw: readonly [string, string], anchorLabel: string, anchorPillar: string, onlyIdx?: number) => {
    const indices = onlyIdx === undefined ? [0, 1, 2, 3] : [onlyIdx];
    for (const i of indices) {
      if (!kw.includes(branches[i]!)) continue;
      const list = b[PILLAR_KEYS[i]!];
      const ex = list.find((x) => x.name === "空亡");
      const bit = `${anchorLabel}${anchorPillar}旬空${kw.join("、")}`;
      if (ex) {
        if (!ex.basis.includes(bit)) ex.basis = `${ex.basis}；${bit}`;
      } else {
        pushSha(b, i, {
          name: "空亡",
          type: "neutral",
          effect: "虚空待填之象；吉神空则力减，凶神空则祸轻；宜借势、合约与落地执行，忌只说不做。",
          basis: `${bit} · 本柱支${branches[i]}（${PILLAR_LABELS[i]}）`,
        });
      }
    }
  };
  const kwDay = kongWangForPillar(dayPillar);
  if (kwDay) mergeKong(kwDay, "日柱", dayPillar);
  const kwMonth = kongWangForPillar(pillars[1]!);
  if (kwMonth) mergeKong(kwMonth, "月柱", pillars[1]!, 1);
  const kwYear = kongWangForPillar(pillars[0]!);
  if (kwYear) mergeKong(kwYear, "年柱", pillars[0]!);
  const kwHour = kongWangForPillar(pillars[3]!);
  if (kwHour) mergeKong(kwHour, "时柱", pillars[3]!, 3);

  const zai = ZAI_SHA[yearBranch];
  if (zai) {
    for (let i = 0; i < 4; i++) {
      if (branches[i] === zai) {
        pushSha(b, i, {
          name: "灾煞",
          type: "xiong",
          effect: "突发灾病、意外与阻滞之象；宜守规则、备份与体检，忌逞强冒险。",
          basis: `年支${yearBranch}三合 · 灾煞在${zai} · ${PILLAR_LABELS[i]}`,
        });
      }
    }
  }

  for (const [anchor, lab] of [
    [yearBranch, "年支"],
    [dayBranch, "日支"],
  ] as const) {
    const dk = DIAO_KE[anchor];
    if (!dk) continue;
    for (let i = 0; i < 4; i++) {
      if (branches[i] !== dk) continue;
      if (YUAN_CHEN_BY_YEAR[yearBranch] === dk) continue;
      pushSha(b, i, {
        name: "吊客",
        type: "xiong",
        effect: "孝丧、别离与情绪低潮之象；宜保重、缓重大决策，留意长辈健康与人情往来。",
        basis: `${lab}${anchor} · 吊客在支${dk} · ${PILLAR_LABELS[i]}`,
      });
    }
  }

  const sangMenBr = offsetBranch(yearBranch, 2);
  if (sangMenBr) {
    for (let i = 0; i < 4; i++) {
      if (branches[i] !== sangMenBr) continue;
      pushSha(b, i, {
        name: "丧门",
        type: "xiong",
        effect: "孝丧、忧疑之民俗所指；宜保重、缓重大决策，留意长辈与情绪节律。",
        basis: `年支${yearBranch} · 丧门在支${sangMenBr} · ${PILLAR_LABELS[i]}`,
      });
    }
  }
  const piMaBr = offsetBranch(yearBranch, 9);
  if (piMaBr) {
    for (let i = 0; i < 4; i++) {
      if (branches[i] !== piMaBr) continue;
      pushSha(b, i, {
        name: "披麻",
        type: "xiong",
        effect: "孝服、别离之民俗所指；宜守礼与节奏，勿作恐吓依据。",
        basis: `年支${yearBranch} · 披麻在支${piMaBr} · ${PILLAR_LABELS[i]}`,
      });
    }
  }

  const hy = HONG_YAN_ZHI[dayStem];
  if (hy) {
    for (let i = 0; i < 4; i++) {
      if (branches[i] === hy) {
        pushSha(b, i, {
          name: "红艳煞",
          type: "neutral",
          effect: "魅力与情感张力之象；利人缘与审美，忌边界不清与冲动关系。",
          basis: `日干${dayStem} · 红艳在支${hy} · ${PILLAR_LABELS[i]}`,
        });
      }
    }
  }

  const lxBr = LIU_XIA_ZHI[dayStem];
  if (lxBr) {
    for (let i = 0; i < 4; i++) {
      if (branches[i] !== lxBr) continue;
      pushSha(b, i, {
        name: "流霞",
        type: "xiong",
        effect: "血酒产厄之民俗所指；宜节制酒色、防意外，规律作息。",
        basis: `日干${dayStem} · 流霞在支${lxBr} · ${PILLAR_LABELS[i]}`,
      });
    }
  }

  const xr = XUE_REN_ZHI[dayStem];
  if (xr) {
    for (let i = 0; i < 4; i++) {
      if (branches[i] === xr) {
        pushSha(b, i, {
          name: "血刃",
          type: "xiong",
          effect: "血光、手术、产厄之象；宜防外伤、规律作息，大事勿逞强。",
          basis: `日干${dayStem} · 血刃在支${xr} · ${PILLAR_LABELS[i]}`,
        });
      }
    }
  }

  const xrm = XUE_REN_BY_MONTH[monthBranch];
  if (xrm) {
    for (let i = 0; i < 4; i++) {
      if (branches[i] !== xrm) continue;
      const list = b[PILLAR_KEYS[i]!];
      const existing = list.find((x) => x.name === "血刃");
      if (existing) {
        existing.basis = `${existing.basis}；月令${monthBranch} · 刃在支${xrm}`;
      } else {
        pushSha(b, i, {
          name: "血刃",
          type: "xiong",
          effect: "血光、手术、产厄之象；宜防外伤、规律作息，大事勿逞强。",
          basis: `月令${monthBranch} · 血刃在支${xrm} · ${PILLAR_LABELS[i]}`,
        });
      }
    }
  }

  const cg = CI_GUAN_PILLAR[dayStem];
  if (cg) {
    for (let i = 0; i < 4; i++) {
      if (pillars[i] === cg) {
        pushSha(b, i, {
          name: "词馆",
          type: "ji",
          effect: "学业文章、专精表达之象；利考证、著述与结构化输出。",
          basis: `日干${dayStem} · 见词馆全柱${cg}（子平法，亦称正词馆） · ${PILLAR_LABELS[i]}`,
        });
      }
    }
  }

  if (opts?.includeGouJiao !== false && (opts?.gender === 0 || opts?.gender === 1)) {
    const yangYear = ["子", "寅", "辰", "午", "申", "戌"].includes(yearBranch);
    const yangNanYinNv = (yangYear && opts.gender === 1) || (!yangYear && opts.gender === 0);
    const gouBr = offsetBranch(yearBranch, yangNanYinNv ? 3 : -3);
    const jiaoBr = offsetBranch(yearBranch, yangNanYinNv ? -3 : 3);
    const gjLabel = yangNanYinNv ? "阳男阴女" : "阴男阳女";
    for (let i = 0; i < 4; i++) {
      if (gouBr && branches[i] === gouBr) {
        pushSha(b, i, {
          name: "勾煞",
          type: "xiong",
          effect: "纠缠、是非与拖延之象；事宜厘清契约，忌口头约定。",
          basis: `年支${yearBranch} · ${gjLabel} · 勾在支${gouBr} · ${PILLAR_LABELS[i]}`,
        });
      }
      if (jiaoBr && branches[i] === jiaoBr) {
        pushSha(b, i, {
          name: "绞煞",
          type: "xiong",
          effect: "绕结、反复之象；大事宜简化流程，防连环纠纷。",
          basis: `年支${yearBranch} · ${gjLabel} · 绞在支${jiaoBr} · ${PILLAR_LABELS[i]}`,
        });
      }
    }
  }

  const pushTongZi = (idx: number, basis: string) => {
    pushSha(b, idx, {
      name: "童子煞",
      type: "neutral",
      effect: "民俗所指童子之象，多主敏感、晚熟或与他缘薄；仅供文化参考，勿作恐吓依据。",
      basis,
    });
  };
  const spring = ["寅", "卯", "辰"].includes(monthBranch);
  const summer = ["巳", "午", "未"].includes(monthBranch);
  const autumn = ["申", "酉", "戌"].includes(monthBranch);
  const winter = ["亥", "子", "丑"].includes(monthBranch);
  const nx = NAYIN_WUXING[pillars[0]!];

  if (spring || autumn) {
    if (dayBranch === "寅" || dayBranch === "子") {
      pushTongZi(2, `月令春秋 · 日支${dayBranch}`);
    }
    if (hourBranch === "寅" || hourBranch === "子") {
      pushTongZi(3, `月令春秋 · 时支${hourBranch}`);
    }
  }
  if (summer || winter) {
    if (["卯", "未", "辰"].includes(dayBranch)) {
      pushTongZi(2, `月令冬夏 · 日支${dayBranch}`);
    }
    if (["卯", "未", "辰"].includes(hourBranch)) {
      pushTongZi(3, `月令冬夏 · 时支${hourBranch}`);
    }
  }
  if (nx === "金" || nx === "木") {
    if (dayBranch === "午" || dayBranch === "卯") {
      pushTongZi(2, `年柱纳音${nx} · 日支${dayBranch}`);
    }
    if (hourBranch === "午" || hourBranch === "卯") {
      pushTongZi(3, `年柱纳音${nx} · 时支${hourBranch}`);
    }
  }
  if (nx === "水" || nx === "火") {
    if (dayBranch === "酉" || dayBranch === "戌") {
      pushTongZi(2, `年柱纳音${nx} · 日支${dayBranch}`);
    }
    if (hourBranch === "酉" || hourBranch === "戌") {
      pushTongZi(3, `年柱纳音${nx} · 时支${hourBranch}`);
    }
  }
  if (nx === "土") {
    if (dayBranch === "辰" || dayBranch === "巳") {
      pushTongZi(2, `年柱纳音${nx} · 日支${dayBranch}`);
    }
    if (hourBranch === "辰" || hourBranch === "巳") {
      pushTongZi(3, `年柱纳音${nx} · 时支${hourBranch}`);
    }
  }

  // 驿马/桃花/华盖/劫煞/亡神：同柱可并存多项；同名同柱仍由 pushSha 去重。

  for (const k of PILLAR_KEYS) sortBucket(b[k]);
  return b;
}

export function computeBaziShenSha(
  pillars: {
    year: string;
    month: string;
    day: string;
    hour: string;
  },
  opts?: ComputeBaziShenShaOptions
): { by_pillar: ShenShaByPillar; flat: ShenShaItem[] } {
  const dayStem = stemOf(pillars.day);
  if (!STEMS.includes(dayStem as (typeof STEMS)[number])) {
    const empty = emptyBuckets();
    return { by_pillar: empty, flat: [] };
  }
  const arr: [string, string, string, string] = [pillars.year, pillars.month, pillars.day, pillars.hour];
  const by_pillar = fillBuckets(dayStem, arr, opts);
  const flat = flattenShenShaByPillar(by_pillar).slice(0, 80);
  return { by_pillar, flat };
}

/** 流运干支（流年/大运/流月）相对命局的常见神煞提示 */
export function computeFlowShenSha(
  pillars: { year: string; month: string; day: string; hour: string },
  flowGanZhi: string,
  role: "流年" | "大运" | "流月"
): ShenShaItem[] {
  const dayStem = stemOf(pillars.day);
  if (!STEMS.includes(dayStem as (typeof STEMS)[number])) return [];
  const yb = branchOf(pillars.year);
  const rb = branchOf(pillars.day);
  const fb = branchOf(flowGanZhi);
  const out: ShenShaItem[] = [];

  const tag = (name: string, type: ShenShaItem["type"], effect: string, basis: string) => {
    out.push({ name: `${role}·${name}`, type, effect, basis });
  };

  const yearStemFlow = stemOf(pillars.year);
  const tianYiFlow: string[] = [];
  if (TIAN_YI[dayStem]?.includes(fb)) tianYiFlow.push(`日干${dayStem}`);
  if (TIAN_YI[yearStemFlow]?.includes(fb)) tianYiFlow.push(`年干${yearStemFlow}`);
  if (tianYiFlow.length) {
    tag("天乙", "ji", "贵人助缘之象，利求助、签约与关键人脉。", `${tianYiFlow.join("、")} · ${role}支${fb}为天乙位`);
  }
  const tjDayF = TAI_JI[dayStem]?.includes(fb);
  const tjYearF = TAI_JI[yearStemFlow]?.includes(fb);
  if (tjDayF || tjYearF) {
    const bits: string[] = [];
    if (tjDayF) bits.push(`日干${dayStem}`);
    if (tjYearF) bits.push(`年干${yearStemFlow}`);
    tag("太极", "ji", "化险为夷、思辨深入之象。", `${bits.join("、")} · ${role}支${fb}为太极位`);
  }
  const wenChangFlow: string[] = [];
  if (WEN_CHANG[dayStem] === fb) wenChangFlow.push(`日干${dayStem}`);
  if (WEN_CHANG[yearStemFlow] === fb) wenChangFlow.push(`年干${yearStemFlow}`);
  if (wenChangFlow.length) {
    tag("文昌", "ji", "利考试、表达与输出。", `${wenChangFlow.join("、")} · ${role}支${fb}为文昌位`);
  }
  const fuFlow: string[] = [];
  if (FU_XING_BRANCHES[dayStem]?.includes(fb)) fuFlow.push(`日干${dayStem}`);
  if (FU_XING_BRANCHES[yearStemFlow]?.includes(fb)) fuFlow.push(`年干${yearStemFlow}`);
  if (fuFlow.length) {
    tag("福星", "ji", "福禄安稳之象，利小成与日常顺遂。", `${fuFlow.join("、")} · ${role}支${fb}为福星位`);
  }

  const maY = YI_MA[yb];
  const maR = YI_MA[rb];
  if (fb === maY) tag("驿马", "neutral", "动变、出行、开拓之象。", `年支${yb}之马在${maY} · ${role}逢之`);
  if (fb === maR && maR !== maY) tag("驿马", "neutral", "动变、出行、开拓之象。", `日支${rb}之马在${maR} · ${role}逢之`);

  const thY = TAO_HUA[yb];
  const thR = TAO_HUA[rb];
  if (fb === thY) tag("桃花", "neutral", "人缘、魅力与情感话题升温。", `年支${yb}之咸池在${thY} · ${role}逢之`);
  if (fb === thR && thR !== thY) tag("桃花", "neutral", "人缘、魅力与情感话题升温。", `日支${rb}之咸池在${thR} · ${role}逢之`);

  const hgY = HUA_GAI[yb];
  const hgR = HUA_GAI[rb];
  if (fb === hgY) tag("华盖", "neutral", "独处、专研、技艺之象。", `年支${yb}之华盖在${hgY} · ${role}逢之`);
  if (fb === hgR && hgR !== hgY) tag("华盖", "neutral", "独处、专研、技艺之象。", `日支${rb}之华盖在${hgR} · ${role}逢之`);

  const hl = HONG_LUAN[yb];
  if (hl && fb === hl) tag("红鸾", "ji", "喜庆、婚恋类机缘更易显性化。", `年支${yb} · 红鸾在${hl} · ${role}逢之`);
  const tx = hl ? LIU_CHONG[hl] : undefined;
  if (tx && fb === tx) tag("天喜", "ji", "吉庆、和合之象。", `年支${yb} · 天喜在${tx} · ${role}逢之`);

  const jg = jinGuiTargetBranch(dayStem);
  if (jg && fb === jg) tag("金匮", "ji", "财库与积蓄类主题更易浮现。", `日干${dayStem} · 金匮在${jg} · ${role}逢之`);

  const gcb = guChenBranch(yb);
  if (gcb && fb === gcb) tag("孤辰", "neutral", "独处、疏离感或晚成节奏。", `年支${yb} · 孤辰在${gcb} · ${role}逢之`);
  const gsb = guaSuBranch(yb);
  if (gsb && fb === gsb) tag("寡宿", "neutral", "情缘与合伙需耐心经营。", `年支${yb} · 寡宿在${gsb} · ${role}逢之`);

  const jsY = JIE_SHA[yb];
  const jsR = JIE_SHA[rb];
  if (jsY && fb === jsY) tag("劫煞", "xiong", "防破耗、争夺与突发状况。", `年支${yb}之劫煞在${jsY} · ${role}逢之`);
  if (jsR && fb === jsR && jsR !== jsY) tag("劫煞", "xiong", "防破耗、争夺与突发状况。", `日支${rb}之劫煞在${jsR} · ${role}逢之`);

  const wsY = WANG_SHEN[yb];
  const wsR = WANG_SHEN[rb];
  if (wsY && fb === wsY) tag("亡神", "xiong", "防疏忽、暗耗与健康波动。", `年支${yb}之亡神在${wsY} · ${role}逢之`);
  if (wsR && fb === wsR && wsR !== wsY) tag("亡神", "xiong", "防疏忽、暗耗与健康波动。", `日支${rb}之亡神在${wsR} · ${role}逢之`);

  const FLOW_ORDER: Record<string, number> = {
    天乙: 0,
    太极: 1,
    文昌: 2,
    福星: 3,
    金匮: 4,
    红鸾: 5,
    天喜: 6,
    孤辰: 7,
    寡宿: 8,
    劫煞: 9,
    亡神: 10,
    驿马: 11,
    桃花: 12,
    华盖: 13,
  };
  const flowBase = (n: string) => n.replace(/^流年·|^大运·|^流月·/, "");
  out.sort((a, b) => (FLOW_ORDER[flowBase(a.name)] ?? 99) - (FLOW_ORDER[flowBase(b.name)] ?? 99));
  return out.slice(0, 16);
}
