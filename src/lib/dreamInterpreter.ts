type DreamRule = {
  name: string;
  patterns: RegExp[];
  folk: string;
  reality: string;
  meaning: string;
  reminder: string;
};

const RULES: DreamRule[] = [
  {
    name: "追赶",
    patterns: [/追赶|被追|追杀|逃跑|逃命|躲避|躲藏/],
    folk: "传统象征里，追赶常被看作外力催逼、事来找人，代表某件事已经逼近眼前。",
    reality: "现实映射多是任务、关系、债务、人情或选择压力，让你下意识想回避。",
    meaning: "多指向压力逼近、任务催促或关系里的回避感。梦里一直跑，通常不是预示坏事，而是提醒你有一件事正在被拖延、压着或不愿正面处理。",
    reminder: "近期可先找出最让你想逃开的一个问题，把它拆成当天能完成的小动作。",
  },
  {
    name: "房子",
    patterns: [/房子|屋子|房间|家里|大楼|楼房|旧屋|新房|卧室|客厅/],
    folk: "房屋在民俗象征里常对应家宅、根基、内在安顿与个人气场。",
    reality: "现实映射多是安全感、家庭关系、私人空间、身份边界或你对自我状态的感受。",
    meaning: "房子常象征自我状态、家庭边界与安全感。房间很多或空间很大，常见于心里装着多条线索；旧房偏向旧事、旧关系，新房偏向新的计划或身份变化。",
    reminder: "若梦里房子杂乱，可对应整理现实中的居住空间、工作台或家庭沟通边界。",
  },
  {
    name: "迷路与出口",
    patterns: [/迷路|找不到路|找不到出口|出不去|绕来绕去|走不出去|迷宫/],
    folk: "迷路、无出口在传统解梦里多指道路未明、关口未通，事情尚未到顺畅阶段。",
    reality: "现实映射通常是信息过载、选择过多、目标不清，或你知道要解决问题但还没找到路径。",
    meaning: "迷路、找不到出口，多和选择不清、方向感不足或信息过载有关。它强调的是“暂时不知道怎么走”，不是事情没有解法。",
    reminder: "近期遇到选择时，先列出两个最现实的选项和各自代价，不要同时开太多分支。",
  },
  {
    name: "水",
    patterns: [/水|河|湖|海|洪水|下雨|雨水|游泳|溺水|淹没|波浪/],
    folk: "水在民俗里常连到财、情绪、流动和人际往来；水清多顺，水浊多乱。",
    reality: "现实映射是情绪流动、关系变化、压力波动，或对金钱与资源流向的敏感。",
    meaning: "水多和情绪、流动、财气与人际变化相关。清水偏向情绪疏通，浑水偏向心绪混乱；洪水、溺水则提示情绪量过大或被外部节奏裹挟。",
    reminder: "近期适合减少情绪硬扛，把担忧写下来，分清哪些能行动、哪些只能等待。",
  },
  {
    name: "火",
    patterns: [/火|着火|火灾|燃烧|爆炸|烟|烧起来/],
    folk: "火象征阳气、势头、名声和冲动；火旺则事急，火乱则易伤和气。",
    reality: "现实映射多是情绪升温、关系摩擦、项目推进太急，或内在动力很强但缺少控制。",
    meaning: "火象征能量、冲突、欲望与急迫感。温暖的火偏向动力与热情，失控的火则多指情绪上头、关系摩擦或事情推进过猛。",
    reminder: "做决定前给自己留一个冷却时间，尤其避免在愤怒或兴奋时马上承诺。",
  },
  {
    name: "蛇",
    patterns: [/蛇|蟒|毒蛇|被蛇咬/],
    folk: "蛇在民俗里有灵动、隐秘、变化、诱惑与小人防范等多重象征。",
    reality: "现实映射常是你对某个人或某件事很敏感，既好奇又戒备，或正在面对不易明说的变化。",
    meaning: "蛇在民俗里常有变化、隐忧、诱惑与敏感直觉的含义。被蛇追或咬，常表示你对某个人、某件事有防备感；看到蛇但不害怕，则可能是对变化的适应。",
    reminder: "近期留意边界感，不必过度猜疑，但重要合作和金钱往来要说清楚。",
  },
  {
    name: "掉牙",
    patterns: [/掉牙|牙掉|牙齿掉|牙碎|牙疼|牙松/],
    folk: "牙在传统象征里连到亲族、根基、口舌与元气，掉牙常被视作对根基不稳的担心。",
    reality: "现实映射更多是形象焦虑、表达不畅、对家人的担心，或真实口腔/睡眠压力带来的梦境。",
    meaning: "掉牙常见于焦虑、形象压力、表达受阻或对家人健康的担心。民俗上也常把牙与亲族、根基相连，但不应直接断为凶兆。",
    reminder: "近期注意表达方式和休息；若现实确有口腔不适，按现实健康问题处理。",
  },
  {
    name: "考试",
    patterns: [/考试|考场|试卷|迟到|交卷|不会做|学校|上课|老师/],
    folk: "考试象征关卡、名次、文书与被检验，常见于运势要过一关的梦象表达。",
    reality: "现实映射多是汇报、面试、绩效、资格、学业或任何让你感觉被打分的场景。",
    meaning: "考试梦多和被评价、怕准备不足、职业或学业压力有关。即使已经离开校园，也常在面临考核、面试、汇报时出现。",
    reminder: "把近期要面对的评价场景提前演练一次，准备比反复担心更有用。",
  },
  {
    name: "飞行",
    patterns: [/飞|飞起来|飞行|飘起来|腾空|会飞/],
    folk: "飞行在传统象征里有上升、脱困、远行和心气打开的意味。",
    reality: "现实映射是想突破限制、争取自由，或对新计划有期待但仍需落地。",
    meaning: "飞行多象征自由感、摆脱限制和掌控欲。飞得稳通常表示状态打开；飞不高或害怕掉下去，则说明想突破但信心还不够扎实。",
    reminder: "适合推进一个新计划，但要给计划加上落地步骤，不只停在想象。",
  },
  {
    name: "坠落",
    patterns: [/坠落|掉下去|摔下去|从高处掉|跌落|失重/],
    folk: "坠落象征气势下沉、立足不稳或从高处回落，提醒稳住根基。",
    reality: "现实映射多是担心失控、怕失败、怕期待落空，或睡眠中身体放松引发的坠落感。",
    meaning: "坠落常和失控感、安全感下降、担心失败有关。它通常是压力信号，不是现实会发生事故的预告。",
    reminder: "近期先稳住睡眠和节奏，重大事项尽量用清单确认，减少临场失控。",
  },
  {
    name: "故人",
    patterns: [/故人|去世|死去|亡故|过世|已故|亲人|爷爷|奶奶|外公|外婆/],
    folk: "故人入梦常被视作思念、托梦、祖辈记忆或旧缘未尽的象征。",
    reality: "现实映射多是怀念、遗憾、近期触景生情，或你正在借旧关系理解现在的处境。",
    meaning: "梦见故人多和怀念、未说完的话、家族记忆或近期触景生情有关。若梦里气氛平和，更多是情感整理；若很悲伤，说明这部分情绪仍需要安放。",
    reminder: "可以用写信、祭扫、整理照片等方式完成一次温和的告别或纪念。",
  },
  {
    name: "钱财",
    patterns: [/钱|钞票|现金|捡钱|丢钱|钱包|中奖|发财|金子|黄金|珠宝/],
    folk: "钱财在民俗象征里既代表财气，也代表交换、亏欠、机会和资源进出。",
    reality: "现实映射多是对收入、预算、合同、账户、安全感和个人价值的关注。",
    meaning: "钱财梦常围绕资源、安全感、价值感和得失感。捡钱偏向机会感，丢钱偏向担心损失；被人抢走则常见于对资源被占用的不安。",
    reminder: "近期适合检查预算、合同、分账和重要账户，不必恐慌，但要把账目理清。",
  },
  {
    name: "哭泣",
    patterns: [/哭|大哭|流泪|痛哭|伤心|难过/],
    folk: "哭在一些民俗说法里有情绪转化、郁气外泄的意味，不一定代表坏事。",
    reality: "现实映射多是委屈、疲惫、想念或长期压住的感受需要出口。",
    meaning: "梦里哭泣常是情绪释放。现实中压住的委屈、疲惫或想念，可能在梦里找到出口。",
    reminder: "给情绪留一点表达空间，必要时和可信任的人说清楚你的真实感受。",
  },
  {
    name: "血",
    patterns: [/血|流血|出血|血迹|伤口/],
    folk: "血象征生命力、损耗、代价和冲突痕迹，也可指事情触及根本利益。",
    reality: "现实映射多是身体关注、精力消耗、关系伤痕或对代价的敏感。",
    meaning: "血常象征生命力、损耗、冲突后的痕迹或对身体状态的关注。梦见血不等于凶兆，更多是在提醒你注意消耗与边界。",
    reminder: "近期减少过度透支；若现实有身体不适，以医学检查为准。",
  },
  {
    name: "婚礼",
    patterns: [/结婚|婚礼|新娘|新郎|婚纱|订婚/],
    folk: "婚礼象征合、约、礼成与身份转换，并不只指真实婚姻。",
    reality: "现实映射多是关系承诺、合作绑定、角色变化，或对责任边界的担心。",
    meaning: "婚礼梦不一定指真实婚姻，常象征关系承诺、身份转换或两件事的结合。若梦里焦虑，可能代表你对责任或绑定关系仍有顾虑。",
    reminder: "近期涉及承诺、合作或关系升级时，先把责任边界谈清楚。",
  },
  {
    name: "死亡",
    patterns: [/死亡|死了|死人|葬礼|棺材|坟墓/],
    folk: "死亡梦在象征里常代表旧阶段结束、去旧迎新、气数转换，不宜直接断凶。",
    reality: "现实映射多是关系、习惯、身份或某个计划正在结束，你需要重新定位。",
    meaning: "死亡梦在象征层面常代表结束、告别、阶段转换，不宜直接理解为现实凶兆。它可能是在提示某种旧模式该收尾了。",
    reminder: "看看近期是否有需要结束的习惯、关系模式或拖延事项，温和处理即可。",
  },
];

const EMOTION_RULES: DreamRule[] = [
  {
    name: "恐惧",
    patterns: [/害怕|恐惧|惊恐|吓醒|可怕|紧张|心慌/],
    folk: "恐惧说明梦中气场偏紧，象征心神不安、避险本能被唤起。",
    reality: "现实映射是安全感不足、压力过载，或身体在睡眠中仍处于警觉状态。",
    meaning: "梦中恐惧说明这段梦的核心更偏向压力和安全感，而不是单纯事件本身。",
    reminder: "醒后先稳定身体感受，避免立刻把梦当成现实判断。",
  },
  {
    name: "愤怒",
    patterns: [/生气|愤怒|吵架|争吵|打架|委屈/],
    folk: "愤怒与争吵象征口舌、边界碰撞和气不顺。",
    reality: "现实映射是你对某段关系、安排或责任分配有不满，但可能没有充分表达。",
    meaning: "愤怒类情绪多提示边界被碰触、话没有说出口，或现实中有不公平感。",
    reminder: "适合把不满写成具体事实，再决定是否沟通。",
  },
  {
    name: "轻松",
    patterns: [/开心|高兴|轻松|舒服|安心|平静/],
    folk: "轻松平和的梦象多代表气顺、心安、阻滞感下降。",
    reality: "现实映射是你对某个变化已有接受度，或睡眠正在完成情绪修复。",
    meaning: "轻松感通常表示梦在帮你完成情绪修复，或你对某个变化已有接受度。",
    reminder: "可以顺着这种状态推进一件小事，巩固现实里的稳定感。",
  },
];

function uniqueMatches(dream: string, rules: DreamRule[]): DreamRule[] {
  return rules.filter((r) => r.patterns.some((p) => p.test(dream)));
}

function pickTheme(symbols: DreamRule[], emotions: DreamRule[]): string {
  if (symbols.some((s) => ["追赶", "迷路与出口", "坠落"].includes(s.name))) return "压力与方向感";
  if (symbols.some((s) => ["钱财", "婚礼", "考试"].includes(s.name))) return "现实责任与得失";
  if (symbols.some((s) => ["故人", "死亡", "哭泣"].includes(s.name))) return "告别、怀念与情绪整理";
  if (emotions.some((e) => e.name === "恐惧")) return "安全感与焦虑释放";
  if (symbols.length > 0) return "象征意象与近期状态";
  return "近期情绪整理";
}

function names(items: DreamRule[]): string {
  return items.map((x) => x.name).join(" + ");
}

function buildOneLine(theme: string, symbols: DreamRule[], emotions: DreamRule[]): string {
  const has = (name: string) => symbols.some((s) => s.name === name);
  if (has("追赶") && has("房子") && has("迷路与出口")) {
    return "这个梦偏向“压力逼近，想寻找安全位置，但暂时缺少清晰出口”。";
  }
  if (has("钱财")) {
    return "这个梦偏向“资源得失与安全感波动”，重点不在钱本身，而在你对机会、损失和掌控感的敏感。";
  }
  if (has("考试")) {
    return "这个梦偏向“被评价与准备不足感”，像是在提醒你某个现实关卡需要更明确的准备。";
  }
  if (has("故人") || has("死亡")) {
    return "这个梦偏向“旧事收束与情绪安放”，更像一次内在整理，不宜直接按凶吉理解。";
  }
  if (emotions.some((e) => e.name === "恐惧")) {
    return `这个梦偏向“${theme}”，核心是安全感被触动，而不是单个画面本身。`;
  }
  if (symbols.length) return `这个梦偏向“${theme}”，关键要看 ${names(symbols.slice(0, 3))} 这些意象如何连在一起。`;
  return "这个梦没有明显强意象，更像近期记忆、情绪和生活片段的混合整理。";
}

function buildCombination(symbols: DreamRule[], emotions: DreamRule[]): string {
  const has = (name: string) => symbols.some((s) => s.name === name);
  const emotionText = emotions.length ? `，再叠加“${names(emotions)}”的情绪底色` : "";
  if (has("追赶") && has("房子") && has("迷路与出口")) {
    return `“追赶 + 房子 + 找不到出口”是一组比较完整的压力梦结构：外部压力在逼近，你本能地想退回一个更安全的空间，但进入房子后仍找不到出口，说明你不是没有安全需求，而是当前的解决路径、边界或下一步选择还不清楚${emotionText}。`;
  }
  if (has("水") && has("房子")) {
    return `“水 + 房子”通常表示情绪或外部变化进入了你的私人空间。若水势大，说明压力已经影响安全感；若水清且平稳，则更像情绪流动后带来的调整。`;
  }
  if (has("火") && has("房子")) {
    return `“火 + 房子”多指家庭、私人边界或内在状态被急躁能量点燃。它更像提醒你处理冲突温度，而不是预示现实火灾。`;
  }
  if (has("钱财")) {
    return `钱财意象与“担心被拿走、丢失、抢走”等情节连在一起时，重点会落在资源归属和得失感；如果是捡到、收到、中奖，则更偏机会感，但也伴随对能否守住的焦虑${emotionText}。`;
  }
  if (symbols.length >= 2) {
    return `这组梦的关键不是单独解释某一个物品，而是“${names(symbols.slice(0, 4))}”共同形成的链条：前面的意象指出触发点，后面的意象显示你的应对方式和卡住的位置${emotionText}。`;
  }
  if (symbols.length === 1) {
    return `这个梦目前主要围绕“${symbols[0].name}”展开，组合信息不多，因此解释应以该意象的象征含义为主，再参考醒后的情绪强度。`;
  }
  return "这个梦未命中明确组合，建议按“场景在哪里、出现了谁、你做了什么、醒来是什么情绪”四条线来读。场景看处境，人物看关系，动作看应对，情绪看真正的压力点。";
}

function buildFolk(symbols: DreamRule[]): string[] {
  if (!symbols.length) {
    return [
      "未命中明确民俗意象时，不建议硬套吉凶。可先看梦中物件的状态：明亮多主清晰，混乱多主心绪杂；打开多主转机，封闭多主阻滞。",
    ];
  }
  return symbols.slice(0, 4).map((s) => `- **${s.name}**：${s.folk}`);
}

function buildReality(symbols: DreamRule[], emotions: DreamRule[]): string[] {
  const lines = symbols.slice(0, 4).map((s) => `- **${s.name}**：${s.reality}`);
  for (const e of emotions.slice(0, 2)) lines.push(`- **${e.name}**：${e.reality}`);
  if (!lines.length) {
    lines.push(
      "- **场景**：对应你近期所处环境或内心处境。",
      "- **人物**：对应关系、责任或某类未完成对话。",
      "- **动作**：对应你现实里的应对模式，是靠近、逃离、等待还是寻找。",
      "- **情绪**：醒后最强的感觉，通常是理解这场梦的入口。"
    );
  }
  return lines;
}

export function interpretStandaloneDream(dreamInput: string): string {
  const dream = dreamInput.trim().replace(/\r\n/g, "\n");
  const symbols = uniqueMatches(dream, RULES).slice(0, 5);
  const emotions = uniqueMatches(dream, EMOTION_RULES).slice(0, 2);
  const theme = pickTheme(symbols, emotions);
  const main = symbols[0];

  const lines: string[] = [
    `> 仅供文化娱乐参考；梦境解释不是医学、心理诊断，也不作为现实决策依据。`,
    "",
    "### 一句话判断",
    "",
    buildOneLine(theme, symbols, emotions),
    "",
    `### 核心主题：${theme}`,
    "",
  ];

  if (main) {
    lines.push(
      `这段梦最主要的意象是**${main.name}**。${main.meaning}`,
      "",
      "### 命中的关键意象",
      ""
    );
    for (const item of symbols) {
      lines.push(`- **${item.name}**：${item.meaning}`);
    }
  } else {
    lines.push(
      "这段梦没有命中强规则意象，整体更适合按近期情绪和生活压力来理解。梦里的场景、人物与动作可视为日间记忆的重组，不宜强行断吉凶。",
      "",
      "### 通用象征",
      "",
      "- **场景变化**：多和近期节奏、环境或人际状态变化有关。",
      "- **人物出现**：常代表你对某类关系、责任或未完成对话的联想。",
      "- **醒后印象**：醒来后最强的感觉，通常比梦里具体物品更重要。"
    );
  }

  lines.push("", "### 组合解释", "", buildCombination(symbols, emotions));

  lines.push("", "### 民俗象征", "", ...buildFolk(symbols));

  lines.push("", "### 现实映射", "", ...buildReality(symbols, emotions));

  if (emotions.length) {
    lines.push("", "### 情绪线索", "");
    for (const item of emotions) {
      lines.push(`- **${item.name}**：${item.meaning}`);
    }
  }

  lines.push("", "### 近期提醒", "");
  const reminders = [...symbols, ...emotions].map((x) => x.reminder);
  const picked = reminders.length ? reminders.slice(0, 4) : ["先记录醒来后的第一情绪，再回看近期是否有压力、关系或睡眠节奏变化。"];
  for (const r of picked) lines.push(`- ${r}`);

  lines.push(
    "",
    "### 不确定说明",
    "",
    "同一个梦可能有多种解释。本结果按梦境文本中的关键词做本地规则匹配；如果你补充更多细节，命中的意象和解释也可能变化。"
  );

  return lines.join("\n");
}
