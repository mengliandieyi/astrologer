/**
 * 流年/流月简析：以「日主天干」对「流年年干 / 流月月干」取十神，配固定文案模板。
 * 为娱乐向轻量解读，非专业命理结论。
 */

const SHI_SHEN: Record<string, Record<string, string>> = {
  甲: { 甲: "比肩", 乙: "劫财", 丙: "食神", 丁: "伤官", 戊: "偏财", 己: "正财", 庚: "七杀", 辛: "正官", 壬: "偏印", 癸: "正印" },
  乙: { 甲: "劫财", 乙: "比肩", 丙: "伤官", 丁: "食神", 戊: "正财", 己: "偏财", 庚: "正官", 辛: "七杀", 壬: "正印", 癸: "偏印" },
  丙: { 甲: "偏印", 乙: "正印", 丙: "比肩", 丁: "劫财", 戊: "食神", 己: "伤官", 庚: "偏财", 辛: "正财", 壬: "七杀", 癸: "正官" },
  丁: { 甲: "正印", 乙: "偏印", 丙: "劫财", 丁: "比肩", 戊: "伤官", 己: "食神", 庚: "正财", 辛: "偏财", 壬: "正官", 癸: "七杀" },
  戊: { 甲: "七杀", 乙: "正官", 丙: "偏印", 丁: "正印", 戊: "比肩", 己: "劫财", 庚: "食神", 辛: "伤官", 壬: "偏财", 癸: "正财" },
  己: { 甲: "正官", 乙: "七杀", 丙: "正印", 丁: "偏印", 戊: "劫财", 己: "比肩", 庚: "伤官", 辛: "食神", 壬: "正财", 癸: "偏财" },
  庚: { 甲: "偏财", 乙: "正财", 丙: "七杀", 丁: "正官", 戊: "偏印", 己: "正印", 庚: "比肩", 辛: "劫财", 壬: "食神", 癸: "伤官" },
  辛: { 甲: "正财", 乙: "偏财", 丙: "正官", 丁: "七杀", 戊: "正印", 己: "偏印", 庚: "劫财", 辛: "比肩", 壬: "伤官", 癸: "食神" },
  壬: { 甲: "食神", 乙: "伤官", 丙: "偏财", 丁: "正财", 戊: "七杀", 己: "正官", 庚: "偏印", 辛: "正印", 壬: "比肩", 癸: "劫财" },
  癸: { 甲: "伤官", 乙: "食神", 丙: "正财", 丁: "偏财", 戊: "正官", 己: "七杀", 庚: "正印", 辛: "偏印", 壬: "劫财", 癸: "比肩" },
};

function getShiShen(dayStem: string, flowStem: string): string {
  return SHI_SHEN[dayStem]?.[flowStem] ?? "比肩";
}

const TAOHUA_BRANCH = new Set(["子", "午", "卯", "酉"]);

/** 流年地支桃花等提示（与 summary 正文区分，供「流年小贴士」单独展示） */
export function branchLoveHint(branch: string): string {
  if (TAOHUA_BRANCH.has(branch)) return "地支带桃花气，社交与异性缘易活跃，宜把握分寸。";
  return "";
}

const NARR: Record<
  string,
  { love: string; wealth: string; career: string; health: string }
> = {
  比肩: {
    love: "感情中易强调自我与平等，忌争强；适合先沟通期待再谈承诺。",
    wealth: "财运多靠同行与合伙，宜分账清晰；忌攀比消费与重复投入。",
    career: "职场宜协作与对标学习，忌暗斗；适合团队项目与并肩作战。",
    health: "宜规律作息与适度运动；忌久坐赌气、情绪闷在心里。",
  },
  劫财: {
    love: "易有竞争或分心之象，忌三角与冲动表态；宜慢一点确认关系边界。",
    wealth: "财来财去之象，宜守现金流与预算；合作需防分利不清。",
    career: "节奏快、变数多，宜抢窗口但忌硬碰；可转岗与拓展副业。",
    health: "忌熬夜与冲动决策后的透支；宜减压与睡眠优先。",
  },
  食神: {
    love: "相处偏温和体贴，利约会与仪式感；宜表达关心而非说教。",
    wealth: "利技能变现与口碑财，宜产品化与长尾收入。",
    career: "利创意、表达与交付质量，宜作品积累与客户沉淀。",
    health: "宜饮食节律与脾胃调养；忌暴饮暴食与情绪性进食。",
  },
  伤官: {
    love: "情绪表达强，易有摩擦也易有火花；宜克制伤人话语。",
    wealth: "利创新财与短线机会，忌投机；宜规则内突破。",
    career: "利破局与提案，忌顶撞上级；适合展示个人品牌。",
    health: "神经系统与睡眠易波动；宜放松训练，忌长期亢奋熬夜。",
  },
  偏财: {
    love: "人缘与桃花机会偏多，宜专一与透明；忌暧昧拖泥带水。",
    wealth: "利副业、项目奖与流动财，宜风控与止盈。",
    career: "利外拓、资源与商务，宜人脉复盘与合同条款。",
    health: "社交多时宜防过劳与作息乱；宜适度锻炼与饮酒节制。",
  },
  正财: {
    love: "偏稳、利谈婚论嫁与家庭规划；宜务实与长期承诺。",
    wealth: "利固定收入与储蓄，宜记账与资产配置。",
    career: "利岗位深耕与绩效，宜制度内晋升与责任边界。",
    health: "宜稳健养生与体检节奏；忌久坐与忽视慢性小痛。",
  },
  七杀: {
    love: "压力大时易冷淡或强势；宜给彼此空间与安全感。",
    wealth: "高压下仍有进财机会，宜合规与止损；忌赌性。",
    career: "利挑战岗位与结果导向，宜目标拆解与压力管理。",
    health: "压力与心血管负担需留意；宜有氧与情绪疏导，忌硬扛。",
  },
  正官: {
    love: "利稳定与公开关系，宜责任与时间表；忌逃避沟通。",
    wealth: "利正途与制度内收益，宜证书与合规变现。",
    career: "利升职、考核与组织认可，宜流程与上级对齐。",
    health: "宜规律体检与肩颈放松；忌长期高压无休息。",
  },
  偏印: {
    love: "易内敛或疏离，宜主动分享感受；忌冷战。",
    wealth: "利研究、专利与冷门赛道，宜长期主义。",
    career: "利专精与方法论，宜深度而非广度扩张。",
    health: "思虑多易影响睡眠与消化；宜冥想散步，忌久坐少动。",
  },
  正印: {
    love: "利被照顾与安全感，宜感恩回馈；忌依赖。",
    wealth: "利学历、背书与贵人财，宜学习与资格。",
    career: "利培训、职称与平台背书，宜导师与体系内成长。",
    health: "宜营养与作息被照顾；忌懒散少动与湿气滞留。",
  },
};

function fillNarrative(ss: string): { love: string; wealth: string; career: string; health: string } {
  const base = NARR[ss] ?? NARR["比肩"];
  return { ...base };
}

/** 流年总述冒号后一句：随十神变化，避免各年「建议」完全相同 */
const SUMMARY_TAIL: Record<string, string> = {
  比肩: "宜在协作与对标中抓主线，感情先对齐期待与边界。",
  劫财: "宜守现金流与承诺节奏，感情忌竞争表态与冲动投入。",
  食神: "宜作品与口碑复利，感情以体贴表达替代说教。",
  伤官: "宜破局与展示个人价值，感情忌伤人话语、宜就事论事。",
  偏财: "宜外拓与项目奖，感情宜透明专一、忌暧昧拖延。",
  正财: "宜固定收入与储蓄规划，感情利长期承诺与家庭节奏。",
  七杀: "宜目标拆解与抗压执行，感情需空间与安全感并重。",
  正官: "宜流程与上级对齐，感情利稳定与责任沟通。",
  偏印: "宜专精与方法论沉淀，感情忌冷战、宜主动表达。",
  正印: "宜学习背书与平台成长，感情宜感恩回馈、忌过度依赖。",
};

/** 大运总述（十年尺度）：与流年同模板、不同措辞 */
const DA_YUN_TAIL: Record<string, string> = {
  比肩: "本运宜协作与长期对标，感情与承诺节奏宜拉长对齐。",
  劫财: "本运宜守现金流与边界，感情忌竞争表态与冲动投入。",
  食神: "本运宜作品与口碑复利，感情重体贴表达与仪式感。",
  伤官: "本运宜破局与个人品牌，感情忌伤人话语、宜留余地。",
  偏财: "本运宜外拓与项目奖，感情宜透明专一。",
  正财: "本运宜固定收入与储蓄，感情利婚嫁与家庭规划。",
  七杀: "本运宜抗压与目标拆解，感情需空间与安全感。",
  正官: "本运宜流程与考核，感情利稳定与责任沟通。",
  偏印: "本运宜专精与方法论，感情忌冷战、宜主动表达。",
  正印: "本运宜学习与背书，感情宜感恩回馈、忌过度依赖。",
};

/** 流月总述：与流年同理，避免各月同一句 */
const LIUYUE_TAIL: Record<string, string> = {
  比肩: "本月宜小步复盘，协作中对齐目标再放量。",
  劫财: "本月宜收紧现金流，感情忌争锋与重复投入。",
  食神: "本月宜温和输出与作品打磨，感情重倾听。",
  伤官: "本月宜提案与表达，感情忌尖锐、宜留余地。",
  偏财: "本月宜外拓与机会筛选，感情宜透明边界。",
  正财: "本月宜记账与固定节奏，感情利务实约定。",
  七杀: "本月宜拆解目标、抗压执行，感情给彼此缓冲。",
  正官: "本月宜流程对齐与考核节点，感情重责任沟通。",
  偏印: "本月宜深度专精，感情忌冷战、宜书面理清。",
  正印: "本月宜学习与背书，感情宜回馈与适度独立。",
};

export type FortuneTriad = {
  love: string;
  wealth: string;
  career: string;
  health: string;
  summary: string;
};

/** 大运柱：以大运干支天干对日主取十神，配感情/财/事业与总述 */
export function daYunFortune(dayStem: string, ganZhi: string): FortuneTriad {
  const flowStem = ganZhi.charAt(0);
  const branch = ganZhi.charAt(1) || "";
  const ss = getShiShen(dayStem, flowStem);
  const { love, wealth, career, health } = fillNarrative(ss);
  const extra = branchLoveHint(branch);
  const loveLine = extra ? `${love} ${extra}` : love;
  const tail = DA_YUN_TAIL[ss] ?? DA_YUN_TAIL["比肩"];
  const summary = `大运${ganZhi}，天干对日主为「${ss}」：${tail}`;
  return { love: loveLine, wealth, career, health, summary };
}

export function liuNianFortune(dayStem: string, yearGanZhi: string): FortuneTriad {
  const flowStem = yearGanZhi.charAt(0);
  const branch = yearGanZhi.charAt(1) || "";
  const ss = getShiShen(dayStem, flowStem);
  const { love, wealth, career, health } = fillNarrative(ss);
  const extra = branchLoveHint(branch);
  const loveLine = extra ? `${love} ${extra}` : love;
  const tail = SUMMARY_TAIL[ss] ?? SUMMARY_TAIL["比肩"];
  const summary = `流年${yearGanZhi}，天干对日主为「${ss}」：${tail}`;
  return { love: loveLine, wealth, career, health, summary };
}

export function liuYueFortune(dayStem: string, monthGanZhi: string): FortuneTriad {
  const flowStem = monthGanZhi.charAt(0);
  const branch = monthGanZhi.charAt(1) || "";
  const ss = getShiShen(dayStem, flowStem);
  const { love, wealth, career, health } = fillNarrative(ss);
  const extra = branchLoveHint(branch);
  const loveLine = extra ? `${love} ${extra}` : love;
  const mt = LIUYUE_TAIL[ss] ?? LIUYUE_TAIL["比肩"];
  const summary = `流月柱${monthGanZhi}，天干对日主为「${ss}」：${mt}`;
  return { love: loveLine, wealth, career, health, summary };
}
