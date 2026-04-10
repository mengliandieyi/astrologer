import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { RegionCombobox } from "../../components/bazi/RegionCombobox";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { HepanPanel } from "../hepan/HepanPanel";
import { TIMEZONE_OPTIONS_ZH } from "../../lib/timezonesZh";
import { authLogout, authMe, createProfile, getProfile, listProfiles, type Profile } from "../../lib/authClient";

type ChinaRegionModule = typeof import("../../lib/chinaRegion");

type CalendarType = "solar" | "lunar";

type ShenShaItem = { name: string; type: "ji" | "xiong" | "neutral"; effect: string; basis?: string };

type ChartRecord = {
  chart_id: string;
  /** 后端排盘缓存命中：档案未变更则复用最近一次排盘结果 */
  from_cache?: boolean;
  /** 出生地（与排盘时省市区一致）；旧盘可能无此字段 */
  birth_location?: string;
  /** 分享回填：排盘提交的日期/时间/时区（新存盘才有） */
  birth_date?: string;
  birth_time?: string;
  birth_timezone?: string;
  gender?: 0 | 1;
  calendar_meta?: {
    input_calendar: "solar" | "lunar";
    solar_datetime: string;
    lunar_datetime: string;
  };
  basic_summary: string;
  pillars: { year: string; month: string; day: string; hour: string };
  five_elements: Record<string, number>;
  true_solar_time?: string;
  jie_qi?: string;
  ge_ju?: string;
  jie_qi_window?: { current: string };
  day_master?: {
    strength_score: number;
    strength_level: "weak" | "balanced" | "strong";
    useful_elements: string[];
    avoid_elements: string[];
  };
  fortune_cycles?: {
    yun_start?: string;
    da_yun?: Array<{
      gan_zhi: string;
      start_year: number;
      end_year: number;
      love?: string;
      wealth?: string;
      career?: string;
      health?: string;
      summary?: string;
      shen_sha?: ShenShaItem[];
    }>;
    liu_nian_preview: Array<{
      year: number;
      gan_zhi: string;
      love: string;
      wealth: string;
      career: string;
      health?: string;
      summary: string;
      shen_sha?: ShenShaItem[];
    }>;
    liu_yue_preview?: Array<{
      year: number;
      month: number;
      gan_zhi: string;
      love: string;
      wealth: string;
      career: string;
      health?: string;
      summary: string;
      shen_sha?: ShenShaItem[];
    }>;
  };
  shen_sha_by_pillar?: {
    year: ShenShaItem[];
    month: ShenShaItem[];
    day: ShenShaItem[];
    hour: ShenShaItem[];
  };
  shen_sha?: ShenShaItem[];
  user_readable?: {
    one_line: string;
    actions: string[];
    cautions: string[];
    liu_nian_tips: Array<{ year: number; label: string; tip: string }>;
  };
};

type ShareRenderResp = { image_url: string; share_url: string; ab_group?: string };
type AiResp = {
  chart_id: string;
  ai_text: string;
  provider: string;
  analyst_mode?: "full" | "career" | "wealth" | "love" | "children" | "kinship" | "health" | "study";
  /** 服务端命中 SQLite/PG 缓存，未再调用大模型 */
  from_cache?: boolean;
};

function normalizeBirthTimeForForm(t: string): string {
  const m = t.trim().match(/^(\d{1,2}):(\d{1,2})/);
  if (!m) return t.trim();
  return `${m[1].padStart(2, "0")}:${m[2].padStart(2, "0")}`;
}

/** 与后端 calendar_meta.solar_datetime（toYmdHms）对齐 */
function deriveBirthFromSolarDatetime(s: string): { date: string; time: string } | null {
  const m = s.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return {
    date: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    time: `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`,
  };
}

/** 左侧状态条：空闲 / 进行中 / 成功 / 失败 分色与动效 */
type BaziStatusTone = "idle" | "pending" | "success" | "error";

function baziStatusBannerClass(tone: BaziStatusTone): string {
  const base =
    "home-landing-surface-inset mt-4 p-3 text-sm border transition-[color,background-color,border-color] duration-200";
  switch (tone) {
    case "idle":
      return `${base} border-[var(--border-soft)] bg-[var(--surface-soft)] text-[var(--text-muted)]`;
    case "pending":
      return `${base} border-[rgba(200,180,100,0.45)] bg-[rgba(255,236,180,0.2)] text-[var(--text-main)]`;
    case "success":
      return `${base} border-[rgba(74,120,108,0.4)] bg-[rgba(217,245,237,0.35)] text-[var(--bazi-success)]`;
    case "error":
      return `${base} border-[rgba(180,100,100,0.45)] bg-[rgba(255,230,230,0.35)] text-[var(--bazi-danger)]`;
    default:
      return base;
  }
}

function ShenShaTypePill(props: { type: ShenShaItem["type"] }) {
  const cls =
    props.type === "ji"
      ? "bg-[rgba(74,167,148,0.18)] text-[var(--bazi-success)]"
      : props.type === "xiong"
        ? "bg-[rgba(200,80,80,0.12)] text-[#b45353]"
        : "bg-[var(--surface-soft)] text-[var(--text-muted)]";
  const t = props.type === "ji" ? "吉" : props.type === "xiong" ? "凶" : "平";
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{t}</span>
  );
}

/** 大运 / 流年 / 流月：统一卡片布局（标题行 + 总述 + 四维 + 神煞） */
function FlowFortunePreviewCard(props: {
  title: ReactNode;
  row: {
    summary?: string;
    love?: string;
    wealth?: string;
    career?: string;
    health?: string;
  };
  shen_sha?: ShenShaItem[];
  shenShaEmptyHint: string;
  /** 流年「地支提示」等，渲染在四维与神煞之间 */
  betweenGridAndShenSha?: ReactNode;
}) {
  const r = props.row;
  return (
    <div className="home-landing-surface-inset rounded-xl p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-extrabold text-[var(--text-strong)]">{props.title}</div>
        <div className="text-[11px] text-[var(--text-muted)]">感情 · 财运 · 事业 · 健康</div>
      </div>
      {r.summary ? (
        <p className="mt-2 text-xs leading-relaxed text-[var(--text-main)]">{r.summary}</p>
      ) : null}
      <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] text-[var(--text-muted)] sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <span className="font-semibold text-[var(--text-main)]">感情：</span>
          {r.love || "—"}
        </div>
        <div>
          <span className="font-semibold text-[var(--text-main)]">财运：</span>
          {r.wealth || "—"}
        </div>
        <div>
          <span className="font-semibold text-[var(--text-main)]">事业：</span>
          {r.career || "—"}
        </div>
        <div>
          <span className="font-semibold text-[var(--text-main)]">健康：</span>
          {r.health || "—"}
        </div>
      </div>
      {props.betweenGridAndShenSha}
      <FlowShenShaRow items={props.shen_sha} emptyHint={props.shenShaEmptyHint} />
    </div>
  );
}

function FlowShenShaRow(props: { items?: ShenShaItem[]; emptyHint?: string }) {
  const items = props.items ?? [];
  if (!items.length) {
    return props.emptyHint ? <span className="mt-2 block text-[var(--text-muted)]">{props.emptyHint}</span> : null;
  }
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((s, idx) => (
        <span
          key={`${s.name}-${idx}-${s.basis ?? ""}`}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-2 py-0.5 text-[11px] text-[var(--text-main)]"
          title={s.basis ?? s.effect}
        >
          <span className="font-semibold">{s.name}</span>
          <ShenShaTypePill type={s.type} />
        </span>
      ))}
    </div>
  );
}

function PillarsShenShaGrid(props: {
  pillars: ChartRecord["pillars"];
  byPillar?: ChartRecord["shen_sha_by_pillar"];
  fallbackFlat?: ShenShaItem[];
  /** 外层已有折叠标题时，隐藏组件内大标题 */
  embedded?: boolean;
}) {
  const order = [
    { key: "year" as const, label: "年柱", gz: props.pillars.year },
    { key: "month" as const, label: "月柱", gz: props.pillars.month },
    { key: "day" as const, label: "日柱", gz: props.pillars.day },
    { key: "hour" as const, label: "时柱", gz: props.pillars.hour },
  ];
  return (
    <div className={props.embedded ? "pt-1" : "home-landing-surface-inset mt-5 p-4"}>
      {!props.embedded ? (
        <>
          <div className="text-sm font-extrabold text-[var(--text-strong)]">四柱神煞</div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            神煞挂在对应柱下；与黄历择日吉神不同，仅供文化娱乐参考。
          </p>
        </>
      ) : (
        <p className="mb-3 text-xs text-[var(--text-muted)]">神煞挂在对应柱下；与黄历择日吉神不同，仅供文化娱乐参考。</p>
      )}
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${props.embedded ? "" : "mt-3"}`}>
        {order.map((col) => {
          const fromBuckets = props.byPillar?.[col.key];
          const list: ShenShaItem[] =
            props.byPillar != null
              ? fromBuckets ?? []
              : col.key === "day"
                ? props.fallbackFlat ?? []
                : [];
          const isLegacyFlat = !props.byPillar && (props.fallbackFlat?.length ?? 0) > 0 && col.key === "day";
          return (
            <div key={col.key} className="home-landing-surface-inset rounded-xl p-3">
              <div className="text-xs font-semibold text-[var(--text-muted)]">
                {col.label} <span className="font-mono text-[var(--text-main)]">{col.gz}</span>
              </div>
              {isLegacyFlat ? (
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">以下为命盘神煞汇总（旧数据未分柱）：</p>
              ) : null}
              {list.length === 0 ? (
                <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                  {!props.byPillar && col.key !== "day" ? "—" : "本柱无神煞命中。"}
                </div>
              ) : (
                <ul className="mt-2 space-y-2">
                  {list.map((s) => (
                    <li key={`${col.key}-${s.name}-${s.basis ?? ""}`} className="text-xs text-[var(--text-main)]">
                      <span className="font-semibold">{s.name}</span>
                      <span className="ml-1.5">
                        <ShenShaTypePill type={s.type} />
                      </span>
                      <p className="mt-0.5 leading-relaxed text-[var(--text-muted)]">{s.effect}</p>
                      {s.basis ? (
                        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">依据：{s.basis}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BaziTopbar(props: { onOpenHelp: () => void }) {
  const nav = useNavigate();
  const [loggedIn, setLoggedIn] = useState(false);
  const loc = window.location.pathname + window.location.search;

  useEffect(() => {
    let cancelled = false;
    void authMe()
      .then((m) => {
        if (!cancelled) setLoggedIn(Boolean((m as any)?.logged_in));
      })
      .catch(() => {
        if (!cancelled) setLoggedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onLogout() {
    try {
      await authLogout();
    } finally {
      nav(`/login?next=${encodeURIComponent(loc)}`, { replace: true });
    }
  }

  return (
    <nav className="home-navbar">
      <Link to="/" className="home-logo-link" aria-label="返回首页">
        <div className="home-logo-circle" aria-hidden />
        <span className="home-logo-text">知行馆</span>
      </Link>
      <div className="home-navbar-actions">
        <button type="button" className="home-help-btn" onClick={props.onOpenHelp}>
          帮助中心
        </button>
        {loggedIn ? (
          <Button variant="secondary" size="sm" onClick={() => void onLogout()}>
            退出登录
          </Button>
        ) : null}
      </div>
    </nav>
  );
}

function explainError(message: string): string {
  if (!message) return "请求失败，请稍后重试";
  // Backend often returns JSON like {"error":"xxx","detail":"..."} as plain text.
  try {
    const j = JSON.parse(message);
    const code = String(j?.error || "");
    const detail = String(j?.detail || "");
    const merged = `${code}${detail ? `:${detail}` : ""}`;
    // Re-run mapping on merged string.
    return explainError(merged);
  } catch {
    // ignore
  }
  if (message.includes("missing_required_fields")) return "必填项未填写完整";
  if (message.includes("invalid_birth_datetime_format")) return "出生日期或时间格式不正确";
  if (message.includes("invalid_birth_datetime")) {
    if (message.includes("invalid_datetime")) {
      return "出生时间无效：请检查生日/出生时间/时区是否正确。";
    }
    if (message.includes("invalid_lunar_datetime")) {
      return "农历出生日期无效：请核对农历年月日是否存在、以及「闰月」开关是否勾对（仅闰 X 月时才需要勾选）。";
    }
    return "出生信息无效：请到「我的档案」检查历法（阳历/阴历）与生日是否匹配，以及省/市/区是否完整。";
  }
  if (message.includes("profile_incomplete")) return "档案信息未完善：请先补全历法、生日、出生时间、时区与省/市/区。";
  if (message.includes("invalid_timezone")) return "时区无效，请从列表中选择";
  if (message.includes("invalid_location")) return "出生地格式不正确，请用中文/英文城市名";
  if (message.includes("profile_name_required")) return "请输入档案名称";
  if (message.includes("profile_name_taken")) return "该档案名已存在，请换一个";
  if (message.includes("too_many_requests")) return "请求过于频繁，请稍后再试";
  if (message.includes("chart_id_and_anon_id_required")) return "缺少 anon_id";
  if (message.includes("chart_not_found")) return "排盘不存在或已过期";
  if (message.includes("request_timeout")) return "等待超时（全项常需 1–3 分钟）。请重试；若反复出现，请检查服务器 Caddy/Nginx 反代 read_timeout 是否 ≥300s。";
  if (message.includes("network_or_gateway"))
    return "连接被中断（常见于反代超时：全项常 >60s）。请在服务器 Caddy 的 reverse_proxy 内设置 transport http { read_timeout 300s; response_header_timeout 300s } 后 systemctl reload caddy，并执行 npm run build 后重启 PM2。";
  return message.slice(0, 160);
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

/** 灵犀等长耗时 GET；带超时避免网关断连后界面一直转圈 */
async function getJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as T;
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    const msg = e instanceof Error ? e.message : String(e);
    if (name === "AbortError") throw new Error("request_timeout");
    if (/failed to fetch|load failed|networkerror|network request failed/i.test(msg)) {
      throw new Error("network_or_gateway");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function FormField(props: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={props.full ? "min-w-0 sm:col-span-2" : "min-w-0"}>
      <label className="text-xs font-semibold text-[var(--text-muted)]">{props.label}</label>
      {props.children}
    </div>
  );
}

function InputClassName() {
  return "bazi-form-input mt-1 block h-10 min-w-0 max-w-full w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--focus-ring)]";
}

function ComboInputClassName() {
  return "h-10 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--focus-ring)]";
}

export function BaziPage() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const shareChartIdFromQuery = params.get("chart_id") || "";
  const internalChartIdFromQuery = params.get("cid") || "";
  const fromShare = Boolean(shareChartIdFromQuery);
  const aiOpenFromQuery = String(params.get("ai") || "") === "1";
  const aiModeFromQueryRaw = String(params.get("mode") || "").trim().toLowerCase();
  const aiModeFromQuery:
    | "full"
    | "career"
    | "wealth"
    | "love"
    | "children"
    | "kinship"
    | "health"
    | "study"
    | null =
    aiModeFromQueryRaw === "career"
      ? "career"
      : aiModeFromQueryRaw === "wealth"
        ? "wealth"
        : aiModeFromQueryRaw === "love"
          ? "love"
          : aiModeFromQueryRaw === "children"
            ? "children"
            : aiModeFromQueryRaw === "kinship"
              ? "kinship"
              : aiModeFromQueryRaw === "health"
                ? "health"
                : aiModeFromQueryRaw === "study"
                  ? "study"
                  : aiModeFromQueryRaw === "full"
                    ? "full"
                    : null;
  const tabFromQuery = String(params.get("tab") || "").trim().toLowerCase();
  const initialTab: "bazi" | "hepan" = tabFromQuery === "hepan" ? "hepan" : "bazi";
  const profileIdFromQuery = useMemo(() => {
    const raw = String(params.get("profile_id") || "").trim();
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [params]);

  const [activeTab, setActiveTab] = useState<"bazi" | "hepan">(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const [birthDate, setBirthDate] = useState("1998-10-21");
  const [birthTime, setBirthTime] = useState("09:20");
  const [calendarType, setCalendarType] = useState<CalendarType>("solar");
  const [gender, setGender] = useState<0 | 1>(1);
  const [timezone, setTimezone] = useState("Asia/Shanghai");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [county, setCounty] = useState("");
  const [regionMod, setRegionMod] = useState<ChinaRegionModule | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("../../lib/chinaRegion").then((m) => {
      if (!cancelled) setRegionMod(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sessionId = useMemo(() => `web_${Date.now()}`, []);
  const anonId = "guest";
  const location = useMemo(() => `${province}${city}${county}`.trim(), [province, city, county]);
  const provinceOptions = useMemo(
    () => (regionMod ? regionMod.filterProvinces(province) : []),
    [regionMod, province]
  );
  const cityOptions = useMemo(
    () => (regionMod ? regionMod.filterCities(province, city) : []),
    [regionMod, province, city]
  );
  const countyOptions = useMemo(
    () => (regionMod ? regionMod.filterDistricts(province, city, county) : []),
    [regionMod, province, city, county]
  );

  const [statusText, setStatusText] = useState<string>("");
  const [statusTone, setStatusTone] = useState<BaziStatusTone>("idle");
  const [busy, setBusy] = useState(false);

  function setStatus(text: string, tone: BaziStatusTone) {
    setStatusText(text);
    setStatusTone(tone);
  }

  const [chart, setChart] = useState<ChartRecord | null>(null);
  /** 排盘成功后默认展示命盘与报告；仅当用户点击「全项」或任一专项解读后为 true */
  const [showAiReading, setShowAiReading] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiMessages, setAiMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAsking, setAiAsking] = useState(false);
  const aiChatScrollRef = useRef<HTMLDivElement | null>(null);
  /** 大模型解读请求进行中：解读结果区显示占位与预计时长 */
  const [aiGenerating, setAiGenerating] = useState(false);
  /** 同步防连点：避免 React 批处理下第二次请求在 busy 生效前发出 */
  const genAiInFlightRef = useRef(false);
  /** 最近一次 AI 解读模板：与接口 analyst_mode 一致 */
  const [aiAnalystMode, setAiAnalystMode] = useState<
    "full" | "career" | "wealth" | "love" | "children" | "kinship" | "health" | "study" | null
  >(null);
  const [shareUrl, setShareUrl] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [authLoggedIn, setAuthLoggedIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<number | null>(null);
  const [archiveLocation, setArchiveLocation] = useState("");
  const [createArchiveOpen, setCreateArchiveOpen] = useState(false);
  const [createArchiveName, setCreateArchiveName] = useState("");
  const [createArchiveErr, setCreateArchiveErr] = useState("");
  const [creatingArchive, setCreatingArchive] = useState(false);
  const createArchiveInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void authMe()
      .then((m) => {
        if (cancelled) return;
        const logged = Boolean((m as any)?.logged_in);
        setAuthLoggedIn(logged);
        if (!logged) return;
        return listProfiles()
          .then((out) => {
            if (cancelled) return;
            const ps = (out.profiles || []) as Profile[];
            setProfiles(ps);
            if (profileIdFromQuery && ps.some((p) => p.id === profileIdFromQuery)) {
              setActiveProfileId(profileIdFromQuery);
            } else {
              setActiveProfileId(ps[0]?.id ?? null);
            }
          })
          .catch(() => {
            if (!cancelled) setProfiles([]);
          });
      })
      .catch(() => {
        if (!cancelled) setAuthLoggedIn(false);
      })
      .finally(() => {
        if (!cancelled) setAuthChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [profileIdFromQuery]);

  useEffect(() => {
    let cancelled = false;
    if (!authLoggedIn || !activeProfileId) {
      return;
    }
    void getProfile(activeProfileId)
      .then((out) => {
        if (cancelled) return;
        const p = out.profile as Profile;
        const meta = (p.meta ?? {}) as Record<string, unknown>;
        const bd = typeof meta.birth_date === "string" ? meta.birth_date.trim() : "";
        const bt = typeof meta.birth_time === "string" ? meta.birth_time.trim() : "";
        const tz = typeof meta.birth_timezone === "string" ? meta.birth_timezone.trim() : "";
        const cal = typeof meta.birth_calendar_type === "string" ? meta.birth_calendar_type.trim().toLowerCase() : "";
        const region =
          meta.birth_region && typeof meta.birth_region === "object"
            ? (meta.birth_region as any as { province?: string; city?: string; district?: string })
            : null;
        const locFromRegion = `${String(region?.province || "")}${String(region?.city || "")}${String(region?.district || "")}`.trim();
        const loc = (typeof meta.birth_location === "string" ? meta.birth_location.trim() : "") || locFromRegion;
        const g = meta.gender === 0 || meta.gender === 1 ? meta.gender : Number(meta.gender) === 0 ? 0 : 1;
        if (bd) setBirthDate(bd);
        if (bt) setBirthTime(normalizeBirthTimeForForm(bt));
        if (tz) setTimezone(tz);
        setCalendarType(cal === "lunar" ? "lunar" : "solar");
        setArchiveLocation(loc);
        if (region?.province) setProvince(String(region.province));
        if (region?.city) setCity(String(region.city));
        if (region?.district) setCounty(String(region.district));
        if (loc && !(region?.province || region?.city || region?.district)) {
          void import("../../lib/chinaRegion").then((m) => {
            if (cancelled) return;
            const r = m.deriveRegionTripleFromLocation(loc);
            if (r.province) setProvince(r.province);
            if (r.city) setCity(r.city);
            if (r.district) setCounty(r.district);
          });
        }
        setGender(g);
      })
      .catch(() => {
        // ignore
      });
    return () => {
      cancelled = true;
    };
     
  }, [authLoggedIn, activeProfileId]);

  const timezoneLabel = useMemo(() => {
    const t = (timezone || "").trim();
    if (!t) return "";
    return TIMEZONE_OPTIONS_ZH.find((x) => x.iana === t)?.labelZh || t;
  }, [timezone]);

  useEffect(() => {
    if (!createArchiveOpen) return;
    setCreateArchiveErr("");
    const t = window.setTimeout(() => createArchiveInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [createArchiveOpen]);

  const liuNian = useMemo(
    () => chart?.fortune_cycles?.liu_nian_preview?.slice(0, 12) ?? [],
    [chart]
  );
  const liuYue = useMemo(
    () => chart?.fortune_cycles?.liu_yue_preview?.slice(0, 24) ?? [],
    [chart]
  );

  const fiveElLabel = (k: string) =>
    k === "wood" ? "木" : k === "fire" ? "火" : k === "earth" ? "土" : k === "metal" ? "金" : k === "water" ? "水" : k;

  const strengthLevelLabel = useMemo(() => {
    const v = chart?.day_master?.strength_level;
    if (v === "weak") return "偏弱";
    if (v === "strong") return "偏强";
    if (v === "balanced") return "中和";
    return v || "";
  }, [chart?.day_master?.strength_level]);

  async function track(event_name: string, extra?: Record<string, unknown>) {
    try {
      await postJson("/api/events/track", {
        event_name,
        anon_id: anonId.trim() || "guest",
        session_id: sessionId,
        chart_id: chart?.chart_id,
        ...extra,
      });
    } catch {
      // ignore
    }
  }

  async function loadFromChartId(chartId: string) {
    setBusy(true);
    setShareUrl("");
    setShowAiReading(false);
    setAiGenerating(false);
    setAiText("");
    setAiMessages([]);
    setAiQuestion("");
    setAiAnalystMode(null);
    setStatus("正在从分享链接加载...", "pending");
    try {
      const chartUrl = `/api/bazi/chart?chart_id=${encodeURIComponent(chartId)}`;
      let fullChart: ChartRecord | null = null;
      try {
        fullChart = await getJson<ChartRecord>(chartUrl);
      } catch {
        fullChart = null;
      }
      if (fullChart) {
        setChart(fullChart);
        if (fullChart.calendar_meta?.input_calendar)
          setCalendarType(fullChart.calendar_meta.input_calendar);
        if (fullChart.gender === 0 || fullChart.gender === 1) setGender(fullChart.gender);
        setTimezone(fullChart.birth_timezone?.trim() || "Asia/Shanghai");
        let hasDate = false;
        let hasTime = false;
        if (fullChart.birth_date && /^\d{4}-\d{2}-\d{2}$/.test(fullChart.birth_date)) {
          setBirthDate(fullChart.birth_date);
          hasDate = true;
        }
        if (fullChart.birth_time && /\d{1,2}:\d{2}/.test(fullChart.birth_time)) {
          setBirthTime(normalizeBirthTimeForForm(fullChart.birth_time));
          hasTime = true;
        }
        if ((!hasDate || !hasTime) && fullChart.calendar_meta?.solar_datetime) {
          const dt = deriveBirthFromSolarDatetime(fullChart.calendar_meta.solar_datetime);
          if (dt) {
            if (!hasDate) setBirthDate(dt.date);
            if (!hasTime) setBirthTime(dt.time);
          }
        }
        if (fullChart.birth_location) {
          const { deriveRegionTripleFromLocation } = await import("../../lib/chinaRegion");
          const r = deriveRegionTripleFromLocation(fullChart.birth_location);
          if (r.province) setProvince(r.province);
          if (r.city) setCity(r.city);
          if (r.district) setCounty(r.district);
        }
      } else {
        setChart({
          chart_id: chartId,
          basic_summary: "来自分享链接（未能加载完整命盘快照）",
          pillars: { year: "-", month: "-", day: "-", hour: "-" },
          five_elements: {},
        });
      }
      setStatus("已从分享链接加载。", "success");
    } catch (e) {
      setStatus(`分享链接加载失败：${explainError((e as any)?.message || "")}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function run(opts?: { refresh?: boolean }) {
    if (!authLoggedIn) {
      setStatus("请先登录后再排盘（登录后可保存历史记录）。", "error");
      return;
    }
    if (!activeProfileId) {
      setStatus("请先选择/创建一个“档案”。", "error");
      return;
    }
    setBusy(true);
    setShareUrl("");
    setShowAiReading(false);
    setAiGenerating(false);
    setAiText("");
    setAiMessages([]);
    setAiQuestion("");
    setAiAnalystMode(null);
    setStatus("正在排盘并生成报告...", "pending");
    try {
      const c = await postJson<ChartRecord>("/api/bazi/calculate", {
        profile_id: activeProfileId,
        refresh: Boolean(opts?.refresh),
      });
      setChart(c);
      await track("report_view");
      setStatus(
        c.from_cache
          ? "已复用最近一次排盘结果（档案未变更）。"
          : "完成：右侧为命盘数据；需要时再点「全项」等查看灵犀解读。",
        "success"
      );
    } catch (e) {
      setStatus(`失败：${explainError((e as any)?.message || "")}`, "error");
    } finally {
      setBusy(false);
    }
  }

  function storageKeyFor(chartId: string, mode: string) {
    return `bazi_ai_chat:${chartId}:${mode}`;
  }

  function loadChatFromStorage(chartId: string, mode: string) {
    try {
      const raw = window.localStorage.getItem(storageKeyFor(chartId, mode));
      if (!raw) return null;
      const obj = JSON.parse(raw) as any;
      if (!obj || typeof obj !== "object") return null;
      const msgs = Array.isArray(obj.messages) ? obj.messages : null;
      if (!msgs) return null;
      return msgs
        .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .map((m: any) => ({ role: m.role as "user" | "assistant", content: String(m.content) }));
    } catch {
      return null;
    }
  }

  function saveChatToStorage(chartId: string, mode: string, messages: Array<{ role: "user" | "assistant"; content: string }>) {
    try {
      window.localStorage.setItem(
        storageKeyFor(chartId, mode),
        JSON.stringify({ chart_id: chartId, mode, messages, updated_at: Date.now() })
      );
    } catch {
      // ignore
    }
  }

  // Keep URL synced with current chart_id (internal restore: use cid to avoid "share link" mode).
  useEffect(() => {
    const id = chart?.chart_id || "";
    if (!id) return;
    const sp = new URLSearchParams(params);
    if (sp.get("cid") !== id) {
      sp.set("cid", id);
      setParams(sp, { replace: true });
    }
  }, [chart?.chart_id, params, setParams]);

  // Restore chat by URL (ai=1&mode=...) after chart is available.
  useEffect(() => {
    const id = chart?.chart_id || "";
    if (!id) return;
    if (!aiOpenFromQuery) return;
    const mode = aiModeFromQuery || "full";
    if (internalChartIdFromQuery && internalChartIdFromQuery !== id) return;
    // Switch to reading view + mode.
    setShowAiReading(true);
    setAiAnalystMode(mode);
    const cachedMsgs = loadChatFromStorage(id, mode);
    if (cachedMsgs?.length) {
      setAiMessages(cachedMsgs);
      // best-effort set aiText to first assistant chunk for compatibility.
      const first = cachedMsgs.find((m: any) => m.role === "assistant")?.content || "";
      setAiText(first);
      return;
    }
    // If no local chat, fetch cached long reading and seed as first assistant message.
    setAiGenerating(true);
    setAiText("");
    setAiMessages([]);
    const q =
      mode === "career"
        ? `chart_id=${encodeURIComponent(id)}&mode=career`
        : mode === "wealth"
          ? `chart_id=${encodeURIComponent(id)}&mode=wealth`
          : mode === "love"
            ? `chart_id=${encodeURIComponent(id)}&mode=love`
            : mode === "children"
              ? `chart_id=${encodeURIComponent(id)}&mode=children`
              : mode === "kinship"
                ? `chart_id=${encodeURIComponent(id)}&mode=kinship`
                : mode === "health"
                  ? `chart_id=${encodeURIComponent(id)}&mode=health`
                  : mode === "study"
                    ? `chart_id=${encodeURIComponent(id)}&mode=study`
                    : `chart_id=${encodeURIComponent(id)}&mode=full`;
    void getJsonWithTimeout<AiResp>(`/api/reports/ai?${q}&_=${Date.now()}`, 300_000)
      .then((out) => {
        const t = out.ai_text || "AI暂无返回";
        setAiText(t);
        setAiMessages([{ role: "assistant", content: t }]);
      })
      .catch(() => {
        setAiMessages([{ role: "assistant", content: "解读加载失败，请点一次左侧按钮重新生成。" }]);
      })
      .finally(() => setAiGenerating(false));
  }, [chart?.chart_id, aiOpenFromQuery, aiModeFromQuery, internalChartIdFromQuery, setAiAnalystMode]);

  // Persist chat to localStorage (refresh won't lose).
  useEffect(() => {
    const id = chart?.chart_id || "";
    const mode = aiAnalystMode || "full";
    if (!id) return;
    if (!showAiReading) return;
    if (!aiMessages.length) return;
    saveChatToStorage(id, mode, aiMessages);
  }, [chart?.chart_id, aiAnalystMode, showAiReading, aiMessages]);

  async function genAi(
    mode: "full" | "career" | "wealth" | "love" | "children" | "kinship" | "health" | "study" = "full",
    /** 排盘刚返回时传入，避免 setState 尚未提交导致读不到 chart */
    chartOverride?: ChartRecord | null,
    opts?: { refresh?: boolean }
  ) {
    if (genAiInFlightRef.current) return;
    genAiInFlightRef.current = true;
    const ch = chartOverride ?? chart;
    if (!ch?.chart_id) {
      genAiInFlightRef.current = false;
      return;
    }
    // Cache-first UX: if user clicks the same mode again and we already have text,
    // don't re-request; keep current result unless user explicitly refreshes.
    if (!opts?.refresh && showAiReading && aiAnalystMode === mode && aiText.trim()) {
      const modeLabel =
        mode === "career"
          ? "事业"
          : mode === "wealth"
            ? "财运"
            : mode === "love"
              ? "婚恋"
              : mode === "children"
                ? "子女"
                : mode === "kinship"
                  ? "六亲"
                  : mode === "health"
                    ? "健康"
                    : mode === "study"
                      ? "学业"
                      : "全项";
      setStatus(`解读已就绪（${modeLabel}）`, "success");
      genAiInFlightRef.current = false;
      return;
    }
    setShowAiReading(true);
    const previousAi = aiText;
    setAiGenerating(true);
    setAiAnalystMode(mode);
    setAiText("");
    setAiMessages([]);
    const modeLabel =
      mode === "career"
        ? "事业"
        : mode === "wealth"
          ? "财运"
          : mode === "love"
            ? "婚恋"
            : mode === "children"
              ? "子女"
              : mode === "kinship"
                ? "六亲"
                : mode === "health"
                  ? "健康"
                  : mode === "study"
                    ? "学业"
                    : "全项";
    setStatus(`正在生成解读（${modeLabel}）…`, "pending");
    try {
      const id = encodeURIComponent(ch.chart_id);
      const q =
        mode === "career"
          ? `chart_id=${id}&mode=career`
          : mode === "wealth"
            ? `chart_id=${id}&mode=wealth`
            : mode === "love"
              ? `chart_id=${id}&mode=love`
              : mode === "children"
                ? `chart_id=${id}&mode=children`
                : mode === "kinship"
                  ? `chart_id=${id}&mode=kinship`
                  : mode === "health"
                    ? `chart_id=${id}&mode=health`
                    : mode === "study"
                      ? `chart_id=${id}&mode=study`
                      : `chart_id=${id}&mode=full`;
      const refreshQ = opts?.refresh ? "&refresh=1" : "";
      // 避免 GET 被浏览器缓存；命中服务端缓存时响应很快
      const out = await getJsonWithTimeout<AiResp>(`/api/reports/ai?${q}${refreshQ}&_=${Date.now()}`, 300_000);
      setAiText(out.ai_text || "AI暂无返回");
      setAiMessages([{ role: "assistant", content: out.ai_text || "AI暂无返回" }]);
      setAiAnalystMode(out.analyst_mode ?? mode);
      // Sync URL to restore reading view.
      const sp = new URLSearchParams(params);
      sp.set("cid", ch.chart_id);
      sp.set("ai", "1");
      sp.set("mode", String(out.analyst_mode ?? mode));
      setParams(sp, { replace: true });
      await track("ai_reading_view", { analyst_mode: out.analyst_mode ?? mode });
      setStatus(
        out.from_cache
          ? `解读已就绪（${modeLabel} · ${out.provider}）`
          : `解读已完成（${modeLabel} · ${out.provider}）。`,
        "success"
      );
    } catch (e) {
      setAiText(previousAi);
      setStatus(`解读失败：${explainError((e as any)?.message || "")}`, "error");
    } finally {
      genAiInFlightRef.current = false;
      setAiGenerating(false);
    }
  }

  async function share() {
    if (!chart) return;
    setBusy(true);
    setStatus("正在生成分享卡...", "pending");
    try {
      const out = await postJson<ShareRenderResp>("/api/share-cards/render", {
        chart_id: chart.chart_id,
        template_id: "default_v2",
        anon_id: anonId.trim() || "guest",
      });
      setShareUrl(out.share_url);
      await track("share_success");
      window.open(out.share_url, "_blank", "noopener,noreferrer");
      setStatus("分享链接已打开。", "success");
    } catch (e) {
      setStatus(`分享失败：${explainError((e as any)?.message || "")}`, "error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!showAiReading) return;
    const el = aiChatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [showAiReading, aiMessages.length]);

  async function askAi() {
    const ch = chart;
    const q = aiQuestion.trim();
    if (!ch?.chart_id || !q || aiAsking) return;
    setAiAsking(true);
    setAiQuestion("");
    setAiMessages((m) => [...m, { role: "user", content: q }]);
    try {
      const out = await postJson<{ answer: string }>(`/api/reports/ai/messages`, {
        chart_id: ch.chart_id,
        mode: aiAnalystMode ?? "full",
        question: q,
      });
      setAiMessages((m) => [...m, { role: "assistant", content: String((out as any)?.answer || "AI暂无返回") }]);
      // Ensure URL indicates we are in reading view for restore.
      const sp = new URLSearchParams(params);
      if (ch?.chart_id) sp.set("cid", ch.chart_id);
      sp.set("ai", "1");
      sp.set("mode", String(aiAnalystMode ?? "full"));
      setParams(sp, { replace: true });
    } catch {
      setAiMessages((m) => [...m, { role: "assistant", content: "追问失败，请稍后重试。" }]);
    } finally {
      setAiAsking(false);
    }
  }

  // auto-load from share link
  useEffect(() => {
    if (shareChartIdFromQuery) void loadFromChartId(shareChartIdFromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareChartIdFromQuery]);

  /** 大模型解读仅依赖排盘 chart_id；不与页面 busy（排盘/分享）强耦合，避免误锁按钮 */
  const canGenAi = Boolean(chart?.chart_id && !aiGenerating);
  const canShare = Boolean(chart?.chart_id && !busy);

  /**
   * 当前解读维度高亮：只跟 aiAnalystMode 走，不跟 showAiReading。
   * 否则点「返回命盘」后 showAiReading=false，专项全变灰、开始排盘又变主色，与「上次点的学业」不一致。
   */
  function aiModeButtonVariant(
    mode: NonNullable<typeof aiAnalystMode>
  ): "primary" | "secondary" {
    return aiAnalystMode === mode ? "primary" : "secondary";
  }

  useEffect(() => {
    const prev = document.title;
    document.title = "八字排盘·灵犀解读 · 知行馆";
    return () => {
      document.title = prev;
    };
  }, []);

  useEffect(() => {
    if (fromShare) return;
    if (activeTab !== "hepan") return;
    if (!authChecked) return;
    if (authLoggedIn) return;
    nav(`/login?next=${encodeURIComponent("/bazi?tab=hepan")}`, { replace: true });
  }, [activeTab, authChecked, authLoggedIn, fromShare, nav]);

  return (
    <div className="home-landing page-bazi pb-12">
      <BaziTopbar onOpenHelp={() => setHelpOpen(true)} />

      <header className="home-landing-header" aria-labelledby="bazi-page-title">
        <div className="home-landing-header-content">
          <h1 id="bazi-page-title" className="home-landing-title">
            八字排盘·灵犀解读
          </h1>
          <p className="home-landing-subline mt-2">真太阳时 · 大运 · 流年</p>
          {fromShare ? (
            <div className="home-landing-surface-inset mt-4 px-4 py-3 text-sm text-[var(--text-main)]">
              来自分享链接：已自动加载报告。可直接点「全项」「事业」「财运」「婚恋」「子女」「六亲」「健康」「学业」生成解读，或重新输入再排盘。
            </div>
          ) : null}
        </div>
        <Link to="/" className="home-landing-mascot shrink-0" aria-label="返回首页">
          <div className="home-landing-mascot-icon" aria-hidden />
          <div className="home-landing-mascot-text">可可爱爱小馆灵</div>
        </Link>
      </header>

      {!fromShare ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={
              activeTab === "bazi"
                ? "rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--text-strong)]"
                : "rounded-full border border-transparent bg-transparent px-3 py-1.5 text-sm font-semibold text-[var(--text-muted)] hover:border-[var(--border-soft)] hover:bg-[var(--surface-soft)]"
            }
            onClick={() => {
              setActiveTab("bazi");
              const sp = new URLSearchParams(params);
              sp.delete("tab");
              setParams(sp, { replace: true });
            }}
          >
            八字
          </button>
          <button
            type="button"
            className={
              activeTab === "hepan"
                ? "rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--text-strong)]"
                : "rounded-full border border-transparent bg-transparent px-3 py-1.5 text-sm font-semibold text-[var(--text-muted)] hover:border-[var(--border-soft)] hover:bg-[var(--surface-soft)]"
            }
            onClick={() => {
              setActiveTab("hepan");
              const sp = new URLSearchParams(params);
              sp.set("tab", "hepan");
              setParams(sp, { replace: true });
            }}
          >
            合盘
          </button>
        </div>
      ) : null}

      {activeTab === "hepan" && !fromShare ? (
        <HepanPanel loggedIn={authLoggedIn} profiles={profiles} initialProfileIdA={activeProfileId} />
      ) : (
        <section className="mt-2 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="home-landing-surface min-w-0 p-5 sm:p-6">
          {!authLoggedIn ? (
            <div className="home-landing-surface-inset mb-4 px-4 py-3 text-sm text-[var(--text-main)]">
              你还未登录：排盘计算已开启登录保护。请先{" "}
              <Link
                className="underline decoration-[rgba(74,120,108,0.45)] underline-offset-4"
                to={`/login?next=${encodeURIComponent(`/bazi${window.location.search || ""}`)}`}
              >
                登录
              </Link>{" "}
              或{" "}
              <Link
                className="underline decoration-[rgba(74,120,108,0.45)] underline-offset-4"
                to={`/register?next=${encodeURIComponent(`/bazi${window.location.search || ""}`)}`}
              >
                注册
              </Link>
              。
            </div>
          ) : null}
          {authLoggedIn ? (
            <div className="mb-3 flex flex-wrap items-end gap-2">
              <div className="min-w-[14rem]">
                <label className="text-xs font-semibold text-[var(--text-muted)]">档案</label>
                <select
                  className={InputClassName()}
                  value={String(activeProfileId ?? "")}
                  onChange={(e) => setActiveProfileId(Number(e.target.value) || null)}
                >
                  <option value="">请选择档案</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="secondary"
                onClick={async () => {
                  setCreateArchiveName("");
                  setCreateArchiveErr("");
                  setCreateArchiveOpen(true);
                }}
              >
                新建档案
              </Button>
            </div>
          ) : null}
          {authLoggedIn ? (
            <div className="home-landing-surface-inset mb-4 px-4 py-3 text-sm text-[var(--text-main)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">排盘将使用档案出生信息（不可在此页手填修改）。</span>
                {activeProfileId ? (
                  <Link className="underline decoration-[rgba(74,120,108,0.45)] underline-offset-4" to={`/my/profiles?edit=${encodeURIComponent(String(activeProfileId))}`}>
                    去完善档案
                  </Link>
                ) : null}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-[var(--text-muted)] sm:grid-cols-2">
                <div>出生日期：{birthDate || "—"}</div>
                <div>出生时间：{birthTime || "—"}</div>
                <div>性别：{gender === 0 ? "女" : "男"}</div>
                <div>时区：{timezoneLabel || "—"}</div>
                <div>出生地：{archiveLocation || location || "—"}</div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-[var(--text-muted)]">
                  历法：<span className="font-semibold text-[var(--text-main)]">{calendarType === "lunar" ? "阴历（农历）" : "阳历（公历）"}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="出生日期">
                <input
                  className={InputClassName()}
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </FormField>
              <FormField label="出生时间">
                <input
                  className={InputClassName()}
                  type="time"
                  value={birthTime}
                  onChange={(e) => setBirthTime(e.target.value)}
                />
              </FormField>
              <FormField label="历法">
                <select
                  className={InputClassName()}
                  value={calendarType}
                  onChange={(e) => setCalendarType((e.target.value as CalendarType) || "solar")}
                >
                  <option value="solar">阳历（公历）</option>
                  <option value="lunar">阴历（农历）</option>
                </select>
              </FormField>
              <FormField label="性别">
                <select
                  className={InputClassName()}
                  value={String(gender)}
                  onChange={(e) => setGender(e.target.value === "0" ? 0 : 1)}
                >
                  <option value="1">男</option>
                  <option value="0">女</option>
                </select>
              </FormField>
              <FormField label="时区">
                <select
                  className={InputClassName()}
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  {TIMEZONE_OPTIONS_ZH.map((z) => (
                    <option key={z.iana} value={z.iana}>
                      {z.labelZh}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="出生地">
                <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <RegionCombobox
                    value={province}
                    disabled={!regionMod}
                    options={provinceOptions}
                    placeholder="省份"
                    inputClassName={ComboInputClassName()}
                    emptyHint="暂无省份数据"
                    onValueChange={(v) => {
                      setProvince(v);
                      setCity("");
                      setCounty("");
                    }}
                    onInputBlur={(v) => {
                      if (!regionMod) return;
                      const r = regionMod.resolveProvince(v);
                      if (r !== v) {
                        setProvince(r);
                        setCity("");
                        setCounty("");
                      }
                    }}
                  />
                  <RegionCombobox
                    value={city}
                    disabled={!regionMod || !province}
                    options={cityOptions}
                    placeholder="城市"
                    inputClassName={ComboInputClassName()}
                    emptyHint={province ? "暂无匹配城市" : "请先选择省份"}
                    onValueChange={(v) => {
                      setCity(v);
                      setCounty("");
                    }}
                    onInputBlur={(v) => {
                      if (!regionMod) return;
                      const r = regionMod.resolveCity(province, v);
                      if (r !== v) {
                        setCity(r);
                        setCounty("");
                      }
                    }}
                  />
                  <RegionCombobox
                    value={county}
                    disabled={!regionMod || !province || !city}
                    options={countyOptions}
                    placeholder="区县"
                    inputClassName={ComboInputClassName()}
                    emptyHint={province && city ? "暂无匹配区县" : "请先选择省市"}
                    onValueChange={setCounty}
                    onInputBlur={(v) => {
                      if (!regionMod) return;
                      const r = regionMod.resolveDistrict(province, city, v);
                      if (r !== v) setCounty(r);
                    }}
                  />
                </div>
              </FormField>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant={aiAnalystMode ? "secondary" : "primary"}
              onClick={() => void run()}
              disabled={busy || !authLoggedIn}
              title={!authLoggedIn ? "请先登录后再排盘" : undefined}
            >
              开始排盘
            </Button>
            <Button
              variant={aiModeButtonVariant("full")}
              onClick={() => void genAi("full")}
              disabled={!canGenAi}
              title="多维度命盘分析；再次点击将优先使用缓存"
            >
              全项
            </Button>
            <Button variant={aiModeButtonVariant("career")} onClick={() => void genAi("career")} disabled={!canGenAi} title="仅事业维度；再次点击将优先使用缓存">
              事业
            </Button>
            <Button variant={aiModeButtonVariant("wealth")} onClick={() => void genAi("wealth")} disabled={!canGenAi} title="仅财运维度；再次点击将优先使用缓存">
              财运
            </Button>
            <Button variant={aiModeButtonVariant("love")} onClick={() => void genAi("love")} disabled={!canGenAi} title="仅婚恋维度；再次点击将优先使用缓存">
              婚恋
            </Button>
            <Button variant={aiModeButtonVariant("children")} onClick={() => void genAi("children")} disabled={!canGenAi} title="仅子女维度；再次点击将优先使用缓存">
              子女
            </Button>
            <Button variant={aiModeButtonVariant("kinship")} onClick={() => void genAi("kinship")} disabled={!canGenAi} title="仅六亲维度；再次点击将优先使用缓存">
              六亲
            </Button>
            <Button variant={aiModeButtonVariant("health")} onClick={() => void genAi("health")} disabled={!canGenAi} title="仅健康维度；再次点击将优先使用缓存">
              健康
            </Button>
            <Button variant={aiModeButtonVariant("study")} onClick={() => void genAi("study")} disabled={!canGenAi} title="仅学业维度；再次点击将优先使用缓存">
              学业
            </Button>
            <Button variant="secondary" onClick={() => void share()} disabled={!canShare}>
              生成分享卡
            </Button>
          </div>

          <div className={baziStatusBannerClass(statusText.trim() === "" ? "idle" : statusTone)}>
            <span className={statusText.trim() !== "" && statusTone === "pending" ? "bazi-status-pending" : undefined}>
              {statusText || "准备就绪。"}
            </span>
            {shareUrl ? (
              <div className="mt-2 text-xs text-[var(--text-muted)]">
                分享链接：
                <a className="ml-1 underline decoration-[rgba(74,120,108,0.45)] underline-offset-4" href={shareUrl} target="_blank" rel="noreferrer">
                  打开
                </a>
              </div>
            ) : null}
          </div>

          <details className="home-landing-surface-inset mt-4 p-4 text-sm text-[var(--text-muted)]">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--text-main)]">术语说明（流年/大运/十神/神煞）</summary>
            <ul className="mt-3 list-disc pl-5">
              <li>
                <span className="font-semibold text-[var(--text-main)]">流年</span>：每一年的环境变化，可看年度节奏。
              </li>
              <li>
                <span className="font-semibold text-[var(--text-main)]">大运</span>：十年一个阶段，决定长期主旋律。
              </li>
              <li>
                <span className="font-semibold text-[var(--text-main)]">十神</span>：日主与其他干支关系，反映行为模式。
              </li>
              <li>
                <span className="font-semibold text-[var(--text-main)]">神煞</span>：辅助标签，提示机会与风险，不单点决定。
              </li>
            </ul>
          </details>
        </div>

        <div className="home-landing-surface min-w-0 overflow-x-auto p-5 sm:p-6">
          {!chart ? (
            <div className="text-sm text-[var(--text-muted)]">
              结果区：完成「开始排盘」后，右侧将展示四柱、大运、流年与新手版结论等；点「全项」或专项按钮可切换为灵犀解读正文。
            </div>
          ) : !showAiReading ? (
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-extrabold text-[var(--text-strong)]">排盘结果</h2>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy || !authLoggedIn || !activeProfileId}
                    onClick={() => void run({ refresh: true })}
                    title="强制重新排盘（不会命中缓存）"
                  >
                    强制重算
                  </Button>
                </div>
              </div>

              <details className="home-landing-surface-inset p-4" open>
                <summary className="cursor-pointer text-sm font-extrabold text-[var(--text-strong)]">四柱与简评</summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge>年柱 {chart.pillars.year}</Badge>
                  <Badge>月柱 {chart.pillars.month}</Badge>
                  <Badge>日柱 {chart.pillars.day}</Badge>
                  <Badge>时柱 {chart.pillars.hour}</Badge>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[var(--text-main)]">{chart.basic_summary}</p>
              </details>

              <details className="home-landing-surface-inset p-4" open>
                <summary className="cursor-pointer text-sm font-extrabold text-[var(--text-strong)]">命盘与数据</summary>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {Object.entries(chart.five_elements || {}).map(([k, v]) => (
                    <div key={k} className="home-landing-surface-inset rounded-lg px-2 py-2 text-center">
                      <div className="text-[11px] text-[var(--text-muted)]">{fiveElLabel(k)}</div>
                      <div className="text-lg font-extrabold text-[var(--text-strong)]">{v}</div>
                    </div>
                  ))}
                </div>
                <ul className="mt-3 space-y-1 text-xs text-[var(--text-muted)]">
                  <li>出生地：{chart.birth_location ?? "—"}</li>
                  <li>真太阳时：{chart.true_solar_time ?? "—"}</li>
                  <li>节气：{chart.jie_qi_window?.current ?? chart.jie_qi ?? "—"}</li>
                  <li>格局：{chart.ge_ju ?? "—"}</li>
                  {chart.day_master ? (
                    <>
                      <li>
                        日主强弱：{strengthLevelLabel || "—"}（{chart.day_master.strength_score}）
                      </li>
                      <li>喜用：{(chart.day_master.useful_elements ?? []).join("、") || "—"}</li>
                      <li>忌神：{(chart.day_master.avoid_elements ?? []).join("、") || "—"}</li>
                    </>
                  ) : null}
                </ul>
              </details>

              <details className="home-landing-surface-inset p-4">
                <summary className="cursor-pointer text-sm font-extrabold text-[var(--text-strong)]">四柱神煞</summary>
                <PillarsShenShaGrid
                  embedded
                  pillars={chart.pillars}
                  byPillar={chart.shen_sha_by_pillar}
                  fallbackFlat={chart.shen_sha}
                />
              </details>

              {chart.fortune_cycles?.da_yun && chart.fortune_cycles.da_yun.length > 0 ? (
                <details className="home-landing-surface-inset p-4">
                  <summary className="cursor-pointer text-sm font-extrabold text-[var(--text-strong)]">大运</summary>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">十年一运；天干对日主十神与流年同模板；神煞为辅助标签。</p>
                  <div className="mt-3 space-y-3">
                    {chart.fortune_cycles.da_yun.map((d) => (
                      <FlowFortunePreviewCard
                        key={`${d.gan_zhi}-${d.start_year}`}
                        title={
                          <>
                            <span className="font-mono text-[var(--text-main)]">{d.gan_zhi}</span>
                            <span className="ml-2 text-[var(--text-muted)]">
                              {d.start_year}–{d.end_year}
                            </span>
                          </>
                        }
                        row={d}
                        shen_sha={d.shen_sha as ShenShaItem[] | undefined}
                        shenShaEmptyHint="本运无神煞标注。"
                      />
                    ))}
                  </div>
                </details>
              ) : null}

              {liuNian.length > 0 ? (
                <details className="home-landing-surface-inset p-4">
                  <summary className="cursor-pointer text-sm font-extrabold text-[var(--text-strong)]">流年</summary>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">年度环境变化（预览）。</p>
                  <div className="mt-3 space-y-3">
                    {liuNian.map((y) => {
                      const tip = chart.user_readable?.liu_nian_tips?.find((t) => t.year === y.year);
                      return (
                        <FlowFortunePreviewCard
                          key={y.year}
                          title={
                            <>
                              {y.year}{" "}
                              <span className="font-mono text-[var(--text-main)]">（{y.gan_zhi}）</span>
                            </>
                          }
                          row={y}
                          shen_sha={y.shen_sha as ShenShaItem[] | undefined}
                          shenShaEmptyHint="本年无神煞标注。"
                          betweenGridAndShenSha={
                            tip ? (
                              <p className="mt-2 text-xs text-[var(--text-muted)]">
                                <span className="font-semibold text-[var(--text-main)]">{tip.label}：</span>
                                {tip.tip}
                              </p>
                            ) : null
                          }
                        />
                      );
                    })}
                  </div>
                </details>
              ) : null}

              {liuYue.length > 0 ? (
                <details className="home-landing-surface-inset p-4">
                  <summary className="cursor-pointer text-sm font-extrabold text-[var(--text-strong)]">流月</summary>
                  <p className="mt-2 text-xs text-[var(--text-muted)]">月度节奏（预览）。</p>
                  <div className="mt-3 space-y-3">
                    {liuYue.map((m) => (
                      <FlowFortunePreviewCard
                        key={`${m.year}-${m.month}-${m.gan_zhi}`}
                        title={
                          <>
                            {m.year} 年 {m.month} 月{" "}
                            <span className="font-mono text-[var(--text-main)]">（{m.gan_zhi}）</span>
                          </>
                        }
                        row={m}
                        shen_sha={m.shen_sha as ShenShaItem[] | undefined}
                        shenShaEmptyHint="本月无神煞标注。"
                      />
                    ))}
                  </div>
                </details>
              ) : null}

              {chart.user_readable ? (
                <details className="home-landing-surface-inset p-4">
                  <summary className="cursor-pointer text-sm font-extrabold text-[var(--text-strong)]">新手版结论</summary>
                  <div className="mt-3 space-y-3 text-sm text-[var(--text-main)]">
                    <div className="home-landing-surface-inset rounded-xl p-3">
                      <div className="text-xs font-semibold text-[var(--text-muted)]">一句话</div>
                      <p className="mt-1">{chart.user_readable.one_line || chart.basic_summary}</p>
                    </div>
                    <div className="home-landing-surface-inset rounded-xl p-3">
                      <div className="text-xs font-semibold text-[var(--text-muted)]">怎么做</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {(chart.user_readable.actions ?? []).map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="home-landing-surface-inset rounded-xl p-3">
                      <div className="text-xs font-semibold text-[var(--text-muted)]">要注意</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {(chart.user_readable.cautions ?? []).map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </details>
              ) : null}
            </div>
          ) : (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-extrabold text-[var(--text-strong)]">解读结果</span>
                {aiAnalystMode ? (
                  <Badge>
                    {aiAnalystMode === "career"
                      ? "事业"
                      : aiAnalystMode === "wealth"
                        ? "财运"
                        : aiAnalystMode === "love"
                          ? "婚恋"
                          : aiAnalystMode === "children"
                            ? "子女"
                            : aiAnalystMode === "kinship"
                              ? "六亲"
                              : aiAnalystMode === "health"
                                ? "健康"
                                : aiAnalystMode === "study"
                                  ? "学业"
                                  : "全项"}
                  </Badge>
                ) : null}
                <div className="ml-auto flex items-center gap-2">
                  <span className="hidden rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-1 text-xs text-[var(--text-muted)] sm:inline">
                    本内容由 AI 生成，仅供参考
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={aiGenerating || !chart?.chart_id}
                    onClick={() => void genAi(aiAnalystMode ?? "full", chart, { refresh: true })}
                    title="强制重新生成（不会命中缓存）"
                  >
                    重新生成
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowAiReading(false);
                      const sp = new URLSearchParams(params);
                      sp.delete("ai");
                      sp.delete("mode");
                      setParams(sp, { replace: true });
                    }}
                  >
                    返回命盘
                  </Button>
                </div>
              </div>
              {aiGenerating ? <p className="mt-1 text-xs text-[var(--text-muted)]">正在请求大模型…</p> : null}

              <div className="home-landing-surface-inset mt-3 min-h-[min(52vh,28rem)] border border-[rgba(74,120,108,0.22)] bg-[rgba(74,120,108,0.04)] p-3 sm:p-4">
                {aiGenerating ? (
                  <div
                    className="flex min-h-[min(48vh,26rem)] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--border-soft)] bg-[var(--surface-panel)] px-4 py-10 text-center"
                    role="status"
                    aria-live="polite"
                  >
                    <p className="text-base font-semibold text-[var(--text-strong)]">正在生成…</p>
                    <p className="max-w-[20rem] text-sm text-[var(--text-muted)]">
                      预计约 <span className="font-semibold text-[var(--text-main)]">1–3 分钟</span>
                      （「全项」更长；超过 5 分钟请稍后重试）
                    </p>
                  </div>
                ) : (
                  <div className="min-h-[min(48vh,26rem)] rounded-lg border border-[var(--border-soft)] bg-[var(--surface-panel)]">
                    <div ref={aiChatScrollRef} className="max-h-[min(48vh,26rem)] overflow-auto p-3 text-sm text-[var(--text-main)]">
                      {aiMessages.length ? (
                        <div className="grid gap-2">
                          {aiMessages.map((m, idx) => {
                            const isUser = m.role === "user";
                            return (
                              <div key={idx} className={["flex", isUser ? "justify-end" : "justify-start"].join(" ")}>
                                <div
                                  className={[
                                    "max-w-[92%] rounded-2xl border px-3 py-2 leading-6 shadow-sm",
                                    isUser
                                      ? "border-[rgba(74,167,148,0.35)] bg-[rgba(74,167,148,0.10)] text-[var(--text-strong)]"
                                      : "border-[var(--border-soft)] bg-white/65 text-[var(--text-main)]",
                                  ].join(" ")}
                                >
                                  {isUser ? (
                                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                                  ) : (
                                    <div className="break-words">
                                      <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeSanitize]}
                                        components={{
                                          h1: ({ children }) => <div className="mb-2 mt-1 text-base font-semibold">{children}</div>,
                                          h2: ({ children }) => <div className="mb-2 mt-2 text-sm font-semibold">{children}</div>,
                                          h3: ({ children }) => <div className="mb-1.5 mt-2 text-sm font-semibold">{children}</div>,
                                          p: ({ children }) => <div className="whitespace-pre-wrap">{children}</div>,
                                          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
                                          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
                                          li: ({ children }) => <li className="leading-6">{children}</li>,
                                          blockquote: ({ children }) => (
                                            <blockquote className="my-2 border-l-2 border-[rgba(148,163,184,0.55)] pl-3 text-[var(--text-muted)]">
                                              {children}
                                            </blockquote>
                                          ),
                                          strong: ({ children }) => (
                                            <strong className="rounded bg-[rgba(250,204,21,0.22)] px-1 py-0.5 font-semibold text-[var(--text-strong)]">
                                              {children}
                                            </strong>
                                          ),
                                          em: ({ children }) => (
                                            <em className="font-medium not-italic underline decoration-[rgba(250,204,21,0.55)] underline-offset-2">
                                              {children}
                                            </em>
                                          ),
                                          a: ({ href, children }) => (
                                            <a
                                              href={href}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="underline decoration-[rgba(74,167,148,0.45)] underline-offset-2 hover:decoration-[rgba(74,167,148,0.75)]"
                                            >
                                              {children}
                                            </a>
                                          ),
                                          code: ({ children }) => (
                                            <code className="rounded bg-[rgba(15,23,42,0.06)] px-1 py-0.5 text-[0.85em]">{children}</code>
                                          ),
                                          pre: ({ children }) => (
                                            <pre className="my-2 overflow-auto rounded-xl border border-[var(--border-soft)] bg-white/50 p-2 text-xs leading-5">
                                              {children}
                                            </pre>
                                          ),
                                          table: ({ children }) => (
                                            <div className="my-2 w-full overflow-x-auto">
                                              <table className="w-full min-w-[560px] border-collapse text-sm">{children}</table>
                                            </div>
                                          ),
                                          thead: ({ children }) => <thead className="bg-black/5">{children}</thead>,
                                          tbody: ({ children }) => <tbody>{children}</tbody>,
                                          tr: ({ children }) => <tr className="border-b border-[var(--border-soft)]">{children}</tr>,
                                          th: ({ children }) => (
                                            <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-[var(--text-muted)]">
                                              {children}
                                            </th>
                                          ),
                                          td: ({ children }) => <td className="px-3 py-2 align-top leading-6">{children}</td>,
                                        }}
                                      >
                                        {m.content}
                                      </ReactMarkdown>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-xs text-[var(--text-muted)]">
                          点左侧「全项」「事业」「财运」「婚恋」「子女」「六亲」「健康」或「学业」，解读会以对话形式展示在这里…
                        </div>
                      )}
                    </div>
                    <div className="border-t border-[var(--border-soft)] p-3">
                      <div className="flex gap-2">
                        <input
                          value={aiQuestion}
                          onChange={(e) => setAiQuestion(e.target.value)}
                          placeholder="继续追问：例如我该注意什么？接下来一年怎么做？"
                          className="h-10 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--focus-ring)]"
                          disabled={aiGenerating || aiAsking || !showAiReading}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void askAi();
                          }}
                        />
                        <Button type="button" variant="secondary" size="sm" disabled={!aiQuestion.trim() || aiAsking || aiGenerating} onClick={() => void askAi()}>
                          {aiAsking ? "发送中" : "发送"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        </section>
      )}

      <div className="mt-10 text-center text-xs text-[var(--text-muted)]">
        <a className="underline decoration-[rgba(74,120,108,0.4)] underline-offset-4" href="/terms" rel="noreferrer noopener">
          服务条款
        </a>{" "}
        ·{" "}
        <a className="underline decoration-[rgba(74,120,108,0.4)] underline-offset-4" href="/privacy" rel="noreferrer noopener">
          隐私政策
        </a>{" "}
        · 本服务仅供文化娱乐参考
      </div>

      {helpOpen ? (
        <div
          className="bazi-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.currentTarget === e.target && setHelpOpen(false)}
        >
          <div className="bazi-modal-panel w-full max-w-[560px] rounded-[18px] border bg-[var(--surface-panel)] p-4">
            <h3 className="text-[1.12rem] font-bold text-[var(--text-strong)]">帮助中心</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-main)]">欢迎使用知行馆。你可以先填写出生信息，再点击“开始排盘”生成结果。</p>
            <p className="mt-1 text-sm leading-6 text-[var(--text-main)]">完成排盘后，可点「全项」「事业」「财运」「婚恋」「子女」「六亲」「健康」「学业」生成解读，或生成分享卡。</p>
            <p className="mt-1 text-sm leading-6 text-[var(--text-main)]">排盘完成后右侧先展示命盘数据；点「全项」或专项后切换为灵犀解读正文，并可点「返回命盘」回到数据视图。</p>
            <p className="mt-1 text-sm leading-6 text-[var(--text-main)]">同一按钮可多次点击，每次都会重新请求（模型输出可能略有不同）。</p>
            <p className="mt-1 text-sm leading-6 text-[var(--text-main)]">
              若需返回首页，请前往 <Link to="/" className="underline underline-offset-4">/</Link>。
            </p>
            <div className="mt-4 flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setHelpOpen(false)}>
                我知道了
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {createArchiveOpen ? (
        <div
          className="bazi-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (creatingArchive) return;
            if (e.currentTarget === e.target) {
              setCreateArchiveOpen(false);
              setCreateArchiveErr("");
            }
          }}
        >
          <div className="bazi-modal-panel w-full max-w-[520px] rounded-[18px] border bg-[var(--surface-panel)] p-4">
            <h3 className="text-[1.12rem] font-bold text-[var(--text-strong)]">新建档案</h3>

            <div className="mt-4">
              <label className="text-xs font-semibold text-[var(--text-muted)]">档案名称</label>
              <input
                ref={(el) => {
                  createArchiveInputRef.current = el;
                }}
                className="mt-1 block h-10 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--focus-ring)]"
                value={createArchiveName}
                placeholder="例如：妈妈"
                onChange={(e) => {
                  setCreateArchiveName(e.target.value);
                  if (createArchiveErr) setCreateArchiveErr("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.currentTarget as HTMLInputElement).blur();
                    void (async () => {
                      if (creatingArchive) return;
                      const name = createArchiveName.trim();
                      if (!name) {
                        setCreateArchiveErr("请输入档案名称");
                        return;
                      }
                      if (name.length > 64) {
                        setCreateArchiveErr("名称过长（最多 64 字）");
                        return;
                      }
                      setCreatingArchive(true);
                      try {
                        const out = await createProfile(name, {});
                        const next = [out.profile, ...profiles];
                        setProfiles(next);
                        setActiveProfileId(out.profile.id);
                        setCreateArchiveOpen(false);
                        setCreateArchiveErr("");
                        nav(`/my/profiles?edit=${encodeURIComponent(String(out.profile.id))}`);
                      } catch (err: any) {
                        setCreateArchiveErr(explainError(String(err?.message || err)));
                      } finally {
                        setCreatingArchive(false);
                      }
                    })();
                  }
                  if (e.key === "Escape") {
                    if (creatingArchive) return;
                    setCreateArchiveOpen(false);
                    setCreateArchiveErr("");
                  }
                }}
              />
              {createArchiveErr ? (
                <div className="mt-2 text-sm text-[var(--bazi-danger)]">{createArchiveErr}</div>
              ) : null}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={creatingArchive}
                onClick={() => {
                  setCreateArchiveOpen(false);
                  setCreateArchiveErr("");
                }}
              >
                取消
              </Button>
              <Button
                size="sm"
                disabled={creatingArchive}
                onClick={() => {
                  void (async () => {
                    if (creatingArchive) return;
                    const name = createArchiveName.trim();
                    if (!name) {
                      setCreateArchiveErr("请输入档案名称");
                      return;
                    }
                    if (name.length > 64) {
                      setCreateArchiveErr("名称过长（最多 64 字）");
                      return;
                    }
                    setCreatingArchive(true);
                    try {
                      const out = await createProfile(name, {});
                      const next = [out.profile, ...profiles];
                      setProfiles(next);
                      setActiveProfileId(out.profile.id);
                      setCreateArchiveOpen(false);
                      setCreateArchiveErr("");
                      nav(`/my/profiles?edit=${encodeURIComponent(String(out.profile.id))}`);
                    } catch (err: any) {
                      setCreateArchiveErr(explainError(String(err?.message || err)));
                    } finally {
                      setCreatingArchive(false);
                    }
                  })();
                }}
              >
                {creatingArchive ? "创建中…" : "创建"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

