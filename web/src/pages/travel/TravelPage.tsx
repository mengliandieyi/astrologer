import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { APP_FORM_PILL_ACTIVE, APP_FORM_PILL_IDLE, BAZI_FORM_INPUT_CLASS } from "../../lib/appFormStyles";
import { MascotBadge } from "../../components/MascotBadge";

// 骨架屏组件
function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-[var(--border-soft)]/70 ${className}`} />
  );
}

// 推荐目的地骨架屏
function DestinationSkeleton() {
  return (
    <div className="home-landing-surface overflow-hidden p-0">
      <Skeleton className="h-40 w-full" />
      <div className="p-4">
        <Skeleton className="h-6 w-24 mb-2" />
        <Skeleton className="h-4 w-full mb-1" />
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-3 w-1/2 mb-2" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-10 w-full mt-3" />
      </div>
    </div>
  );
}

function DestinationCard({ dest, loading, onPick }: { dest: Destination; loading: boolean; onPick: () => void }) {
  const primary = dest.image_url?.trim() || dest.image?.trim() || "";
  const cover = destinationCoverSvg(dest);
  const [src, setSrc] = useState(primary);
  const [loaded, setLoaded] = useState(false);

  function onImgError() {
    setSrc("");
    setLoaded(false);
  }

  return (
    <div
      className="home-landing-surface cursor-pointer overflow-hidden p-0 transition hover:scale-[1.02]"
      onClick={onPick}
    >
      <div className="relative h-40 w-full">
        <img src={cover} alt={`${dest.name} cover`} loading="lazy" decoding="async" className="h-40 w-full object-cover" />
        {src ? (
          <img
            src={src}
            alt={dest.name}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={onImgError}
            className={[
              "absolute inset-0 h-40 w-full object-cover transition-opacity duration-300",
              loaded ? "opacity-100" : "opacity-0",
            ].join(" ")}
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-black/0 to-black/0" />
        <div className="absolute left-3 top-3 rounded-full bg-white/75 px-2 py-1 text-xs font-semibold text-[var(--text-main)] backdrop-blur">
          {dest.region}
        </div>
      </div>
      <div className="p-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="shrink-0 text-lg font-bold text-[var(--text-strong)]">{dest.name}</h3>
          <span className="shrink-0 text-[var(--text-muted)]" aria-hidden>
            ·
          </span>
          <p className="min-w-0 flex-1 truncate text-sm text-[var(--text-main)]" title={dest.intro}>
            {dest.intro}
          </p>
        </div>
        {/* 上下分行：避免天气与预算并排时半宽导致「15-」与「22℃」拆开换行 */}
        <div className="mt-2 space-y-1.5 text-xs text-[var(--text-muted)]">
          <div className="flex items-start gap-1.5">
            <span className="shrink-0 pt-px" aria-hidden>
              🌤️
            </span>
            <span className="min-w-0 break-words leading-snug">{dest.weather}</span>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="shrink-0 pt-px" aria-hidden>
              💰
            </span>
            <span className="min-w-0 break-words leading-snug">{dest.budget}</span>
          </div>
          {dest.transit_from_departure && dest.transit_from_departure.trim() && dest.transit_from_departure.trim() !== "—" ? (
            <div className="flex items-start gap-1.5">
              <span className="shrink-0 pt-px" aria-hidden>
                🚄
              </span>
              <span className="min-w-0 break-words leading-snug">{dest.transit_from_departure.trim()}</span>
            </div>
          ) : null}
        </div>
        <p className="mt-2 line-clamp-2 text-xs text-[var(--text-soft)]">💡 {dest.reason}</p>
        <Button className="mt-3 w-full" size="sm" disabled={loading}>
          选择此目的地
        </Button>
      </div>
    </div>
  );
}

// 行程详情骨架屏
function PlanSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-1/2" />
      <div className="home-landing-surface p-5">
        <Skeleton className="h-6 w-24 mb-4" />
        {[1, 2, 3].map((day) => (
          <div key={day} className="home-landing-surface-inset rounded-xl p-4 mb-3">
            <Skeleton className="h-5 w-32 mb-3" />
            <div className="flex gap-3 mb-3">
              <Skeleton className="h-20 w-28 rounded-lg" />
              <div className="flex-1">
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2 mb-1" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="home-landing-surface p-5">
        <Skeleton className="h-6 w-24 mb-4" />
        <Skeleton className="h-8 w-32 mb-3" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
        </div>
      </div>
    </div>
  );
}

// Toast 提示组件（简单版）
function showToast(message: string) {
  // 创建 toast 元素
  const toast = document.createElement("div");
  toast.className = "fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] rounded-[var(--radius-md)] border border-[var(--border-soft)] bg-[var(--info-soft)] px-4 py-2 text-[var(--fs-sm)] text-[var(--info)] shadow-[var(--elev-lifted)] backdrop-blur animate-fade-in";
  toast.textContent = message;
  document.body.appendChild(toast);
  // 2秒后移除
  setTimeout(() => {
    toast.remove();
  }, 2000);
}

async function postJson<T>(url: string, body: any, timeoutMs = 45_000): Promise<T> {
  const ctrl = new AbortController();
  // allow caller to abort (e.g., long loading safeguard)
   
  if (typeof (body as any)?._activeCtrlRef === "object" && (body as any)?._activeCtrlRef) {
    // internal escape hatch: don't leak into actual payload
    const r = (body as any)._activeCtrlRef as { current: AbortController | null };
    r.current = ctrl;
    delete (body as any)._activeCtrlRef;
  }
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    return (await res.json()) as T;
  } finally {
    window.clearTimeout(t);
  }
}

function stableHashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function destinationCoverSvg(dest: { name: string; region?: string }) {
  const seed = stableHashCode(`${dest.name}\u0000${dest.region || ""}`);
  const hue = seed % 360;
  const hue2 = (hue + 38) % 360;
  const name = String(dest.name || "").slice(0, 14);
  const region = String(dest.region || "").slice(0, 18);
  return svgDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="hsl(${hue} 70% 74%)" stop-opacity="0.95"/>
          <stop offset="1" stop-color="hsl(${hue2} 70% 62%)" stop-opacity="0.9"/>
        </linearGradient>
        <radialGradient id="r" cx="30%" cy="20%" r="75%">
          <stop offset="0" stop-color="rgba(255,255,255,0.55)"/>
          <stop offset="1" stop-color="rgba(255,255,255,0)"/>
        </radialGradient>
        <pattern id="p" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M0 24 Q12 12 24 24 T48 24" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>
        </pattern>
      </defs>
      <rect width="800" height="520" fill="url(#g)"/>
      <rect width="800" height="520" fill="url(#r)"/>
      <rect width="800" height="520" fill="url(#p)" opacity="0.55"/>
      <circle cx="690" cy="118" r="92" fill="rgba(255,255,255,0.18)"/>
      <circle cx="716" cy="140" r="62" fill="rgba(255,255,255,0.14)"/>
      <g fill="rgba(255,255,255,0.92)" font-family="Nunito, PingFang SC, Microsoft YaHei, sans-serif">
        <text x="40" y="420" font-size="40" font-weight="800" letter-spacing="1">${name}</text>
        <text x="42" y="458" font-size="22" font-weight="600" opacity="0.9">${region}</text>
      </g>
    </svg>`
  );
}

// 说明：行程页已按需求移除景点/住宿图片展示；
// 目的地推荐卡片仍保留“本地 SVG 封面 + 外链覆盖层”兜底逻辑。

type Destination = {
  name: string;
  region: string;
  intro: string;
  weather: string;
  budget: string;
  image: string;
  reason: string;
  image_url?: string;
  /** 从出发地到目的地的大致交通与耗时（后端 AI 返回） */
  transit_from_departure?: string;
};

type DayItinerary = {
  day: number;
  date: string;
  weather?: string;
  spots: Array<{
    name: string;
    duration: string;
    intro: string;
    time?: string;
    level?: string;
    ticket?: string;
    type?: string;
    image?: string;
    to_next?: {
      mode: string;
      duration: string;
      note?: string;
    };
  }>;
  meals: Array<{
    type: string;
    time?: string;
    suggestion: string;
    cost: string;
  }>;
  stay:
    | string
    | {
        name: string;
        area: string;
        price_per_night_range: string;
        image?: string;
        poi_id?: string;
        address?: string;
        location?: string;
      };
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

/** YYYY-MM-DD + deltaDays（本地日历，避免时区偏移） */
function ymdAddDays(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** tripDays：含首日的行程天数（如 3 表示 3 天，结束日 = 开始日 + 2） */
function tripEndDateInclusive(startYmd: string, tripDays: number): string {
  const n = Math.floor(tripDays);
  if (!Number.isFinite(n) || n < 1) return startYmd;
  return ymdAddDays(startYmd, n - 1);
}

/** 本地“今天”的 YYYY-MM-DD（避免 UTC 偏移） */
function localTodayYmd(): string {
  const dt = new Date();
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** 传给后端的文案即 AI 提示用语；value 空表示不限 */
const HOTEL_BRAND_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "不限" },
  { value: "万豪系（万豪、喜来登、W、万丽等）", label: "万豪系" },
  { value: "希尔顿系（希尔顿、康莱德、希尔顿欢朋等）", label: "希尔顿系" },
  { value: "洲际系（洲际、英迪格、皇冠假日等）", label: "洲际系" },
  { value: "凯悦系（凯悦、君悦、柏悦等）", label: "凯悦系" },
  { value: "雅高系（索菲特、诺富特、美居等）", label: "雅高系" },
  { value: "华住系（全季、汉庭、桔子、星程等）", label: "华住系" },
  { value: "锦江系（维也纳、7天、麗枫等）", label: "锦江系" },
  { value: "如家系（如家、莫泰等）", label: "如家系" },
  { value: "亚朵", label: "亚朵" },
  { value: "格林豪泰系", label: "格林豪泰" },
  { value: "民宿 / 特色客栈优先", label: "民宿·客栈优先" },
  { value: "国际五星优先（品牌不限，按预算选）", label: "国际五星优先" },
  { value: "经济型连锁即可（品牌不限）", label: "经济型即可" },
];

const PREFERENCE_OPTIONS = [
  { value: "beach", label: "🏖️ 海边度假" },
  { value: "mountain", label: "⛰️ 山景自然" },
  { value: "city", label: "🏙️ 城市观光" },
  { value: "food", label: "🍜 美食之旅" },
  { value: "family", label: "👨‍👩‍👧 亲子游" },
  { value: "romantic", label: "💕 浪漫之旅" },
  { value: "adventure", label: "🧗 探险挑战" },
  { value: "culture", label: "🏛️ 文化历史" },
  { value: "shopping", label: "🛍️ 购物休闲" },
  { value: "hot-spring", label: "♨️ 温泉养生" },
];

type DestinationScope = "domestic" | "overseas" | "any";
const DEST_SCOPE_OPTIONS: Array<{ value: DestinationScope; label: string }> = [
  { value: "domestic", label: "国内优先" },
  { value: "overseas", label: "国外优先" },
  { value: "any", label: "不限" },
];

type TravelInputMode = "ai" | "direct";

const COMMON_CITIES = [
  "北京",
  "上海",
  "广州",
  "深圳",
  "杭州",
  "苏州",
  "南京",
  "成都",
  "重庆",
  "武汉",
  "西安",
  "厦门",
  "青岛",
  "大连",
  "长沙",
  "昆明",
  "三亚",
  "珠海",
  "天津",
  "济南",
  "郑州",
  "合肥",
  "福州",
  "宁波",
  "无锡",
  "佛山",
  "东莞",
  "南昌",
  "贵阳",
  "太原",
  "哈尔滨",
  "长春",
  "沈阳",
  "石家庄",
  "兰州",
  "乌鲁木齐",
  "拉萨",
  "海口",
];

function valueOrAny(v: string, fallback = "不限") {
  return String(v || "").trim() || fallback;
}

export function TravelPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"recommend" | "plan" | null>(null);
  const activeCtrlRef = useRef<AbortController | null>(null);
  const loadingSinceRef = useRef<number>(0);
  const [, forceTick] = useState(0);

  // 输入状态
  /** 行程开始日 YYYY-MM-DD，默认今天 */
  const [startDate, setStartDate] = useState(() => ymdAddDays(localTodayYmd(), 1));
  /** 含首日的行程天数 */
  const [tripDays, setTripDays] = useState<number | "">(3);
  /** 输入模式：ai=先推荐目的地；direct=直接指定目的地生成 */
  const [inputMode, setInputMode] = useState<TravelInputMode>("ai");
  /** 直接规划：手动指定目的地（可选） */
  const [directDestination, setDirectDestination] = useState("");
  /** 直接规划：仅用于筛选列表，不作为最终值 */
  const [directSearch, setDirectSearch] = useState("");
  const [budget, setBudget] = useState("");
  const [people, setPeople] = useState(1);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [departure, setDeparture] = useState("");
  const [hotelBrand, setHotelBrand] = useState("");
  const [destinationScope, setDestinationScope] = useState<DestinationScope>("domestic");
  const [sameStay, setSameStay] = useState(false);
  // 已按产品收敛：仅保留“全程同住”
  const [stayNearbySpots, setStayNearbySpots] = useState(false);
  const [nearbyPlay, setNearbyPlay] = useState(false);
  const [nearbyDestinations, setNearbyDestinations] = useState(false);
  const [outOfProvinceOnly, setOutOfProvinceOnly] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // 推荐结果
  const [destinations, setDestinations] = useState<Destination[]>([]);

  // 行程结果
  const [travelPlan, setTravelPlan] = useState<TravelPlan | null>(null);

  const mode: "input" | "recommend" | "plan" =
    location.pathname === "/xinglv/recommend" ? "recommend" : location.pathname === "/xinglv/plan" ? "plan" : "input";
  const effectiveTripDays = typeof tripDays === "number" && Number.isFinite(tripDays) ? tripDays : NaN;
  const tripDaysValid = Number.isInteger(effectiveTripDays) && effectiveTripDays >= 1 && effectiveTripDays <= 60;

  // bump versions to invalidate older cached overseas/unstable images
  const ssDraftKey = "travelDraft:v3";
  const ssDestKey = "travelDestinations:v3";
  const ssDestMetaKey = "travelDestinationsMeta:v1";
  const ssPlanKey = "travelPlan:v3";
  const ssPlanMetaKey = "travelPlanMeta:v1";

  useEffect(() => {
    // 恢复草稿（不阻塞渲染，尽量容错）
    try {
      const raw = sessionStorage.getItem(ssDraftKey);
      if (raw) {
        const d = JSON.parse(raw) as any;
        if (typeof d.startDate === "string" && isValidYmd(d.startDate)) setStartDate(d.startDate);
        if (typeof d.tripDays === "number") setTripDays(Math.min(60, Math.max(1, d.tripDays)));
        if (d.inputMode === "ai" || d.inputMode === "direct") setInputMode(d.inputMode);
        if (typeof d.directDestination === "string") setDirectDestination(d.directDestination);
        if (typeof d.directSearch === "string") setDirectSearch(d.directSearch);
        if (typeof d.budget === "string") setBudget(d.budget);
        if (typeof d.people === "number") setPeople(Math.min(20, Math.max(1, d.people)));
        if (Array.isArray(d.preferences)) setPreferences(d.preferences.filter((x: any) => typeof x === "string"));
        if (typeof d.departure === "string") setDeparture(d.departure);
        if (typeof d.hotelBrand === "string") setHotelBrand(d.hotelBrand);
        if (d.destinationScope === "domestic" || d.destinationScope === "overseas" || d.destinationScope === "any") {
          setDestinationScope(d.destinationScope);
        }
        if (typeof d.sameStay === "boolean") setSameStay(d.sameStay);
        // 兼容旧草稿字段（UI 不再暴露）
        if (typeof d.stayNearbySpots === "boolean") setStayNearbySpots(d.stayNearbySpots);
        if (typeof d.nearbyPlay === "boolean") setNearbyPlay(d.nearbyPlay);
        if (typeof d.nearbyDestinations === "boolean") setNearbyDestinations(d.nearbyDestinations);
        if (typeof d.outOfProvinceOnly === "boolean") setOutOfProvinceOnly(d.outOfProvinceOnly);
      }
    } catch {
      // ignore
    }
     
  }, []);

  useEffect(() => {
    // 草稿持久化
    try {
      sessionStorage.setItem(
        ssDraftKey,
        JSON.stringify({
          startDate,
          tripDays,
          inputMode,
          directDestination,
          directSearch,
          budget,
          people,
          preferences,
          departure,
          hotelBrand,
          destinationScope,
          sameStay,
          stayNearbySpots,
          nearbyPlay,
          nearbyDestinations,
          outOfProvinceOnly,
        })
      );
    } catch {
      // ignore
    }
  }, [
    startDate,
    tripDays,
    inputMode,
    directDestination,
    directSearch,
    budget,
    people,
    preferences,
    departure,
    hotelBrand,
    destinationScope,
    sameStay,
    stayNearbySpots,
    nearbyPlay,
    nearbyDestinations,
    outOfProvinceOnly,
  ]);

  useEffect(() => {
    // 目的地/行程跨路由恢复 + 无数据回退
    if (mode === "recommend") {
      if (destinations.length > 0) return;
      try {
        // 先校验 meta 一致性，不一致则不允许复用旧推荐
        const metaRaw = sessionStorage.getItem(ssDestMetaKey);
        if (metaRaw) {
          const meta = JSON.parse(metaRaw) as any;
          const metaStr = JSON.stringify(meta);
          const nowStr = JSON.stringify(draftMeta);
          if (metaStr !== nowStr) {
            sessionStorage.removeItem(ssDestKey);
            sessionStorage.removeItem(ssDestMetaKey);
          }
        }
        const raw = sessionStorage.getItem(ssDestKey);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            setDestinations(arr as Destination[]);
            return;
          }
        }
      } catch {
        // ignore
      }
      navigate("/xinglv", { replace: true });
    } else if (mode === "plan") {
      if (travelPlan) return;
      try {
        const raw = sessionStorage.getItem(ssPlanKey);
        if (raw) {
          const p = JSON.parse(raw);
          if (p && typeof p === "object") {
            setTravelPlan(p as TravelPlan);
            return;
          }
        }
      } catch {
        // ignore
      }
      // 没有 plan，尝试回推荐；推荐也没数据则回输入
      try {
        const raw = sessionStorage.getItem(ssDestKey);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr) && arr.length > 0) {
            navigate("/xinglv/recommend", { replace: true });
            return;
          }
        }
      } catch {
        // ignore
      }
      navigate("/xinglv", { replace: true });
    }
  }, [mode, destinations.length, travelPlan, navigate]);

  const draftMeta = {
    startDate,
    tripDays,
    budget,
    people,
    preferences,
    departure,
    hotelBrand,
    destinationScope,
    sameStay,
    nearbyDestinations,
    outOfProvinceOnly,
  };

  useEffect(() => {
    // 若“当前行程缓存”与当前表单配置不一致，则清掉 plan（避免看起来“选了亚朵但不生效”）
    try {
      const raw = sessionStorage.getItem(ssPlanMetaKey);
      if (!raw) return;
      const meta = JSON.parse(raw) as any;
      const metaStr = JSON.stringify(meta);
      const nowStr = JSON.stringify(draftMeta);
      if (metaStr !== nowStr) {
        sessionStorage.removeItem(ssPlanKey);
        sessionStorage.removeItem(ssPlanMetaKey);
        if (mode === "plan") {
          // 计划页不允许展示“旧配置行程”
          navigate("/xinglv/recommend", { replace: true });
        }
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    startDate,
    tripDays,
    budget,
    people,
    preferences,
    departure,
    hotelBrand,
    destinationScope,
    sameStay,
    nearbyDestinations,
    outOfProvinceOnly,
  ]);

  useEffect(() => {
    if (!loading) return;
    const id = window.setInterval(() => forceTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [loading]);

  const longLoading = loading && loadingSinceRef.current > 0 && Date.now() - loadingSinceRef.current > 60_000;

  function abortAndUnlock() {
    try {
      activeCtrlRef.current?.abort();
    } catch {
      // ignore
    } finally {
      activeCtrlRef.current = null;
      setLoading(false);
      setBusy(null);
      loadingSinceRef.current = 0;
       
      console.info("[travel] aborted by user safeguard");
    }
  }

  function togglePreference(value: string) {
    setPreferences((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  function pickDirectDestination(name: string) {
    const v = String(name || "").trim();
    if (!v) return;
    setDirectDestination(v);
    setDirectSearch("");
  }

  async function getRecommendations() {
    if (!isValidYmd(startDate)) {
      showToast("请选择有效的开始日期");
      return;
    }
    if (!tripDaysValid) {
      showToast("出行天数请填写 1～60");
      return;
    }
    if (nearbyDestinations && !String(departure || "").trim()) {
      showToast("开启周边游请先填写出发地");
      return;
    }
    if (!nearbyDestinations && outOfProvinceOnly) {
      setOutOfProvinceOnly(false);
    }
    const startDateStr = startDate;
    const endDateStr = tripEndDateInclusive(startDateStr, effectiveTripDays);

    setLoading(true);
    setBusy("recommend");
    try {
      loadingSinceRef.current = Date.now();
      showToast("正在获取推荐...");
      const t0 = Date.now();
      const data = await postJson<{ destinations: Destination[] }>("/api/travel/recommend", {
        _activeCtrlRef: activeCtrlRef,
        start_date: startDateStr,
        end_date: endDateStr,
        count: 6,
        budget,
        people,
        preferences,
        departure,
        hotel_brand: hotelBrand,
        destination_scope: destinationScope,
        nearby_destinations: nearbyDestinations,
        out_of_province_only: outOfProvinceOnly,
      });

      setDestinations(Array.isArray(data.destinations) ? (data.destinations as Destination[]) : []);
      try {
        sessionStorage.setItem(
          ssDestKey,
          JSON.stringify(Array.isArray(data.destinations) ? (data.destinations as Destination[]) : [])
        );
        sessionStorage.setItem(ssDestMetaKey, JSON.stringify(draftMeta));
      } catch {
        // ignore
      }
      // dev 可观测：确认是否真的发出了请求
       
      console.info("[travel] recommend ok", { ms: Date.now() - t0, count: Array.isArray(data.destinations) ? data.destinations.length : 0 });
      navigate("/xinglv/recommend", { replace: true });
    } catch (err) {
      showToast(`获取推荐失败：${String((err as any)?.message || err)}`);
      console.error(err);
    } finally {
      setLoading(false);
      setBusy(null);
      loadingSinceRef.current = 0;
    }
  }

  async function generatePlan(destinationName: string) {
    if (!isValidYmd(startDate)) {
      showToast("开始日期无效，请返回上一步重新填写");
      return;
    }
    const destName = String(destinationName || "").trim();
    if (!destName) {
      showToast("请先填写目的地");
      return;
    }
    const startDateStr = startDate;
    if (!tripDaysValid) {
      showToast("出行天数请填写 1～60");
      return;
    }
    const endDateStr = tripEndDateInclusive(startDateStr, effectiveTripDays);
    setLoading(true);
    setBusy("plan");
    try {
      loadingSinceRef.current = Date.now();
      showToast("正在生成行程...");
      const t0 = Date.now();
      const data = await postJson<{ plan: TravelPlan }>("/api/travel/generate", {
        _activeCtrlRef: activeCtrlRef,
        destination: destName,
        start_date: startDateStr,
        end_date: endDateStr,
        budget,
        people,
        preferences,
        departure,
        hotel_brand: hotelBrand,
        same_stay: sameStay,
        stay_nearby_spots: stayNearbySpots,
        nearby_play: nearbyPlay,
      }, 120_000);

      setTravelPlan(data.plan);
      try {
        sessionStorage.setItem(ssPlanKey, JSON.stringify(data.plan));
        sessionStorage.setItem(ssPlanMetaKey, JSON.stringify(draftMeta));
      } catch {
        // ignore
      }
       
      console.info("[travel] plan ok", { ms: Date.now() - t0, destination: destName });
      navigate("/xinglv/plan", { replace: true });
    } catch (err) {
      showToast(`生成行程失败：${String((err as any)?.message || err)}`);
      console.error(err);
    } finally {
      setLoading(false);
      setBusy(null);
      loadingSinceRef.current = 0;
    }
  }

  function reset() {
    setDestinations([]);
    setTravelPlan(null);
    try {
      sessionStorage.removeItem(ssDestKey);
      sessionStorage.removeItem(ssPlanKey);
    } catch {
      // ignore
    }
    navigate("/xinglv", { replace: true });
  }

  function goPickDestination() {
    try {
      const raw = sessionStorage.getItem(ssDestKey);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length > 0) {
          navigate("/xinglv/recommend", { replace: true });
          return;
        }
      }
    } catch {
      // ignore
    }
    navigate("/xinglv", { replace: true });
  }

  const endDateLabel = isValidYmd(startDate) && tripDaysValid ? tripEndDateInclusive(startDate, effectiveTripDays) : "—";
  const selectedPreferenceLabels = PREFERENCE_OPTIONS.filter((p) => preferences.includes(p.value)).map((p) => p.label);

  return (
    <div className="page-travel home-landing pb-12">
      <nav className="home-navbar">
        <Link to="/" className="home-logo-link" aria-label="返回首页">
          <div className="home-logo-circle" aria-hidden />
          <span className="home-logo-text">知行馆</span>
        </Link>
        <div className="home-navbar-actions">
          <button type="button" className="home-help-btn" onClick={() => setHelpOpen(true)}>
            帮助中心
          </button>
        </div>
      </nav>

      <header className="home-landing-header" aria-labelledby="travel-page-title">
        <div className="home-landing-header-content">
          <h1 id="travel-page-title" className="home-landing-title">行旅筹划·灵犀行程</h1>
          <p className="home-landing-subline mt-2">目的地推荐 · 行程生成 · 预算清单</p>
        </div>
        <MascotBadge to="/" label="返回首页" />
      </header>

      <div className="home-landing-surface max-w-full overflow-x-hidden p-5">
      {/* 输入区域 */}
      {mode === "input" && (
        <section>
          {/* 模式切换：轨道略深、选中块白底 + 金边 + 字重，避免「白贴白」看不清 */}
          <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-2xl border border-[var(--border-soft)] bg-[#e7e5e4]/90 p-1 shadow-[inset_0_1px_2px_rgba(28,25,23,0.06)]">
            <button
              type="button"
              aria-pressed={inputMode === "ai"}
              onClick={() => setInputMode("ai")}
              className={[
                "h-10 rounded-xl text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                inputMode === "ai"
                  ? "relative z-[1] bg-white font-extrabold text-[var(--text-strong)] shadow-[0_3px_10px_rgba(28,25,23,0.1)] ring-2 ring-[var(--accent)] ring-offset-0"
                  : "font-semibold text-[var(--text-muted)] hover:bg-white/40 hover:text-[var(--text-main)]",
              ].join(" ")}
            >
              AI 推荐目的地
            </button>
            <button
              type="button"
              aria-pressed={inputMode === "direct"}
              onClick={() => setInputMode("direct")}
              className={[
                "h-10 rounded-xl text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
                inputMode === "direct"
                  ? "relative z-[1] bg-white font-extrabold text-[var(--text-strong)] shadow-[0_3px_10px_rgba(28,25,23,0.1)] ring-2 ring-[var(--accent)] ring-offset-0"
                  : "font-semibold text-[var(--text-muted)] hover:bg-white/40 hover:text-[var(--text-main)]",
              ].join(" ")}
            >
              直接选目的地
            </button>
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
            <div className="home-landing-surface-inset p-4">
              <div className="mb-3 text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">基础信息</div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {inputMode === "direct" ? (
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-[var(--text-muted)]">目的地 *</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {COMMON_CITIES.slice(0, 12).map((c) => {
                    const on = directDestination.trim() === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => pickDirectDestination(c)}
                        className={[
                          "rounded-full border px-3 py-1.5 text-sm transition",
                          on
                            ? "border-[var(--focus-ring)] bg-[var(--focus-ring)] text-white"
                            : "border-[var(--border-soft)] bg-[var(--surface-soft)] text-[var(--text-main)] hover:bg-[var(--surface-soft-2)]",
                        ].join(" ")}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2">
                  <input
                    type="text"
                    placeholder="搜索城市（只能从列表中点选）"
                    value={directSearch}
                    onChange={(e) => setDirectSearch(e.target.value)}
                    className="block h-10 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--focus-ring)]"
                  />
                  {(() => {
                    const q = String(directSearch || "").trim();
                    if (!q) return null; // 无搜索词时不展示“搜索结果”，避免与常用城市重复
                    const list = COMMON_CITIES.filter((c) => c.includes(q)).slice(0, 18);
                    return (
                      <div className="mt-2">
                        <div className="mb-1 text-xs font-semibold text-[var(--text-muted)]">搜索结果</div>
                        <div className="flex flex-wrap gap-2">
                          {list.map((c) => {
                            const on = directDestination.trim() === c;
                            return (
                              <button
                                key={c}
                                type="button"
                                onClick={() => pickDirectDestination(c)}
                                className={[
                                  "rounded-full border px-3 py-1.5 text-sm transition",
                                  on
                                    ? "border-[var(--focus-ring)] bg-[var(--focus-ring)] text-white"
                                    : "border-[var(--border-soft)] bg-[var(--surface-soft)] text-[var(--text-main)] hover:bg-[var(--surface-soft-2)]",
                                ].join(" ")}
                              >
                                {c}
                              </button>
                            );
                          })}
                          {!list.length ? (
                            <span className="text-xs text-[var(--text-soft)]">未匹配到城市，请换个关键词。</span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <p className="mt-1 text-xs text-[var(--text-soft)]">
                  已选：
                  <span className="ml-1 rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-2 py-0.5 text-[11px] text-[var(--text-main)]">
                    {String(directDestination || "").trim() || "未选择"}
                  </span>
                </p>
              </div>
            ) : null}
            <div>
              <label className="text-xs font-semibold text-[var(--text-muted)]">开始日期 *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value || ymdAddDays(localTodayYmd(), 1))}
                className="mt-1 block h-10 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--focus-ring)]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text-muted)]">出行天数 *</label>
              <input
                type="number"
                min={1}
                max={60}
                value={tripDays}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setTripDays("");
                    return;
                  }
                  const next = Number(raw);
                  if (!Number.isFinite(next)) return;
                  setTripDays(Math.min(60, Math.max(1, Math.floor(next))));
                }}
                className="mt-1 block h-10 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--focus-ring)]"
              />
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-[var(--text-muted)]">
                结束日：{" "}
                <span className="font-medium text-[var(--text-main)]">
                  {endDateLabel}
                </span>
              </p>
            </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)]">预算范围</label>
                <select
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className={BAZI_FORM_INPUT_CLASS}
                >
                  <option value="">不限</option>
                  <option value="low">3000元以内</option>
                  <option value="medium">3000-8000元</option>
                  <option value="high">8000元以上</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--text-muted)]">出行人数</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={people}
                  onChange={(e) => setPeople(Number(e.target.value) || 1)}
                  className={BAZI_FORM_INPUT_CLASS}
                />
              </div>
              <div className="min-w-0">
                <label className="text-xs font-semibold text-[var(--text-muted)]">出发地</label>
                <input
                  type="text"
                  placeholder="如：上海"
                  value={departure}
                  onChange={(e) => setDeparture(e.target.value)}
                  className={BAZI_FORM_INPUT_CLASS}
                />
              </div>
              </div>
            </div>

            <div className="home-landing-surface-inset p-4">
              <div className="mb-3 text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">偏好与约束</div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {inputMode === "ai" ? (
                  <div className="sm:col-span-2">
                    <label htmlFor="travel-dest-scope" className="text-xs font-semibold text-[var(--text-muted)]">
                      目的地范围
                    </label>
                    <select
                      id="travel-dest-scope"
                      value={destinationScope}
                      onChange={(e) => setDestinationScope(e.target.value as DestinationScope)}
                      className={BAZI_FORM_INPUT_CLASS}
                    >
                      {DEST_SCOPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {inputMode === "ai" ? (
                  <div className="sm:col-span-2">
                    <div className="text-xs font-semibold text-[var(--text-muted)]">出行范围</div>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--text-main)]">
                        <input
                          id="nearbyDestinations"
                          type="checkbox"
                          checked={nearbyDestinations}
                          onChange={(e) => setNearbyDestinations(e.target.checked)}
                          className="h-4 w-4 shrink-0 rounded border border-[var(--border-soft)] accent-[var(--focus-ring)]"
                        />
                        周边游（近出发地）
                      </label>
                      {nearbyDestinations ? (
                        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--text-main)]">
                          <input
                            id="outOfProvinceOnly"
                            type="checkbox"
                            checked={outOfProvinceOnly}
                            onChange={(e) => setOutOfProvinceOnly(e.target.checked)}
                            className="h-4 w-4 shrink-0 rounded border border-[var(--border-soft)] accent-[var(--focus-ring)]"
                          />
                          跨省优先
                        </label>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div>
                  <label htmlFor="travel-hotel-brand" className="text-xs font-semibold text-[var(--text-muted)]">
                    酒店品牌
                  </label>
                  <select id="travel-hotel-brand" value={hotelBrand} onChange={(e) => setHotelBrand(e.target.value)} className={BAZI_FORM_INPUT_CLASS}>
                    {HOTEL_BRAND_OPTIONS.map((opt) => (
                      <option key={opt.value || "__any__"} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="text-xs font-semibold text-[var(--text-muted)]">住宿偏好</span>
                  <div className="mt-1">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--text-main)]">
                      <input
                        type="checkbox"
                        checked={sameStay}
                        onChange={(e) => setSameStay(e.target.checked)}
                        className="h-4 w-4 shrink-0 rounded border border-[var(--border-soft)] accent-[var(--focus-ring)]"
                      />
                      全程同住
                    </label>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs font-semibold text-[var(--text-muted)]">偏好标签</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PREFERENCE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => togglePreference(opt.value)}
                        className={preferences.includes(opt.value) ? APP_FORM_PILL_ACTIVE : APP_FORM_PILL_IDLE}
                      >
                        {preferences.includes(opt.value) ? `✓ ${opt.label}` : opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-[var(--border-soft)] bg-white/35 p-3">
                <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">当前配置</div>
                <div className="mt-2 grid gap-1.5 text-sm text-[var(--text-main)]">
                  <div>日期：{startDate || "—"} 至 {endDateLabel}</div>
                  <div>人数：{people} 人 · 预算：{valueOrAny(budget)}</div>
                  <div>出发地：{valueOrAny(departure, "未填写")}</div>
                  <div>酒店：{valueOrAny(HOTEL_BRAND_OPTIONS.find((x) => x.value === hotelBrand)?.label || "")}</div>
                  <div>偏好：{selectedPreferenceLabels.length ? selectedPreferenceLabels.join("、") : "不限"}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-col items-stretch gap-2">
            {inputMode === "direct" ? (
              <Button
                onClick={() => generatePlan(directDestination)}
                disabled={loading || !tripDaysValid || !isValidYmd(startDate) || !String(directDestination || "").trim()}
              >
                {loading && busy === "plan" ? "AI 生成中..." : "⚡ 生成行程"}
              </Button>
            ) : (
              <Button onClick={getRecommendations} disabled={loading || !tripDaysValid || !isValidYmd(startDate)}>
                {loading && busy === "recommend" ? "AI 规划中..." : "✨ 开始规划"}
              </Button>
            )}
              </div>
          {longLoading && (
                <div className="mt-3 flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
              <span>超过 60s 仍未完成，可能卡住或网络异常。</span>
              <Button variant="secondary" size="sm" onClick={abortAndUnlock}>
                取消并重试
              </Button>
            </div>
          )}
            </div>
          </div>
        </section>
      )}

      {/* 推荐目的地 */}
      {mode === "recommend" && (
        <section className="mx-auto max-w-5xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-[var(--text-strong)]">
              {loading && busy === "plan" ? "🤖 AI 正在生成行程..." : "AI 推荐目的地"}
            </h2>
            <div className="flex items-center gap-2">
              {longLoading ? (
                <Button variant="secondary" size="sm" onClick={abortAndUnlock}>
                  取消并重试
                </Button>
              ) : null}
              <Button variant="secondary" size="sm" onClick={reset} disabled={loading}>
                重新填写
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {loading && busy === "recommend" ? (
              <>
                <DestinationSkeleton />
                <DestinationSkeleton />
                <DestinationSkeleton />
              </>
            ) : (
              destinations.map((dest, idx) => (
                <DestinationCard key={`${dest.name}-${idx}`} dest={dest} loading={loading} onPick={() => generatePlan(dest.name)} />
              ))
            )}
          </div>

          {loading && busy === "plan" && (
            <div className="mt-6">
              <PlanSkeleton />
            </div>
          )}
        </section>
      )}

      {/* 行程详情 */}
      {mode === "plan" && travelPlan && (
        <section className="mx-auto max-w-4xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[var(--text-strong)]">{travelPlan.summary}</h2>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setTravelPlan(null);
                  try {
                    sessionStorage.removeItem(ssPlanKey);
                  } catch {
                    // ignore
                  }
                  goPickDestination();
                }}
              >
                换目的地
              </Button>
              <Button variant="secondary" size="sm" onClick={reset}>
                重新规划
              </Button>
            </div>
          </div>

          {/* 每日行程 */}
          <div className="home-landing-surface p-5">
            <h3 className="mb-3 font-bold text-[var(--text-strong)]">📅 每日行程</h3>
            {travelPlan.itinerary.map((day) => (
              <div key={day.day} className="home-landing-surface-inset mb-3 rounded-xl p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-semibold text-[var(--text-main)]">
                    第 {day.day} 天 · {day.date}
                    {day.weather ? (
                      <span className="ml-2 font-normal text-xs text-[var(--text-muted)]">🌤️ {day.weather}</span>
                    ) : null}
                  </div>
                  <button
                    onClick={() => {
                      const query = day.spots.map((s) => s.name).join(" → ");
                      window.open(`https://gaode.com/search?query=${encodeURIComponent(query)}`, "_blank");
                    }}
                    className="rounded-[var(--radius-sm)] bg-[var(--info-soft)] px-2 py-1 text-xs font-medium text-[var(--info)] hover:opacity-85"
                  >
                    🗺️ 查看地图
                  </button>
                </div>
                <div className="space-y-3">
                  {(() => {
                    const parseHm = (s: string | undefined | null) => {
                      const t = String(s || "").trim();
                      const m = t.match(/(\d{1,2}):(\d{2})/);
                      if (!m) return null;
                      const hh = Number(m[1]);
                      const mm = Number(m[2]);
                      if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
                      return hh * 60 + mm;
                    };
                    const parseRange = (s: string | undefined | null) => {
                      const t = String(s || "").trim();
                      // 支持 -, – , — , ～ 等分隔符
                      const m = t.match(/(\d{1,2}):(\d{2})\s*[-–—～~]\s*(\d{1,2}):(\d{2})/);
                      if (!m) return null;
                      const a = Number(m[1]) * 60 + Number(m[2]);
                      const b = Number(m[3]) * 60 + Number(m[4]);
                      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
                      return { start: a, end: b };
                    };

                    // 用餐落位规则：
                    // 1) 若时间落在某个景点 time 区间内：放在该景点卡片后（更符合“午餐在景点内/附近”）
                    // 2) 否则尽量放到“景点 i 与 i+1 之间”
                    const withinSpot: Array<Array<typeof day.meals[number]>> = Array.from(
                      { length: day.spots.length },
                      () => []
                    );
                    const betweenSpots: Array<Array<typeof day.meals[number]>> = Array.from(
                      { length: Math.max(0, day.spots.length - 1) },
                      () => []
                    );
                    const placed = new Set<number>();

                    (day.meals || []).forEach((m, mi) => {
                      const mealMin = parseHm(m.time);
                      if (mealMin == null) return;

                      // 先尝试：落在景点区间内
                      for (let i = 0; i < day.spots.length; i++) {
                        const r = parseRange(day.spots[i]?.time);
                        if (!r) continue;
                        if (mealMin >= r.start && mealMin <= r.end) {
                          withinSpot[i].push(m);
                          placed.add(mi);
                          return;
                        }
                      }

                      // 再尝试：落在景点之间
                      for (let i = 0; i < day.spots.length - 1; i++) {
                        const endMin = parseRange(day.spots[i]?.time)?.end ?? null;
                        const nextStartMin = parseRange(day.spots[i + 1]?.time)?.start ?? null;
                        if (endMin == null || nextStartMin == null) continue;
                        if (mealMin >= endMin && mealMin <= nextStartMin) {
                          betweenSpots[i].push(m);
                          placed.add(mi);
                          return;
                        }
                      }
                    });

                    const unplacedMeals = (day.meals || []).filter((_m, mi) => !placed.has(mi));

                    return (
                      <>
                        {day.spots.map((spot, i) => (
                          <div key={i} className="space-y-2">
                            <div className="home-landing-surface-inset rounded-xl p-3">
                              <div className="flex gap-3">
                                <div className="flex-1 text-sm text-[var(--text-main)]">
                                  <div className="font-semibold">
                                    📍 {spot.name}
                                    {spot.level && (
                                      <span className="ml-1 rounded-[var(--radius-sm)] bg-[var(--warning-soft)] px-1.5 py-0.5 text-xs font-medium text-[var(--warning)]">
                                        {spot.level}
                                      </span>
                                    )}
                                    {spot.type && (
                                      <span className="ml-1 rounded-[var(--radius-sm)] bg-[var(--info-soft)] px-1.5 py-0.5 text-xs font-medium text-[var(--info)]">
                                        {spot.type}
                                      </span>
                                    )}
                                  </div>
                                  {spot.time ? <div className="mt-0.5 text-xs text-[var(--text-muted)]">🕒 {spot.time}</div> : null}
                                  {spot.ticket ? <div className="mt-0.5 text-xs text-[var(--text-muted)]">🎫 {spot.ticket}</div> : null}
                                  <div className="mt-0.5 text-xs text-[var(--text-muted)]">⏱️ {spot.duration}</div>
                                  <div className="mt-1 text-xs text-[var(--text-soft)]">{spot.intro}</div>
                                </div>
                              </div>

                              {/* 路线提示 */}
                              {i < day.spots.length - 1 ? (
                                <div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                                  <span className="text-lg">↓</span>
                                  <span className="truncate">前往下一站：{day.spots[i + 1].name}</span>
                                  {spot.to_next?.duration ? (
                                    <span className="rounded bg-[var(--surface-soft)] px-1.5 py-0.5 text-[11px] text-[var(--text-soft)]">
                                      {spot.to_next.mode ? `${spot.to_next.mode} · ` : ""}
                                      {spot.to_next.duration}
                                    </span>
                                  ) : null}
                                  <button
                                    onClick={() => {
                                      const from = encodeURIComponent(spot.name);
                                      const to = encodeURIComponent(day.spots[i + 1].name);
                                      window.open(
                                        `https://uri.amap.com/navigation?from=&to=&fromname=${from}&toname=${to}&mode=car&policy=1&src=知行馆`,
                                        "_blank"
                                      );
                                    }}
                                    className="rounded-[var(--radius-sm)] bg-[var(--success-soft)] px-2 py-0.5 text-[var(--success)] hover:opacity-85"
                                  >
                                    🗺️ 导航
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            {/* 景点内/景点后用餐 */}
                            {withinSpot[i].length
                              ? withinSpot[i].map((m, mi2) => (
                                  <div
                                    key={`${m.type}-${m.time}-${mi2}`}
                                    className="home-landing-surface-inset rounded-xl px-3 py-2 text-xs text-[var(--text-muted)]"
                                  >
                                    🍜 {m.type}
                                    {m.time ? ` ${m.time}` : ""}：{m.suggestion}（{m.cost}）
                                  </div>
                                ))
                              : null}

                            {/* 景点之间插入餐饮（已落位的不会在底部重复） */}
                            {i < day.spots.length - 1 && betweenSpots[i].length
                              ? betweenSpots[i].map((m, mi2) => (
                                  <div
                                    key={`${m.type}-${m.time}-${mi2}`}
                                    className="home-landing-surface-inset rounded-xl px-3 py-2 text-xs text-[var(--text-muted)]"
                                  >
                                    🍜 {m.type}
                                    {m.time ? ` ${m.time}` : ""}：{m.suggestion}（{m.cost}）
                                  </div>
                                ))
                              : null}
                          </div>
                        ))}

                        {/* 兜底：仅展示未落位的餐饮，避免重复 */}
                        {unplacedMeals.length ? (
                          <div className="mt-2 text-xs text-[var(--text-muted)]">
                            🍜{" "}
                            {unplacedMeals
                              .map((m) => `${m.type}${m.time ? ` ${m.time}` : ""}: ${m.suggestion}（${m.cost}）`)
                              .join(" | ")}
                          </div>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
                <div className="mt-2">
                  {!day.stay ? (
                    <div className="text-xs text-[var(--text-muted)]">🏨 住宿：待安排</div>
                  ) : typeof day.stay === "string" ? (
                    <div className="text-xs text-[var(--text-muted)]">🏨 住宿：{day.stay}</div>
                  ) : (
                    <div className="home-landing-surface-inset overflow-hidden rounded-xl">
                      <div className="p-3">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <div className="text-sm font-semibold text-[var(--text-main)]">🏨 {day.stay.name}</div>
                          <div className="text-xs text-[var(--text-muted)]">{day.stay.area}</div>
                        </div>
                        {day.stay.address ? (
                          <div className="mt-1 text-xs text-[var(--text-muted)]">📍 {day.stay.address}</div>
                        ) : null}
                        <div className="mt-1 text-xs text-[var(--text-muted)]">
                          💰 {day.stay.price_per_night_range}
                          <span className="ml-2 text-[var(--text-soft)]">（参考价，以平台为准）</span>
                        </div>
                        {day.stay.poi_id ? (
                          <div className="mt-1 text-[11px] text-[var(--text-soft)]">POI: {day.stay.poi_id}</div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-1 text-xs text-[var(--text-soft)]">💡 {day.tips}</div>
              </div>
            ))}
          </div>

          {/* 预算拆分 */}
          <div className="home-landing-surface p-5">
            <h3 className="mb-3 font-bold text-[var(--text-strong)]">💰 预算拆分</h3>
            <div className="mb-2 text-lg font-bold text-[var(--text-main)]">{travelPlan.budget.total}</div>
            <div className="grid grid-cols-2 gap-2 text-sm text-[var(--text-muted)] sm:grid-cols-3">
              <div>✈️ 交通：{travelPlan.budget.transport}</div>
              <div>🏨 住宿：{travelPlan.budget.accommodation}</div>
              <div>🍜 餐饮：{travelPlan.budget.food}</div>
              <div>🎫 门票：{travelPlan.budget.tickets}</div>
              <div>🛍️ 其他：{travelPlan.budget.other}</div>
            </div>
            
            {/* 费用分摊 */}
            {people > 1 && (
              <div className="mt-4 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-soft)] p-3">
                <div className="text-sm font-semibold text-[var(--text-main)]">👥 {people}人同行，人均费用</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[var(--text-muted)] sm:grid-cols-3">
                  <div>人均交通：≈ ¥{Math.ceil(parseInt(travelPlan.budget.transport.match(/\d+/)?.[0] || "0") / people)}</div>
                  <div>人均住宿：≈ ¥{Math.ceil(parseInt(travelPlan.budget.accommodation.match(/\d+/)?.[0] || "0") / people)}</div>
                  <div>人均餐饮：≈ ¥{Math.ceil(parseInt(travelPlan.budget.food.match(/\d+/)?.[0] || "0") / people)}</div>
                  <div>人均门票：≈ ¥{Math.ceil(parseInt(travelPlan.budget.tickets.match(/\d+/)?.[0] || "0") / people)}</div>
                  <div>人均其他：≈ ¥{Math.ceil(parseInt(travelPlan.budget.other.match(/\d+/)?.[0] || "0") / people)}</div>
                </div>
                <div className="mt-2 text-sm font-bold text-[var(--text-strong)]">
                  合计人均：≈ ¥{Math.ceil((parseInt(travelPlan.budget.total.match(/\d+/)?.[0] || "0")) / people)}
                </div>
              </div>
            )}
          </div>

          {/* 行李清单 */}
          <div className="home-landing-surface p-5">
            <h3 className="mb-3 font-bold text-[var(--text-strong)]">🎒 行李清单</h3>
            <div className="flex flex-wrap gap-2">
              {travelPlan.packing.map((item, i) => (
                <span
                  key={i}
                  className="rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-1 text-sm text-[var(--text-main)]"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* 注意事项 */}
          <div className="home-landing-surface p-5">
            <h3 className="mb-3 font-bold text-[var(--text-strong)]">⚠️ 注意事项</h3>
            <ul className="space-y-1 text-sm text-[var(--text-main)]">
              {travelPlan.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </div>

          {/* 操作按钮 */}
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="secondary" onClick={() => {
              if (!travelPlan) return;
              const saved = JSON.parse(localStorage.getItem("travel_plans") || "[]");
              saved.push({
                id: Date.now(),
                ...travelPlan,
                createdAt: new Date().toISOString(),
              });
              localStorage.setItem("travel_plans", JSON.stringify(saved));
              showToast("行程已保存");
            }}><span aria-hidden>💾</span> 保存行程</Button>
            <Button variant="secondary" onClick={() => {
              if (!travelPlan) return;
              // 生成简单分享文本
              const text = `${travelPlan.summary}\n\n${travelPlan.itinerary.map(d => `第${d.day}天：${d.spots.map(s => s.name).join(" → ")}`).join("\n")}\n\n预算：${travelPlan.budget.total}`;
              navigator.clipboard.writeText(text);
              showToast("行程已复制到剪贴板");
            }}><span aria-hidden>📋</span> 复制分享</Button>
            <Button variant="secondary" onClick={() => {
              if (!travelPlan) return;
              // 生成 ICS 日历文件
              const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//知行馆//行旅筹划//CN
${travelPlan.itinerary.map(d => `BEGIN:VEVENT
DTSTART:${d.date.replace(/-/g, "")}
SUMMARY:${d.spots.map(s => s.name).join(" → ")}
DESCRIPTION:${d.tips}
END:VEVENT`).join("\n")}
END:VCALENDAR`;
              const blob = new Blob([ics], { type: "text/calendar" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${travelPlan.destination}-行程.ics`;
              a.click();
              URL.revokeObjectURL(url);
            }}><span aria-hidden>📅</span> 导出日历</Button>
            <Button variant="secondary" onClick={() => {
              const saved = JSON.parse(localStorage.getItem("travel_plans") || "[]");
              if (saved.length === 0) {
                showToast("暂无保存的行程");
                return;
              }
              const list = saved.map((p: any, i: number) => `${i + 1}. ${p.destination} - ${p.summary}`).join("\n");
              showToast(`已保存 ${saved.length} 条行程`);
              console.log("已保存的行程：\n" + list);
            }}><span aria-hidden>📚</span> 我的行程</Button>
          </div>
        </section>
      )}
      </div>

      <div className="mt-10 text-center text-xs text-[var(--text-muted)]">
        本行程由 AI 生成，仅供娱乐参考
      </div>

      {helpOpen ? (
        <div
          className="home-modern-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.currentTarget === e.target && setHelpOpen(false)}
        >
          <div className="home-modern-modal-panel w-full max-w-[560px] rounded-[18px] p-4">
            <h3 className="home-modern-modal-title mb-2 text-[1.12rem] font-bold">帮助中心</h3>
            <p className="home-modern-modal-text mb-2 text-[0.92rem] leading-[1.55]">
              行旅筹划支持两种入口：先让 AI 推荐目的地，或直接指定目的地生成行程。
            </p>
            <p className="home-modern-modal-text mb-2 text-[0.92rem] leading-[1.55]">
              填写日期、人数、预算、出发地和偏好后，可在「推荐目的地」与「行程方案」之间切换查看结果。
            </p>
            <div className="mt-2.5 flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setHelpOpen(false)}>
                我知道了
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
