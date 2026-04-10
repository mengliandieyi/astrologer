import type { Express } from "express";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { qwenChatCompletion } from "../lib/aiClient.js";
import { getAmapForecast4d, getAmapLiveWeather, getAmapWeatherForTrip } from "../lib/amapWeather.js";

type CacheEntry<T> = { at: number; v: T };
const aiCache = new Map<string, CacheEntry<string>>();
const AI_CACHE_TTL_MS = 5 * 60_000;
function nowMs() {
  return Date.now();
}
function cacheGet(key: string): string | null {
  const e = aiCache.get(key);
  if (!e) return null;
  if (nowMs() - e.at > AI_CACHE_TTL_MS) {
    aiCache.delete(key);
    return null;
  }
  return e.v;
}
function cacheSet(key: string, v: string) {
  aiCache.set(key, { at: nowMs(), v });
  // bound memory
  if (aiCache.size > 200) {
    const keys = Array.from(aiCache.keys());
    for (let i = 0; i < 50; i++) aiCache.delete(keys[i]);
  }
}

type TravelRecommendRequest = {
  start_date: string;
  end_date: string;
  budget?: string;
  people?: number;
  preferences?: string[];
  departure?: string;
  /** 用户指定的酒店集团/品牌偏好（中文描述，可为空表示不限） */
  hotel_brand?: string;
  /** 推荐目的地数量：1~8，默认 6 */
  count?: number;
  /** 目的地范围：domestic 国内优先；overseas 国外优先；any 不限 */
  destination_scope?: "domestic" | "overseas" | "any";
  /** 周边游：优先推荐离出发地近的城市（需要 departure），默认 false */
  nearby_destinations?: boolean;
  /** 若开启周边游：只推荐非省内（跨省），默认 false */
  out_of_province_only?: boolean;
};

type Destination = {
  name: string;
  region: string;
  intro: string;
  weather: string;
  budget: string;
  reason: string;
  /** 从用户出发地到该目的地的大致交通与耗时（有出发地时必填） */
  transit_from_departure?: string;
  image_url?: string;
};

type TravelPlanRequest = {
  destination: string;
  start_date: string;
  end_date: string;
  budget?: string;
  people?: number;
  preferences?: string[];
  departure?: string;
  hotel_brand?: string;
  /** 是否全程住同一个地方（同一酒店/同一区域），默认 false */
  same_stay?: boolean;
  /** 是否优先住在当日主要景点附近（就近住宿），默认 false */
  stay_nearby_spots?: boolean;
  /** 是否偏好周边游（少折腾、景点更集中），默认 false */
  nearby_play?: boolean;
};

type StayRecommendation =
  | string
  | {
      name: string;
      area: string;
      /** 参考价：请明确币种与“每晚” */
      price_per_night_range: string;
      /** 用于生成图片的搜索关键词 */
      image_query: string;
      /** 服务端补全：通用图片 URL */
      image?: string;
      /** 给用户去平台检索用的关键词（避免虚构具体分店） */
      search_query?: string;
      /** 高德 POI id（可用于核验） */
      poi_id?: string;
      /** 酒店地址（可用于核验） */
      address?: string;
      /** 经纬度 "lng,lat"（可用于核验） */
      location?: string;
    };

function normalizeBrandToken(s: string): string {
  return String(s || "").trim();
}

function stayMatchesBrand(stayName: string, brandPref: string): boolean {
  const n = normalizeBrandToken(stayName);
  const b = normalizeBrandToken(brandPref);
  if (!n || !b) return true;
  // brandPref 可能是 “万豪系（…）”，取括号前的主 token
  const main = b.split("（")[0].trim();
  if (!main) return true;
  return n.includes(main);
}

const amapPoiCache = new Map<string, { name: string; poi_id?: string; address?: string; location?: string }>();
function ensureBrandInKeywords(keywords: string, brandToken?: string): string {
  const brand = String(brandToken || "").trim();
  if (!brand) return keywords;
  const k = String(keywords || "").trim();
  if (!k) return brand;
  return k.includes(brand) ? k : `${brand} ${k}`;
}

async function searchAmapHotelPoi(params: {
  city?: string;
  keywords: string;
  brandToken?: string;
}): Promise<{ name: string; poi_id?: string; address?: string; location?: string } | null> {
  const key = String(process.env.AMAP_WEB_KEY || "").trim();
  if (!key) return null;
  const keywords = String(params.keywords || "").trim();
  if (!keywords) return null;
  const k0 = ensureBrandInKeywords(keywords, params.brandToken);
  const cacheKey = `${params.city || ""}\u0000${k0}`;
  const cached = amapPoiCache.get(cacheKey);
  if (cached) return cached;

  const doSearch = async (opts: { city?: string; keywords: string }) => {
    const url = new URL("https://restapi.amap.com/v3/place/text");
    url.searchParams.set("key", key);
    url.searchParams.set("keywords", opts.keywords);
    url.searchParams.set("offset", "10");
    url.searchParams.set("page", "1");
    url.searchParams.set("extensions", "base");
    // 尽量收敛为“住宿服务”
    url.searchParams.set("types", "住宿服务");
    if (opts.city) url.searchParams.set("city", opts.city);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4500);
    const res = await fetch(url, { method: "GET", signal: ctrl.signal }).finally(() => clearTimeout(t));
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const pois = Array.isArray(json?.pois) ? json.pois : [];
    return pois;
  };

  try {
    // 1) 优先：带 city 的品牌强化关键词
    let pois = await doSearch({ city: params.city, keywords: k0 });
    if (!pois.length) return null;

    const brand = String(params.brandToken || "").trim();
    let p = !brand ? pois[0] : pois.find((x: any) => String(x?.name || "").includes(brand));

    // 2) 若指定品牌但未命中：放宽到不传 city（避免“城市限定”导致品牌 POI 被漏掉）
    if (brand && !p) {
      const pois2 = await doSearch({ city: undefined, keywords: k0 });
      if (pois2 && pois2.length) {
        p = pois2.find((x: any) => String(x?.name || "").includes(brand)) || null;
        if (!p) pois = pois2;
      }
    }

    // 3) 仍未命中：回落到第一条（但上层会在 UI 展示 search_query 供你复核）
    if (!p) p = pois[0];
    if (!p || !p.name) return null;
    const out = {
      name: String(p.name),
      poi_id: typeof p.id === "string" ? p.id : undefined,
      address: [p.adname, p.address].filter(Boolean).join(" ").trim() || undefined,
      location: typeof p.location === "string" ? p.location : undefined,
    };
    amapPoiCache.set(cacheKey, out);
    return out;
  } catch {
    return null;
  }
}

type DayItinerary = {
  day: number;
  date: string;
  /** 当天天气（可选）：如 晴 15-22℃ */ 
  weather?: string;
  spots: Array<{
    name: string;
    duration: string;
    intro: string;
    /** 建议时间段（可选）：如 09:30-11:00 */
    time?: string;
    level?: string;  // 景区级别：5A/4A/3A
    ticket?: string; // 门票价格
    type?: string;   // 景区类型：自然景观/人文古迹/主题乐园/海滨沙滩/古镇村落
    image?: string;  // 景点图片
    /** 前往下一站的交通建议（可选；最后一站可省略） */
    to_next?: {
      mode: string; // 步行/打车/地铁/公交/自驾/高铁/轮渡 等
      duration: string; // 如 15分钟 / 1小时20分钟
      note?: string; // 可选：上车点/建议路线/避堵提示
    };
  }>;
  meals: Array<{
    /** 午餐/晚餐（可选包含早餐/下午茶） */
    type: string;
    /** 建议时间（可选）：如 12:10 */
    time?: string;
    suggestion: string;
    cost: string;
  }>;
  stay: StayRecommendation;
  tips: string;
};

type TravelPlan = {
  destination: string;
  summary: string;
  itinerary: DayItinerary[];
  budget: {
    total: string;
    transport: string;
    accommodation: string;
    food: string;
    tickets: string;
    other: string;
  };
  packing: string[];
  notes: string[];
};

function clampInt(n: any, min: number, max: number, fallback: number): number {
  const v = Number.parseInt(String(n ?? ""), 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function safeSlug(s: string): string {
  return String(s || "")
    .trim()
    .slice(0, 80)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

const imageCachePath = path.resolve(process.cwd(), "data", "travel-image-cache.json");
let travelImageCache: Record<string, string> | null = null;
function loadImageCache(): Record<string, string> {
  if (travelImageCache) return travelImageCache;
  try {
    const raw = fs.readFileSync(imageCachePath, "utf8");
    travelImageCache = JSON.parse(raw) as Record<string, string>;
  } catch {
    travelImageCache = {};
  }
  return travelImageCache!;
}
function saveImageCache(cache: Record<string, string>) {
  try {
    fs.mkdirSync(path.dirname(imageCachePath), { recursive: true });
    fs.writeFileSync(imageCachePath, JSON.stringify(cache, null, 2), "utf8");
  } catch {
    // ignore cache write failures
  }
}
function getDestinationImageUrl(dest: Destination): string {
  const key = `${dest.name}\u0000${dest.region || ""}`;
  const cache = loadImageCache();
  if (cache[key]) return cache[key]!;
  const q = [dest.name, dest.region, "travel", "landmark"].filter(Boolean).join(" ");
  const url = `https://source.unsplash.com/800x520/?${encodeURIComponent(q)}`;
  cache[key] = url;
  saveImageCache(cache);
  return url;
}

async function tryWikipediaThumb(query: string, lang: "zh" | "en", width: number): Promise<string | null> {
  const base = lang === "zh" ? "https://zh.wikipedia.org/w/api.php" : "https://en.wikipedia.org/w/api.php";
  try {
    const curlJson = (url: string) =>
      new Promise<any>((resolve, reject) => {
        execFile(
          "curl",
          [
            "-sS",
            "--max-time",
            "6",
            "-H",
            "User-Agent: astrologer/1.0 (+local dev)",
            "-H",
            "Accept: application/json",
            url,
          ],
          { maxBuffer: 2 * 1024 * 1024, timeout: 7000 },
          (err, stdout) => {
            if (err) return reject(err);
            try {
              resolve(JSON.parse(String(stdout || "")));
            } catch (e) {
              reject(e);
            }
          }
        );
      });
    const s = new URL(base);
    s.searchParams.set("action", "query");
    s.searchParams.set("list", "search");
    s.searchParams.set("srsearch", query);
    s.searchParams.set("srlimit", "1");
    s.searchParams.set("format", "json");
    // for CORS in browsers; harmless on server-side
    s.searchParams.set("origin", "*");
    const srJson = (await curlJson(s.toString())) as any;
    const title = srJson?.query?.search?.[0]?.title;
    if (!title) return null;

    const p = new URL(base);
    p.searchParams.set("action", "query");
    p.searchParams.set("prop", "pageimages");
    p.searchParams.set("titles", title);
    p.searchParams.set("pithumbsize", String(width));
    p.searchParams.set("format", "json");
    p.searchParams.set("origin", "*");
    const pJson = (await curlJson(p.toString())) as any;
    const pages = pJson?.query?.pages;
    if (!pages || typeof pages !== "object") return null;
    const firstKey = Object.keys(pages)[0];
    const thumb = pages?.[firstKey]?.thumbnail?.source;
    return typeof thumb === "string" && thumb.trim() ? thumb.trim() : null;
  } catch {
    return null;
  }
}

async function getDestinationImageUrlOnline(dest: Destination): Promise<string> {
  const key = `${dest.name}\u0000${dest.region || ""}`;
  const cache = loadImageCache();
  // 若旧缓存是 Unsplash（在国内可能不稳定），尝试升级为 Wikipedia 缩略图
  const cached = cache[key];
  if (typeof cached === "string" && cached.trim()) {
    if (!cached.includes("source.unsplash.com")) return cached;
    const q0 = [dest.name, dest.region].filter(Boolean).join(" ");
    const q = q0 || dest.name;
    const wiki =
      (await tryWikipediaThumb(q, "zh", 900)) ||
      (await tryWikipediaThumb(q, "en", 900)) ||
      null;
    if (wiki) {
      cache[key] = wiki;
      saveImageCache(cache);
      return wiki;
    }
    return cached;
  }

  // 优先走 Wikipedia/Commons 的缩略图（相对在国内更稳定），失败再降级 Unsplash。
  const q0 = [dest.name, dest.region].filter(Boolean).join(" ");
  const q = q0 || dest.name;
  const wiki =
    (await tryWikipediaThumb(q, "zh", 900)) ||
    (await tryWikipediaThumb(q, "en", 900)) ||
    null;

  const fallbackQ = [dest.name, dest.region, "travel", "landmark"].filter(Boolean).join(" ");
  const url = wiki || `https://source.unsplash.com/800x520/?${encodeURIComponent(fallbackQ)}`;
  cache[key] = url;
  saveImageCache(cache);
  return url;
}

function buildRecommendPrompt(req: TravelRecommendRequest): string {
  const days = Math.ceil((new Date(req.end_date).getTime() - new Date(req.start_date).getTime()) / 86400000) + 1;
  const count = clampInt(req.count, 1, 8, 6);
  const scope = req.destination_scope || "domestic";
  const scopeText = scope === "overseas" ? "国外优先（出境目的地）" : scope === "any" ? "不限（国内外都可）" : "国内优先（中国境内）";
  const nearby = Boolean(req.nearby_destinations);
  const departure = String(req.departure || "").trim();
  const outOnly = Boolean(req.out_of_province_only);
  
  return `你是一位专业的旅行规划师。请根据以下信息推荐 ${count} 个旅行目的地：

出行信息：
- 出行日期：${req.start_date} 至 ${req.end_date}（共 ${days} 天）
- 预算范围：${req.budget || "不限"}
- 出行人数：${req.people || 1} 人
- 出发地：${req.departure || "未提供"}
- 偏好：${req.preferences?.join("、") || "无特别偏好"}
- 酒店品牌偏好：${req.hotel_brand?.trim() || "不限"}
- 目的地范围：${scopeText}
- 周边游（离出发地近）：${nearby ? "是" : "否"}
- 只推荐非省内（跨省）：${nearby && outOnly ? "是" : "否"}

请以 JSON 格式返回 ${count} 个推荐目的地，格式如下：
{
  "destinations": [
    {
      "name": "目的地名称",
      "region": "所属省份/地区",
      "intro": "一句话介绍（20字以内）",
      "weather": "出行日期天气概况（一句话写清，例如：晴，15-22℃）",
      "budget": "人均预算估算",
      "reason": "推荐理由（30字以内）",
      "transit_from_departure": "若出发地已提供：从出发地到该地的主要交通方式+大致耗时，如「高铁约3小时」；未提供出发地则填「—」"
    }
  ]
}

注意：
0. 必须严格按“目的地范围”输出：国内优先就以中国境内为主；国外优先就以境外为主；不限则按季节与预算综合选择
1. 根据季节推荐合适的目的地
2. 考虑预算限制
3. 符合用户偏好
4. 若用户指定了酒店品牌偏好，推荐理由中可简要说明该目的地是否有对应集团酒店覆盖（不必编造具体店名）
5. 推荐理由要具体
6. weather 尽量一句话、避免过长；transit_from_departure 要具体可感知（国内常用高铁/飞机/自驾的大致时长）
7. 若“周边游（离出发地近）=是”，则必须满足：
   - 仅在出发地附近推荐（同省/邻省/高铁或自驾 0.5~3 小时可达为主）
   - 不要推荐需要飞机/跨省远途（>4 小时）的目的地
   - transit_from_departure 必须填写且耗时要短（尽量 ≤3 小时）
   - 若未提供出发地，则忽略该约束并在 transit_from_departure 填「—」
8. 若“只推荐非省内（跨省）=是”，则不要推荐与出发地同省的城市

只返回 JSON，不要其他内容。`;
}

function buildRecommendRepairPrompt(req: TravelRecommendRequest, existingNames: string[]): string {
  const days = Math.ceil((new Date(req.end_date).getTime() - new Date(req.start_date).getTime()) / 86400000) + 1;
  const count = clampInt(req.count, 1, 8, 6);
  const scope = req.destination_scope || "domestic";
  const scopeText = scope === "overseas" ? "国外优先（只出境外目的地）" : scope === "any" ? "不限（国内外都可）" : "国内优先（只出中国境内）";
  const outOnly = Boolean(req.out_of_province_only);
  const exclude = existingNames.filter(Boolean).slice(0, 24).join("、") || "（无）";

  return `你是一位专业的旅行规划师。请在以下约束下“补足”旅行目的地推荐。

出行信息：
- 出行日期：${req.start_date} 至 ${req.end_date}（共 ${days} 天）
- 预算范围：${req.budget || "不限"}
- 出行人数：${req.people || 1} 人
- 出发地：${req.departure || "未提供"}
- 偏好：${req.preferences?.join("、") || "无特别偏好"}
- 酒店品牌偏好：${req.hotel_brand?.trim() || "不限"}
- 目的地范围：${scopeText}
- 只推荐非省内（跨省）：${outOnly ? "是" : "否"}

已存在目的地（不要重复）：${exclude}

请再推荐若干个目的地，用于补足到总计 ${count} 个。输出 JSON，格式同之前：
{
  "destinations": [
    {"name":"", "region":"", "intro":"", "weather":"", "budget":"", "reason":"", "transit_from_departure":""}
  ]
}

要求：
1) 必须严格按“目的地范围”输出：国内优先=只中国境内；国外优先=只境外；不限=都可
2) 不要重复“已存在目的地”
3) region 必须具体（省/市/自治区 或 国家/地区）
4) 若“只推荐非省内（跨省）=是”，则不要推荐与出发地同省的城市

只返回 JSON，不要其他内容。`;
}

function buildPlanPrompt(req: TravelPlanRequest): string {
  const days = Math.ceil((new Date(req.end_date).getTime() - new Date(req.start_date).getTime()) / 86400000) + 1;
  
  return `你是一位专业的旅行规划师。请为以下行程生成详细的旅行计划：

目的地：${req.destination}
出行日期：${req.start_date} 至 ${req.end_date}（共 ${days} 天）
预算范围：${req.budget || "不限"}
出行人数：${req.people || 1} 人
出发地：${req.departure || "未提供"}
偏好：${req.preferences?.join("、") || "无特别偏好"}
酒店品牌偏好：${req.hotel_brand?.trim() || "不限"}
住宿策略：${req.same_stay ? "全程住同一个地方（同一酒店/同一区域）" : "可按行程灵活安排"}
住宿位置：${req.stay_nearby_spots ? "尽量住在主要景点附近（就近）" : "不强制就近"}
游玩范围：${req.nearby_play ? "周边游（少折腾）：景点集中、减少跨城与长途奔波" : "不强制周边游"}

请以 JSON 格式返回完整行程，格式如下：
{
  "plan": {
    "destination": "目的地名称",
    "summary": "行程概要",
    "itinerary": [
      {
        "day": 1,
        "date": "日期",
        "spots": [
          {
            "name": "景点名称",
            "duration": "游览时长",
            "intro": "简介",
            "time": "09:30-11:00",
            "level": "5A/4A/3A",
            "ticket": "门票价格",
            "type": "自然景观/人文古迹/主题乐园/海滨沙滩/古镇村落/博物馆/公园",
            "to_next": { "mode": "地铁/打车/步行等", "duration": "15分钟/1小时20分钟", "note": "可选：上车点/避堵提示" }
          }
        ],
        "meals": [
          {"type": "午餐", "time": "12:10", "suggestion": "推荐", "cost": "人均费用"},
          {"type": "晚餐", "time": "18:30", "suggestion": "推荐", "cost": "人均费用"}
        ],
        "stay": {
          "name": "酒店品牌/档次 + 建议区域（不要编造具体分店名，例如写「亚朵酒店（观前街/平江路附近）」）",
          "area": "建议入住区域（如 市中心/地铁口/景区附近）",
          "price_per_night_range": "¥420-620/晚（含税，参考价）",
          "image_query": "用于找图的关键词（可留空）",
          "search_query": "用于在平台检索的关键词（城市 + 品牌 + 区域，如「苏州 亚朵 观前街」）"
        },
        "tips": "当日小贴士"
      }
    ],
    "budget": {
      "total": "总预算",
      "transport": "交通费用",
      "accommodation": "住宿费用",
      "food": "餐饮费用",
      "tickets": "门票费用",
      "other": "其他费用"
    },
    "packing": ["行李物品1", "行李物品2"],
    "notes": ["注意事项1", "注意事项2"]
  }
}

要求：
1. 每天安排 2-4 个景点，不要过于紧凑
2. 景点要具体，使用真实景点名称
3. 标注每个景区的级别（5A/4A/3A）、门票价格、景区类型，并给出当日可执行的时间安排（spots.time、meals.time）
4. 景区类型包括：自然景观、人文古迹、主题乐园、海滨沙滩、古镇村落、博物馆、公园等
5. 考虑景点之间的距离和交通
5.1 每个景点（除当日最后一站外）都尽量补充 to_next，给出到下一站的建议交通方式与预计时长
5.2 若为“周边游”，则每天景点尽量集中在同一片区，减少跨区/跨城长距离移动；相邻景点交通时长尽量控制在 10-30 分钟以内（如不可避免，需说明原因）
6. 餐饮推荐当地特色
7. 住宿推荐合理价位；每日 stay 必须包含 name/area/price_per_night_range/image_query。若用户指定了酒店品牌偏好，stay.name 尽量贴近该品牌体系（或相近档次）；若目的地确实难订该集团，说明替代方案并仍尽量贴近用户偏好。价格必须写“每晚”，并明确是参考价
7.0 重要：stay.search_query 必须给出（城市 + 品牌 + 区域），用于后端调用高德 POI 查询真实酒店名；请尽量写到可检索（例如「苏州 亚朵 观前街」）
7.1 若住宿策略为“全程住同一个地方”，则 itinerary 中所有天的 stay 必须保持一致（同一酒店名/同一区域/同一价格区间），不要每天更换
7.2 若“住宿位置=就近”，stay.area 应贴近当日主要景点（尤其是第 1 个景点），stay.search_query 也应包含该景点或该片区关键词（例如「苏州 亚朵 平江路」）
8. 行李清单根据目的地天气和天数推荐
9. 注意事项包括天气、安全、支付等

只返回 JSON，不要其他内容。`;
}

function parseJsonFromAi<T>(text: string, key: string): T | null {
  try {
    // 尝试直接解析
    const json = JSON.parse(text);
    return json[key] || json;
  } catch {
    // 尝试提取 JSON 块
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const json = JSON.parse(match[0]);
        return json[key] || json;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function registerTravelRoutes(app: Express) {
  // 推荐目的地
  app.post("/api/travel/recommend", async (req, res) => {
    try {
      const t0 = nowMs();
      const body = req.body as TravelRecommendRequest;
      
      if (!body.start_date || !body.end_date) {
        return res.status(400).json({ error: "start_date and end_date are required" });
      }

      const prompt = buildRecommendPrompt(body);
      
      const cacheKey = `travel:recommend:${JSON.stringify(body)}`;
      const cached = cacheGet(cacheKey);
      const tAi0 = nowMs();
      const result = cached
        ? { ok: true as const, text: cached }
        : await qwenChatCompletion({
            messages: [
              { role: "system", content: "你是一位专业的旅行规划师，擅长根据用户需求推荐旅行目的地。" },
              { role: "user", content: prompt },
            ],
          });
      const tAi = nowMs() - tAi0;
      if (!cached && result.ok) cacheSet(cacheKey, result.text);

      if (!result.ok) {
        console.error("AI error:", result.error);
        return res.status(500).json({ error: "AI generation failed", detail: result.error });
      }

      const destinations = parseJsonFromAi<Destination[]>(result.text, "destinations");

      if (!destinations || destinations.length === 0) {
        console.error("Parse error, raw text:", result.text);
        return res.status(500).json({ error: "Failed to parse AI response" });
      }

      const scope = body.destination_scope || "domestic";
      const CHN_KEYS = [
        "中国",
        "北京",
        "上海",
        "天津",
        "重庆",
        "河北",
        "山西",
        "辽宁",
        "吉林",
        "黑龙江",
        "江苏",
        "浙江",
        "安徽",
        "福建",
        "江西",
        "山东",
        "河南",
        "湖北",
        "湖南",
        "广东",
        "海南",
        "四川",
        "贵州",
        "云南",
        "陕西",
        "甘肃",
        "青海",
        "内蒙古",
        "广西",
        "西藏",
        "宁夏",
        "新疆",
        "香港",
        "澳门",
        "台湾",
      ];
      const FOREIGN_KEYS = [
        "日本",
        "韩国",
        "朝鲜",
        "蒙古国",
        "新加坡",
        "马来西亚",
        "泰国",
        "越南",
        "老挝",
        "柬埔寨",
        "缅甸",
        "印度尼西亚",
        "印尼",
        "菲律宾",
        "斯里兰卡",
        "尼泊尔",
        "印度",
        "巴基斯坦",
        "孟加拉",
        "不丹",
        "马尔代夫",
        "阿联酋",
        "迪拜",
        "阿曼",
        "沙特",
        "卡塔尔",
        "科威特",
        "巴林",
        "以色列",
        "巴勒斯坦",
        "伊朗",
        "伊拉克",
        "约旦",
        "黎巴嫩",
        "叙利亚",
        "土耳其",
        "埃及",
        "摩洛哥",
        "突尼斯",
        "南非",
        "肯尼亚",
        "坦桑尼亚",
        "澳大利亚",
        "新西兰",
        "美国",
        "加拿大",
        "墨西哥",
        "巴西",
        "阿根廷",
        "智利",
        "秘鲁",
        "英国",
        "爱尔兰",
        "法国",
        "德国",
        "意大利",
        "西班牙",
        "葡萄牙",
        "荷兰",
        "比利时",
        "瑞士",
        "奥地利",
        "瑞典",
        "挪威",
        "芬兰",
        "丹麦",
        "冰岛",
        "希腊",
        "俄罗斯",
        "乌克兰",
        "波兰",
        "捷克",
        "匈牙利",
      ];
      const looksLikeChinaRegion = (s: string) =>
        /(省|市|自治区|特别行政区|地区|盟|州|县|区|旗)$/.test(s.trim()) || /(省|市|自治区|特别行政区|地区|州|县|区)/.test(s);
      const isLikelyChina = (d: Destination) => {
        const name = String(d.name || "").trim();
        const region = String(d.region || "").trim();
        const s = `${name} ${region}`.trim();
        if (!s) return false;
        // 明确出现境外国家/地区关键词时，判为境外（避免“日本京都府”等被误判为国内）
        // 但若同时包含“中国”，以中国优先（处理“中国香港/中国澳门”等）
        if (!s.includes("中国") && FOREIGN_KEYS.some((k) => s.includes(k))) return false;
        if (CHN_KEYS.some((k) => s.includes(k))) return true;
        if (looksLikeChinaRegion(region)) return true;
        // 很粗的兜底：含大量拉丁字母更像境外
        if (/[A-Za-z]{4,}/.test(s)) return false;
        // 名称/地区都是中文且不含明显国家名时，倾向判为国内（减少“国内筛不出来导致放行”的情况）
        const isMostlyCjk = (x: string) => Boolean(x) && !/[A-Za-z]/.test(x) && /[\u4e00-\u9fff]/.test(x);
        if (isMostlyCjk(name) && isMostlyCjk(region)) return true;
        return false;
      };

      const uniqueByName = (arr: Destination[]) => {
        const seen = new Set<string>();
        const out: Destination[] = [];
        for (const d of arr) {
          const k = String(d?.name || "").trim();
          if (!k || seen.has(k)) continue;
          seen.add(k);
          out.push(d);
        }
        return out;
      };

      let dests = uniqueByName(destinations);
      if (scope === "domestic") dests = dests.filter(isLikelyChina);
      if (scope === "overseas") dests = dests.filter((d) => !isLikelyChina(d));

      // “只推荐非省内（跨省）”：在服务端再做一次硬过滤，避免模型跑偏
      if (body.nearby_destinations && body.out_of_province_only) {
        const key = String(process.env.AMAP_WEB_KEY || "").trim();
        const dep = String(body.departure || "").trim();
        if (key && dep) {
          const cache = new Map<string, string>();
          const guessProvince = (region: string) => {
            const r = String(region || "").trim();
            if (!r) return "";
            // 常见格式：浙江省/江苏省/广西壮族自治区/北京市
            const m = r.match(/^(.*?(省|市|自治区|特别行政区))/);
            return (m?.[1] || r).trim();
          };
          const getDepartureProvince = async () => {
            if (cache.has(dep)) return cache.get(dep)!;
            const url = new URL("https://restapi.amap.com/v3/geocode/geo");
            url.searchParams.set("key", key);
            url.searchParams.set("address", dep);
            const r = await fetch(url, { method: "GET" });
            if (!r.ok) return "";
            const j = (await r.json()) as any;
            const prov = String(j?.geocodes?.[0]?.province || "").trim();
            cache.set(dep, prov);
            return prov;
          };
          const depProv = await getDepartureProvince();
          if (depProv) {
            const f = dests.filter((d) => {
              const p = guessProvince(d.region);
              if (!p) return true; // region 不可判时不强砍，留给补齐逻辑
              return !p.includes(depProv) && !depProv.includes(p);
            });
            if (f.length) dests = f;
          }
        }
      }

      const want = clampInt(body.count, 1, 8, 6);
      if (scope !== "any" && dests.length < want) {
        const repairPrompt = buildRecommendRepairPrompt(body, dests.map((d) => d.name));
        const repair = await qwenChatCompletion({
          messages: [
            { role: "system", content: "你是一位专业的旅行规划师，擅长根据用户需求推荐旅行目的地。" },
            { role: "user", content: repairPrompt },
          ],
        });
        if (repair.ok) {
          const more = parseJsonFromAi<Destination[]>(repair.text, "destinations") || [];
          let more2 = uniqueByName(more);
          if (scope === "domestic") more2 = more2.filter(isLikelyChina);
          if (scope === "overseas") more2 = more2.filter((d) => !isLikelyChina(d));
          const merged = uniqueByName([...dests, ...more2]);
          dests = merged.slice(0, want);
        } else {
          // ignore repair failure; return whatever we have after strict filtering
          dests = dests.slice(0, want);
        }
      } else {
        dests = dests.slice(0, want);
      }

      // 为每个目的地获取天气/图片（并行，减少等待）
      const tEnrich0 = nowMs();
      const destinationsWithWeather = await Promise.all(
        dests.map(async (dest) => {
          const [weather, image_url] = await Promise.all([
            getAmapWeatherForTrip(dest.name, body.start_date, body.end_date),
            getDestinationImageUrlOnline(dest),
          ]);
          return {
            ...dest,
            image_url,
            weather: weather
              ? `${weather[0]?.tempMin}-${weather[0]?.tempMax}°C，${weather[0]?.textDay}`
              : dest.weather,
          };
        })
      );
      const tEnrich = nowMs() - tEnrich0;

      console.info("[travel] recommend timing", {
        cached_ai: Boolean(cached),
        ai_ms: tAi,
        enrich_ms: tEnrich,
        total_ms: nowMs() - t0,
        count: destinationsWithWeather.length,
      });

      return res.json({ destinations: destinationsWithWeather });
    } catch (err) {
      console.error("Travel recommend error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // 生成行程
  app.post("/api/travel/generate", async (req, res) => {
    try {
      const t0 = nowMs();
      const body = req.body as TravelPlanRequest;

      if (!body.destination || !body.start_date || !body.end_date) {
        return res.status(400).json({ error: "destination, start_date and end_date are required" });
      }

      const prompt = buildPlanPrompt(body);

      const cacheKey = `travel:generate:${JSON.stringify(body)}`;
      const cached = cacheGet(cacheKey);
      const tAi0 = nowMs();
      const result = cached
        ? { ok: true as const, text: cached }
        : await qwenChatCompletion({
            messages: [
              { role: "system", content: "你是一位专业的旅行规划师，擅长制定详细的旅行计划。" },
              { role: "user", content: prompt },
            ],
          });
      const tAi = nowMs() - tAi0;
      if (!cached && result.ok) cacheSet(cacheKey, result.text);

      if (!result.ok) {
        console.error("AI error:", result.error);
        return res.status(500).json({ error: "AI generation failed", detail: result.error });
      }

      const plan = parseJsonFromAi<TravelPlan>(result.text, "plan");

      if (!plan) {
        console.error("Parse error, raw text:", result.text);
        return res.status(500).json({ error: "Failed to parse AI response" });
      }

      // 为每个景点添加图片（使用 Unsplash 搜索）
      const planWithImages = {
        ...plan,
        itinerary: plan.itinerary.map((day) => ({
          ...day,
          stay:
            typeof day.stay === "string"
              ? day.stay
              : !day.stay
                ? "待安排"
              : {
                  ...day.stay,
                },
        })),
      };

      // 为每天补充真实天气（若取不到不影响生成）
      const tWeather0 = nowMs();
      const weatherByDate = new Map<string, string>();
      try {
        // 用用户选择的目的地作为城市参数（避免 AI 把 plan.destination 写成景区/长串导致查不到）
        const casts = await getAmapForecast4d(String(body.destination || plan.destination || "").trim());
        (casts || []).forEach((d) => {
          // 高德：daytemp/nighttemp = 最高/最低
          const line = `${d.textDay} ${d.tempMin}-${d.tempMax}℃`;
          weatherByDate.set(String(d.date), line);
        });
      } catch {
        // ignore
      }
      const tWeather = nowMs() - tWeather0;
      planWithImages.itinerary = planWithImages.itinerary.map((day) => ({
        ...day,
        weather: weatherByDate.get(String(day.date)) || undefined,
      }));

      const brandPref = normalizeBrandToken(body.hotel_brand || "");
      const brandMain = brandPref ? brandPref.split("（")[0].trim() : "";
      const tPoi0 = nowMs();
      let poiCalls = 0;
      const POI_CONCURRENCY = 2;
      const srcDays = planWithImages.itinerary;
      const fixedItinerary: DayItinerary[] = new Array(srcDays.length);
      let cursor = 0;
      const runWorker = async () => {
        while (true) {
          const i = cursor++;
          if (i >= srcDays.length) return;
          const day = srcDays[i] as any;
          if (!day.stay || typeof day.stay === "string") {
            fixedItinerary[i] = day;
            continue;
          }
          const stay = day.stay as any;
          const firstSpot = String(day.spots?.[0]?.name || "").trim();
          const spotHint = body.stay_nearby_spots && firstSpot ? `${firstSpot} 附近` : "";
          const rawQuery =
            String(stay.search_query || "").trim() ||
            [plan.destination, brandMain || "酒店", spotHint || stay.area].filter(Boolean).join(" ");
          const search_query = ensureBrandInKeywords(rawQuery, brandMain || undefined);
          poiCalls += 1;
          const poi = await searchAmapHotelPoi({
            city: String(body.destination || plan.destination || "").trim(),
            keywords: search_query,
            brandToken: brandMain || undefined,
          });
          const nextStay = {
            ...stay,
            search_query,
            name: poi?.name || stay.name,
            poi_id: poi?.poi_id,
            address: poi?.address,
            location: poi?.location,
          };
          fixedItinerary[i] = { ...day, stay: nextStay };
        }
      };
      await Promise.all(Array.from({ length: Math.min(POI_CONCURRENCY, srcDays.length) }, () => runWorker()));
      const tPoi = nowMs() - tPoi0;

      // same_stay=true：以第 1 天 stay 为准，全程一致（并且只查一次即可）
      if (body.same_stay) {
        const first = fixedItinerary[0]?.stay;
        if (first && typeof first === "object") {
          for (const d of fixedItinerary) {
            if (d.stay && typeof d.stay === "object") d.stay = first as any;
          }
        }
      }

      console.info("[travel] generate timing", {
        cached_ai: Boolean(cached),
        ai_ms: tAi,
        weather_ms: tWeather,
        poi_ms: tPoi,
        poi_calls: poiCalls,
        total_ms: nowMs() - t0,
        days: fixedItinerary.length,
      });

      return res.json({ plan: { ...planWithImages, itinerary: fixedItinerary } });
    } catch (err) {
      console.error("Travel generate error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // 获取天气
  app.get("/api/travel/weather", async (req, res) => {
    try {
      const city = String(req.query.city || "");
      const startDate = String(req.query.start_date || "");
      const endDate = String(req.query.end_date || "");

      if (!city) {
        return res.status(400).json({ error: "city is required" });
      }

      if (startDate && endDate) {
        const weather = await getAmapWeatherForTrip(city, startDate, endDate);
        return res.json({ weather: weather || null });
      } else {
        const live = await getAmapLiveWeather(city);
        return res.json({ weather: live || null });
      }
    } catch (err) {
      console.error("Weather error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
}
