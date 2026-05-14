export type StockNewsSentiment = "利好" | "利空" | "中性";

export type StockHotNewsItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  summary: string;
  tags: string[];
  sentiment: StockNewsSentiment;
  importance_score: number;
  importance_level: "高" | "中" | "低";
  importance_reason: string;
};

type RawRssItem = Omit<StockHotNewsItem, "id" | "tags" | "sentiment" | "importance_score" | "importance_level" | "importance_reason">;

/** 须为 RSS/Atom 且正文含标准 <item>…</item>；HTML 列表页或已下线地址会导致 0 条。 */
const DEFAULT_FEEDS = [
  { name: "华尔街见闻", url: "https://dedicated.wallstreetcn.com/rss.xml" },
  { name: "中新网财经", url: "https://www.chinanews.com.cn/rss/finance.xml" },
];

const RSS_FETCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 astrologer-stock-news/1.1";

const TAG_RULES: Array<{ tag: string; patterns: RegExp[] }> = [
  { tag: "CPO", patterns: [/CPO|共封装光学|硅光|光引擎/] },
  { tag: "光模块", patterns: [/光模块|光通信|800G|1\.6T|高速光模块|光器件|光芯片/] },
  { tag: "GPU", patterns: [/GPU|英伟达|NVIDIA|算力芯片|AI芯片|加速卡/] },
  { tag: "算力", patterns: [/算力|智算|算力中心|算力租赁|液冷|服务器/] },
  { tag: "数据中心", patterns: [/数据中心|IDC|机房|云计算|云厂商/] },
  { tag: "HBM", patterns: [/HBM|高带宽内存|存储芯片|DRAM/] },
  { tag: "先进封装", patterns: [/先进封装|Chiplet|CoWoS|封装基板|ABF/] },
  { tag: "机器人", patterns: [/机器人|人形机器人|减速器|伺服|灵巧手|机器视觉/] },
  { tag: "低空经济", patterns: [/低空经济|eVTOL|无人机|飞行汽车|通航/] },
  { tag: "商业航天", patterns: [/商业航天|卫星互联网|火箭|卫星|星链/] },
  { tag: "AI", patterns: [/AI|人工智能|大模型|算力|机器人|智能驾驶/] },
  { tag: "半导体", patterns: [/半导体|芯片|晶圆|封测|光刻|存储|英伟达|GPU/] },
  { tag: "新能源", patterns: [/新能源|锂电|光伏|储能|风电|电池|逆变器/] },
  { tag: "汽车", patterns: [/汽车|整车|新能源车|智能车|车企|无人驾驶/] },
  { tag: "医药", patterns: [/医药|创新药|医疗|医保|CXO|疫苗|中药/] },
  { tag: "消费", patterns: [/消费|白酒|食品|饮料|旅游|酒店|零售/] },
  { tag: "地产", patterns: [/地产|房地产|楼市|房企|物业/] },
  { tag: "银行", patterns: [/银行|券商|保险|金融|降息|信贷/] },
  { tag: "军工", patterns: [/军工|航天|航空|卫星|低空经济/] },
  { tag: "有色", patterns: [/有色|黄金|铜|铝|稀土|锂矿|贵金属/] },
  { tag: "宏观", patterns: [/央行|美联储|降息|加息|CPI|PMI|关税|汇率|经济数据/] },
  { tag: "A股", patterns: [/A股|沪指|深成指|创业板|北交所|涨停|板块/] },
];

const GOOD_PATTERNS =
  /走强|上涨|大涨|涨超|涨幅|拉升|反弹|利好|突破|升温|增长|创新高|新高|回暖|获批|中标|增持|回购|买入机会|黄金时代|表现强劲|景气|订单|需求持续|超预期|上调|看多|受益|rally|surge|soar|jump|gains?|beat(?:s)? expectations?|upgraded?|bullish|outperform/i;
const BAD_PATTERNS =
  /下跌|回落|大跌|跌超|跌幅|跳水|利空|承压|亏损|减持|监管|处罚|风险|暴雷|退市|下调|卖出|看空|低迷|不及预期|压力|担忧|拖累|plunge|slump|tumble|selloff|sell-off|miss(?:es)? expectations?|downgraded?|bearish|probe|investigation|lawsuit|fraud/i;
const HIGH_IMPACT_PATTERNS = /政策|央行|美联储|降息|加息|关税|监管|国务院|证监会|财政部|经济数据|PMI|CPI|沪指|A股|创业板|北交所/;
const MARKET_MOVE_PATTERNS = /涨停|跌停|大涨|大跌|跳水|拉升|走强|回落|反弹|突破|创新高|承压/;
const HOT_TAGS = new Set(["CPO", "光模块", "GPU", "算力", "数据中心", "机器人", "低空经济", "AI", "半导体", "新能源", "宏观", "A股"]);

function decodeEntities(input: string): string {
  return String(input || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripHtml(input: string): string {
  return decodeEntities(String(input || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** 摘要专用：将常见块级/换行标签转为换行，再剥标签，避免展开后一整段无分段。 */
function stripHtmlPreserveParagraphs(input: string): string {
  const withBreaks = String(input || "")
    .replace(/\r\n/g, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|h[1-6]|section|article|blockquote)\s*>/gi, "\n");
  const noTags = decodeEntities(withBreaks.replace(/<[^>]*>/g, " "));
  return noTags
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

function readTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  if (!m) return "";
  const raw = m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
  return stripHtml(raw);
}

function readItemSummary(block: string): string {
  const reDesc = /<description(?:\s[^>]*)?>([\s\S]*?)<\/description>/i;
  const reSum = /<summary(?:\s[^>]*)?>([\s\S]*?)<\/summary>/i;
  const m = block.match(reDesc) || block.match(reSum);
  if (!m) return "";
  const raw = m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
  return stripHtmlPreserveParagraphs(raw);
}

/** RSS2 的 <link>https://…</link>，或 Atom 的 <link href="…" />，或可用作链接的 <guid> */
function readItemUrl(block: string): string {
  const inner = readTag(block, "link").trim();
  if (/^https?:\/\//i.test(inner)) return inner;
  const hrefM = block.match(/<link[^>]+href\s*=\s*["']([^"']+)["'][^>]*\/?>/i);
  if (hrefM?.[1]) {
    const u = String(hrefM[1]).trim();
    if (/^https?:\/\//i.test(u)) return u;
  }
  const guid = readTag(block, "guid").trim();
  if (/^https?:\/\//i.test(guid)) return guid;
  return "";
}

export function parseRssItems(xml: string, source: string): RawRssItem[] {
  const blocks = String(xml || "").match(/<item[\s\S]*?<\/item>/gi) || [];
  return blocks
    .map((block) => {
      const title = readTag(block, "title");
      const url = readItemUrl(block);
      const pub =
        readTag(block, "pubDate") ||
        readTag(block, "published") ||
        readTag(block, "updated") ||
        readTag(block, "dc:date");
      const summary = readItemSummary(block);
      if (!title || !url) return null;
      const d = pub ? new Date(pub) : new Date();
      return {
        title,
        url,
        source,
        published_at: Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString(),
        summary,
      };
    })
    .filter((x): x is RawRssItem => Boolean(x));
}

export function tagStockNewsItem(item: RawRssItem): StockHotNewsItem {
  const text = `${item.title} ${item.summary}`;
  const tags = TAG_RULES.filter((r) => r.patterns.some((p) => p.test(text))).map((r) => r.tag);
  const sentiment = scoreSentiment(text);
  const importance = scoreImportance(text, tags, sentiment);
  return {
    ...item,
    id: cryptoHash(`${item.source}|${item.url}|${item.title}`),
    tags: tags.length ? tags.slice(0, 5) : ["市场"],
    sentiment,
    ...importance,
  };
}

function matchCount(text: string, pattern: RegExp): number {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  return text.match(re)?.length ?? 0;
}

function scoreSentiment(text: string): StockNewsSentiment {
  const goodScore = matchCount(text, GOOD_PATTERNS);
  const badScore = matchCount(text, BAD_PATTERNS);
  if (goodScore >= badScore + 1) return "利好";
  if (badScore >= goodScore + 1) return "利空";
  return "中性";
}

function scoreImportance(text: string, tags: string[], sentiment: StockNewsSentiment): Pick<StockHotNewsItem, "importance_score" | "importance_level" | "importance_reason"> {
  let score = 20;
  const reasons: string[] = [];
  if (HIGH_IMPACT_PATTERNS.test(text)) {
    score += 28;
    reasons.push("宏观/政策/指数");
  }
  if (MARKET_MOVE_PATTERNS.test(text)) {
    score += 22;
    reasons.push("影响词");
  }
  const hotCount = tags.filter((t) => HOT_TAGS.has(t)).length;
  if (hotCount > 0) {
    score += 16 + Math.min(12, (hotCount - 1) * 6);
    reasons.push("热门行业");
  }
  if (tags.length >= 2) {
    score += 10;
    reasons.push("多主题");
  }
  if (sentiment === "利空") {
    score += 8;
    reasons.push("负面风险");
  }
  if (/独家|突发|重磅|快讯|紧急|首次|超预期/.test(text)) {
    score += 14;
    reasons.push("强提示词");
  }
  const finalScore = Math.max(0, Math.min(100, score));
  const importance_level = finalScore >= 70 ? "高" : finalScore >= 45 ? "中" : "低";
  return {
    importance_score: finalScore,
    importance_level,
    importance_reason: reasons.length ? reasons.join("、") : "普通资讯",
  };
}

function cryptoHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function parseFeedsFromEnv(raw: string): Array<{ name: string; url: string }> | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const out: Array<{ name: string; url: string }> = [];
  const segments = s
    .split(/[,\n]/g)
    .map((x) => x.trim())
    .filter(Boolean);
  for (const seg of segments) {
    if (seg.includes("|")) {
      const [name, ...rest] = seg.split("|");
      const url = rest.join("|").trim();
      if (name?.trim() && url) out.push({ name: name.trim(), url });
      continue;
    }
    if (/^https?:\/\//i.test(seg)) {
      try {
        const host = new URL(seg).hostname.replace(/^www\./, "") || "RSS";
        out.push({ name: host, url: seg });
      } catch {
        // skip invalid URL
      }
    }
  }
  return out.length ? out : null;
}

function configuredFeeds(): Array<{ name: string; url: string }> {
  const parsed = parseFeedsFromEnv(process.env.STOCK_NEWS_FEEDS || "");
  return parsed ?? DEFAULT_FEEDS;
}

export async function fetchStockHotNews(limit = 30): Promise<{
  items: StockHotNewsItem[];
  fetched_at: string;
  sources: string[];
  diagnostics: Array<{ source: string; ok: boolean; count: number; error?: string }>;
}> {
  const feeds = configuredFeeds();
  const settled = await Promise.allSettled(
    feeds.map(async (feed) => {
      const res = await fetch(feed.url, {
        redirect: "follow",
        headers: {
          "User-Agent": RSS_FETCH_UA,
          Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5",
        },
      });
      if (!res.ok) throw new Error(`feed_failed:${feed.name}:${res.status}`);
      const text = await res.text();
      return parseRssItems(text, feed.name).map(tagStockNewsItem);
    })
  );
  const diagnostics = settled.map((r, idx) => {
    const source = feeds[idx]?.name || `source_${idx + 1}`;
    if (r.status === "fulfilled") return { source, ok: true, count: r.value.length };
    return { source, ok: false, count: 0, error: String(r.reason?.message || r.reason || "fetch_failed").slice(0, 160) };
  });
  const items = settled
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => b.importance_score - a.importance_score || Date.parse(b.published_at) - Date.parse(a.published_at))
    .slice(0, Math.max(1, Math.min(100, limit)));
  return { items, fetched_at: new Date().toISOString(), sources: feeds.map((f) => f.name), diagnostics };
}
