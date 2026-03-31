import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { Button } from "../../components/ui/button";
import { authMe } from "../../lib/authClient";
import { StocksTopbar } from "./StocksTopbar";
import { StocksScreenerPage } from "./StocksScreenerPage";
import { StocksTabs } from "./StocksTopbar";
import {
  askStockAi,
  createStockAiAnalysis,
  getKlines,
  getStockAiAnalysis,
  getSymbolAnalysis,
  type StockAiAnswer,
  type StockAiSummary,
  type StockFundamentals,
  type StockSnapshot,
  type StrategySignal,
} from "../../lib/stocksClient";
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
} from "lightweight-charts";

type Freq = "1d" | "1w" | "1m";

type SearchItem = { symbol: string; code: string; name: string; exchange: "SH" | "SZ" };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type KlineRow = {
  t: string;
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
};

const DEFAULT_VISIBLE_BARS = 180;
const ALL_MA_PERIODS = [5, 10, 20, 30, 60, 120, 250] as const;

function toUtcTimestampSec(ymd8: string) {
  const s = String(ymd8 || "");
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (y <= 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const ms = Date.UTC(y, m - 1, d);
  const sec = Math.floor(ms / 1000);
  return Number.isFinite(sec) ? sec : null;
}

function timeToUtcSec(t: any): number | null {
  if (t == null) return null;
  if (typeof t === "number" && Number.isFinite(t)) return t;
  if (typeof t === "object") {
    const y = Number((t as any).year);
    const m = Number((t as any).month);
    const d = Number((t as any).day);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      const ms = Date.UTC(y, m - 1, d);
      const sec = Math.floor(ms / 1000);
      return Number.isFinite(sec) ? sec : null;
    }
  }
  return null;
}

function fmtYmd(sec: number) {
  const d = new Date(sec * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function toBusinessDayFromYmd8(ymd8: string) {
  const s = String(ymd8 || "");
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (y <= 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { year: y, month: m, day: d };
}

function toFiniteNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function ema(values: number[], period: number): Array<number | null> {
  if (period <= 1) return values.map((v) => (Number.isFinite(v) ? v : null));
  const k = 2 / (period + 1);
  const out: Array<number | null> = new Array(values.length).fill(null);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) {
      out[i] = null;
      continue;
    }
    if (prev === null) {
      prev = v;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const eFast = ema(values, fast);
  const eSlow = ema(values, slow);
  const dif: Array<number | null> = values.map((_, i) => {
    const a = eFast[i];
    const b = eSlow[i];
    if (a == null || b == null) return null;
    return a - b;
  });
  const difFilled = dif.map((d) => (d == null ? 0 : d));
  const dea = ema(difFilled, signal);
  const hist: Array<number | null> = dif.map((d, i) => {
    const s = dea[i];
    if (d == null || s == null) return null;
    return (d - s) * 2;
  });
  return { dif, dea, hist };
}

function kdj(rows: Array<{ high: number; low: number; close: number }>, n = 9, kPeriod = 3, dPeriod = 3) {
  const rsv: Array<number | null> = new Array(rows.length).fill(null);
  for (let i = 0; i < rows.length; i++) {
    if (i < n - 1) continue;
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - (n - 1); j <= i; j++) {
      hh = Math.max(hh, rows[j].high);
      ll = Math.min(ll, rows[j].low);
    }
    const den = hh - ll;
    rsv[i] = den === 0 ? 50 : ((rows[i].close - ll) / den) * 100;
  }

  const kArr: Array<number | null> = new Array(rows.length).fill(null);
  const dArr: Array<number | null> = new Array(rows.length).fill(null);
  const jArr: Array<number | null> = new Array(rows.length).fill(null);

  let kPrev = 50;
  let dPrev = 50;
  for (let i = 0; i < rows.length; i++) {
    const v = rsv[i];
    if (v == null) continue;
    const kNow = (1 / kPeriod) * v + (1 - 1 / kPeriod) * kPrev;
    const dNow = (1 / dPeriod) * kNow + (1 - 1 / dPeriod) * dPrev;
    const jNow = 3 * kNow - 2 * dNow;
    kPrev = kNow;
    dPrev = dNow;
    kArr[i] = kNow;
    dArr[i] = dNow;
    jArr[i] = jNow;
  }
  return { k: kArr, d: dArr, j: jArr };
}

function bindChartAutoResize(chart: IChartApi, el: HTMLElement) {
  // lightweight-charts has autoSize, but some layouts (fonts loading / async) still need explicit resize.
  const apply = () => {
    const r = el.getBoundingClientRect();
    const w = Math.ceil(r.width || 0);
    const h = Math.ceil(r.height || 0);
    if (w > 0 && h > 0) {
      try {
        chart.resize(w, h);
      } catch {
        // ignore transient resize errors
      }
    }
  };
  apply();
  const ro = new ResizeObserver(() => apply());
  ro.observe(el);
  window.addEventListener("resize", apply, { passive: true });
  return () => {
    window.removeEventListener("resize", apply);
    ro.disconnect();
  };
}

function smaN(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  let sum = 0;
  const q: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    q.push(v);
    sum += v;
    if (q.length > period) sum -= q.shift()!;
    if (q.length === period) out[i] = sum / period;
  }
  return out;
}

function bollinger(values: number[], period = 20, mult = 2) {
  const mid = smaN(values, period);
  const up: Array<number | null> = new Array(values.length).fill(null);
  const low: Array<number | null> = new Array(values.length).fill(null);
  if (period <= 1) return { mid, up, low };
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    let sum = 0;
    for (let j = i - (period - 1); j <= i; j++) sum += values[j];
    const mean = sum / period;
    let vSum = 0;
    for (let j = i - (period - 1); j <= i; j++) {
      const d = values[j] - mean;
      vSum += d * d;
    }
    const sd = Math.sqrt(vSum / period);
    up[i] = mean + mult * sd;
    low[i] = mean - mult * sd;
  }
  return { mid, up, low };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

export function StocksPage() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [helpOpen, setHelpOpen] = useState(false);
  const [q, setQ] = useState("");
  const [freq, setFreq] = useState<Freq>("1d");
  const [visibleBars, setVisibleBars] = useState<number | null>(DEFAULT_VISIBLE_BARS); // null => fit all
  // Single-select only, but allow dropdown suggestions in the search box.
  const [items, setItems] = useState<SearchItem[]>([]);
  const [selected, setSelected] = useState<SearchItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const suggestBlurTimerRef = useRef<number | null>(null);
  const [aiAnalysisId, setAiAnalysisId] = useState<number | null>(null);
  const [aiSummary, setAiSummary] = useState<StockAiSummary | null>(null);
  const [aiMessages, setAiMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const aiChatScrollRef = useRef<HTMLDivElement | null>(null);
  const chartLegendScrollRef = useRef<HTMLDivElement | null>(null);
  const [klineErr, setKlineErr] = useState<string | null>(null);
  const [klines, setKlines] = useState<KlineRow[]>([]);
  const [snapshot, setSnapshot] = useState<StockSnapshot | null>(null);
  const [fundamentals, setFundamentals] = useState<StockFundamentals | null>(null);
  const [strategySignals, setStrategySignals] = useState<StrategySignal[]>([]);
  const [keyLevels, setKeyLevels] = useState<Array<{ kind: "support" | "resistance" | "stop_loss"; price: number | null; note: string }>>([]);
  const [openPanel, setOpenPanel] = useState(true);
  const [openAi, setOpenAi] = useState(false);
  const [openCharts, setOpenCharts] = useState(false);
  // 证据详情已移除：仅保留摘要与追问
  const [openSignals, setOpenSignals] = useState(false);
  const [showKdj, setShowKdj] = useState(true);
  const [showMacd, setShowMacd] = useState(true);
  const [maPeriods, setMaPeriods] = useState<number[]>([5, 20, 60]);
  const [showBoll, setShowBoll] = useState(false);
  const [barsPickerOpen, setBarsPickerOpen] = useState(false);
  const [maPickerOpen, setMaPickerOpen] = useState(false);
  const barsPickerWrapRef = useRef<HTMLDivElement | null>(null);
  const maPickerWrapRef = useRef<HTMLDivElement | null>(null);
  const [indicatorLegend, setIndicatorLegend] = useState<{
    date_ymd?: string;
    vol?: number | null;
    o?: number | null;
    c?: number | null;
    pct?: number | null;
    kdj?: { j: number | null };
    macd?: { dif: number | null };
  }>({});
  const chartElRef = useRef<HTMLDivElement | null>(null);
  const chartHostElRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const maSeriesRef = useRef<Record<number, any>>({});
  const bollUpperRef = useRef<any>(null);
  const bollMidRef = useRef<any>(null);
  const bollLowerRef = useRef<any>(null);
  const kdjElRef = useRef<HTMLDivElement | null>(null);
  const kdjHostElRef = useRef<HTMLDivElement | null>(null);
  const kdjChartRef = useRef<IChartApi | null>(null);
  const kdjKRef = useRef<any>(null);
  const kdjDRef = useRef<any>(null);
  const kdjJRef = useRef<any>(null);
  const macdElRef = useRef<HTMLDivElement | null>(null);
  const macdHostElRef = useRef<HTMLDivElement | null>(null);
  const macdChartRef = useRef<IChartApi | null>(null);
  const macdDifRef = useRef<any>(null);
  const macdDeaRef = useRef<any>(null);
  const macdHistRef = useRef<any>(null);
  const timeIndexRef = useRef<Map<number, number>>(new Map());
  const kdjCacheRef = useRef<{ k: Array<number | null>; d: Array<number | null>; j: Array<number | null> } | null>(null);
  const macdCacheRef = useRef<{ dif: Array<number | null>; dea: Array<number | null>; hist: Array<number | null> } | null>(null);

  const fmtPct = (v: any) => (v == null ? "未覆盖" : `${Number(v).toFixed(2)}%`);
  const fmtNum2 = (v: any) => (v == null ? "未覆盖" : Number(v).toFixed(2));
  const fmtYi = (v: any) => (v == null ? "未覆盖" : `${Number(v / 1e4).toFixed(2)} 亿`);
  const riskValueClass = (isRisk: boolean) => (isRisk ? "text-red-700" : "text-[var(--text-strong)]");

  const canSuggest = suggestOpen && q.trim().length > 0 && items.length > 0;
  const activeTab = params.get("tab") === "screener" ? "screener" : "single";

  const forceResizeCharts = () => {
    const mainEl = chartElRef.current;
    const kdjEl = kdjElRef.current;
    const macdEl = macdElRef.current;
    const main = chartRef.current;
    const kdjC = kdjChartRef.current;
    const macdC = macdChartRef.current;
    if (mainEl && main) {
      const r = mainEl.getBoundingClientRect();
      main.resize(Math.ceil(r.width || 0), Math.ceil(r.height || 0));
    }
    if (kdjEl && kdjC) {
      const r = kdjEl.getBoundingClientRect();
      kdjC.resize(Math.ceil(r.width || 0), Math.ceil(r.height || 0));
    }
    if (macdEl && macdC) {
      const r = macdEl.getBoundingClientRect();
      macdC.resize(Math.ceil(r.width || 0), Math.ceil(r.height || 0));
    }
  };

  useEffect(() => {
    let cancelled = false;
    const next = "/stocks";
    void authMe()
      .then((m) => {
        if (cancelled) return;
        const ok = Boolean((m as any)?.logged_in);
        if (!ok) {
          nav(`/login?next=${encodeURIComponent(next)}`);
        }
      })
      .catch((e: any) => {
        const msg = String(e?.message || e || "");
        // If backend is temporarily unavailable, avoid redirect loops; show error instead.
        if (/auth_backend_unavailable/i.test(msg)) {
          if (!cancelled) setErr("鉴权服务暂不可用（数据库连接失败）。请稍后重试，或先检查 MySQL 连通性。");
          return;
        }
        if (!cancelled) nav(`/login?next=${encodeURIComponent(next)}`);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nav]);

  useEffect(() => {
    if (!selected) {
      setSnapshot(null);
      setFundamentals(null);
      setStrategySignals([]);
      setKeyLevels([]);
      return;
    }
    let alive = true;
    void getSymbolAnalysis(selected.symbol)
      .then((r) => {
        if (!alive) return;
        setSnapshot(r.snapshot_json);
        setFundamentals((r as any).fundamentals_json || null);
        setStrategySignals(r.signals || []);
        setKeyLevels(r.key_levels || []);
      })
      .catch(() => {
        if (!alive) return;
        setSnapshot(null);
        setFundamentals(null);
        setStrategySignals([]);
        setKeyLevels([]);
      });
    return () => {
      alive = false;
    };
  }, [selected]);

  useEffect(() => {
    // Default behavior: collapse charts when no symbol is selected.
    if (!selected) {
      setOpenCharts(false);
      return;
    }
    // Auto-expand charts once a symbol is selected.
    setOpenCharts(true);
  }, [selected]);

  useEffect(() => {
    const raw = params.get("ai") || "";
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0) return;
    let cancelled = false;
    setAiBusy(true);
    void getStockAiAnalysis(Math.floor(id))
      .then((r) => {
        if (cancelled) return;
        setAiAnalysisId(r.ai_analysis.id);
        setAiSummary(r.ai_analysis.response_json);
        setAiMessages(r.messages || []);
      })
      .catch(() => {
        // ignore; user may not be logged in yet and will be redirected by auth gate
      })
      .finally(() => {
        if (!cancelled) setAiBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params]);

  useEffect(() => {
    if (!openAi) return;
    const el = aiChatScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [aiMessages.length, openAi]);

  useEffect(() => {
    if (!openCharts) return;
    // Mobile Safari sometimes misses ResizeObserver on first paint; force a few resizes.
    let alive = true;
    const tick = () => {
      if (!alive) return;
      try {
        forceResizeCharts();
      } catch {
        // ignore
      }
    };
    const r1 = requestAnimationFrame(() => {
      tick();
      requestAnimationFrame(tick);
    });
    const t = window.setTimeout(tick, 250);
    return () => {
      alive = false;
      cancelAnimationFrame(r1);
      window.clearTimeout(t);
    };
  }, [openCharts, freq, visibleBars, maPeriods.length, showBoll, showKdj, showMacd]);

  useEffect(() => {
    if (!openCharts) return;
    // Mobile: address-bar expand/collapse changes visualViewport; also handle orientation.
    let alive = true;
    const onResize = () => {
      if (!alive) return;
      try {
        forceResizeCharts();
      } catch {
        // ignore
      }
    };
    const onVis = () => onResize();
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", onVis, { passive: true } as any);
      window.visualViewport.addEventListener("scroll", onVis, { passive: true } as any);
    }
    // One more delayed tick after potential layout settling.
    const t = window.setTimeout(onResize, 600);
    return () => {
      alive = false;
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize as any);
      window.removeEventListener("orientationchange", onResize as any);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", onVis as any);
        window.visualViewport.removeEventListener("scroll", onVis as any);
      }
    };
  }, [openCharts]);

  useEffect(() => {
    if (!openCharts) return;
    // Ensure legend starts from left on mobile (avoid "stuck in middle" horizontal scroll).
    const el = chartLegendScrollRef.current;
    if (!el) return;
    el.scrollLeft = 0;
  }, [openCharts, indicatorLegend.date_ymd]);

  // Keep URL in sync when session id changes, so refresh/share can restore.
  useEffect(() => {
    if (!aiAnalysisId) return;
    const sp = new URLSearchParams(params);
    if (sp.get("ai") === String(aiAnalysisId)) return;
    sp.set("ai", String(aiAnalysisId));
    setParams(sp, { replace: true });
  }, [aiAnalysisId, params, setParams]);

  useEffect(() => {
    // Init chart when opened
    if (!openCharts) return;
    const el = chartElRef.current;
    if (!el) return;
    // If DOM node changed (layout refactor), recreate chart to avoid binding to a detached element.
    if (chartRef.current && chartHostElRef.current !== el) {
      try {
        chartRef.current.remove();
      } catch {
        // ignore
      }
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      maSeriesRef.current = {};
      bollUpperRef.current = null;
      bollMidRef.current = null;
      bollLowerRef.current = null;
    }
    if (chartRef.current) return;
    const chart = createChart(el, {
      layout: { background: { color: "transparent" }, textColor: "#5b4c7a", attributionLogo: false },
      localization: {
        locale: "zh-CN",
        timeFormatter: (t: any) => {
          const sec = timeToUtcSec(t);
          return sec == null ? "" : fmtYmd(sec);
        },
      },
      grid: { vertLines: { color: "rgba(90,74,122,0.06)" }, horzLines: { color: "rgba(90,74,122,0.06)" } },
      rightPriceScale: { borderColor: "rgba(186,160,225,0.28)" },
      timeScale: { borderColor: "rgba(186,160,225,0.28)" },
      watermark: { visible: false },
    } as any);
    // Hard resize once at init (more reliable than autoSize on mobile Safari).
    try {
      const r = el.getBoundingClientRect();
      chart.resize(Math.ceil(r.width || 0), Math.ceil(r.height || 0));
    } catch {
      // ignore
    }
    // lightweight-charts v5+: use addSeries() API
    const candlestick = chart.addSeries(CandlestickSeries, {
      upColor: "#EF4444",
      downColor: "#10B981",
      wickUpColor: "#EF4444",
      wickDownColor: "#10B981",
      borderVisible: false,
    });
    const maColors: Record<number, string> = {
      5: "rgba(99,102,241,0.85)",
      10: "rgba(245,158,11,0.85)",
      20: "rgba(34,197,94,0.85)",
      30: "rgba(14,165,233,0.85)",
      60: "rgba(168,85,247,0.8)",
      120: "rgba(236,72,153,0.8)",
      250: "rgba(100,116,139,0.85)",
    };
    const maMap: Record<number, any> = {};
    for (const p of ALL_MA_PERIODS) {
      maMap[p] = chart.addSeries(LineSeries, {
        color: maColors[p],
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
    }
    const bollUpper = chart.addSeries(LineSeries, { color: "rgba(236,72,153,0.75)", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    const bollMid = chart.addSeries(LineSeries, { color: "rgba(148,163,184,0.85)", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    const bollLower = chart.addSeries(LineSeries, { color: "rgba(236,72,153,0.75)", lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    const vol = chart.addSeries(HistogramSeries, {
      priceScaleId: "",
      priceFormat: { type: "volume" },
      color: "rgba(90,74,122,0.18)",
    });
    chart.priceScale("").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chartRef.current = chart;
    chartHostElRef.current = el;
    candleRef.current = candlestick;
    volRef.current = vol;
    maSeriesRef.current = maMap;
    bollUpperRef.current = bollUpper;
    bollMidRef.current = bollMid;
    bollLowerRef.current = bollLower;
    const unbind = bindChartAutoResize(chart, el);

    return () => {
      unbind();
      chartHostElRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      maSeriesRef.current = {};
      bollUpperRef.current = null;
      bollMidRef.current = null;
      bollLowerRef.current = null;
      chartRef.current?.remove();
      chartRef.current = null;
    };
  }, [openCharts]);

  useEffect(() => {
    if (!openCharts || !showKdj) {
      // If panel is hidden, dispose to allow clean recreate.
      if (kdjChartRef.current) {
        try {
          kdjChartRef.current.remove();
        } catch {
          // ignore
        }
      }
      kdjChartRef.current = null;
      kdjHostElRef.current = null;
      kdjKRef.current = null;
      kdjDRef.current = null;
      kdjJRef.current = null;
      return;
    }
    const el = kdjElRef.current;
    if (!el) return;
    if (kdjChartRef.current && kdjHostElRef.current !== el) {
      try {
        kdjChartRef.current.remove();
      } catch {
        // ignore
      }
      kdjChartRef.current = null;
      kdjKRef.current = null;
      kdjDRef.current = null;
      kdjJRef.current = null;
    }
    if (kdjChartRef.current) return;
    const chart = createChart(el, {
      layout: { background: { color: "transparent" }, textColor: "#5b4c7a", attributionLogo: false },
      grid: { vertLines: { color: "rgba(90,74,122,0.06)" }, horzLines: { color: "rgba(90,74,122,0.06)" } },
      rightPriceScale: { borderColor: "rgba(186,160,225,0.28)" },
      timeScale: { borderColor: "rgba(186,160,225,0.28)" },
      crosshair: { mode: 0 },
      watermark: { visible: false },
    } as any);
    try {
      const r = el.getBoundingClientRect();
      chart.resize(Math.ceil(r.width || 0), Math.ceil(r.height || 0));
    } catch {
      // ignore
    }
    chart.timeScale().applyOptions({ visible: false });
    const kLine = chart.addSeries(LineSeries, { color: "rgba(245,158,11,0.9)", lineWidth: 2 });
    const dLine = chart.addSeries(LineSeries, { color: "rgba(99,102,241,0.9)", lineWidth: 2 });
    const jLine = chart.addSeries(LineSeries, { color: "rgba(236,72,153,0.75)", lineWidth: 1 });
    kdjChartRef.current = chart;
    kdjHostElRef.current = el;
    kdjKRef.current = kLine;
    kdjDRef.current = dLine;
    kdjJRef.current = jLine;
    const unbind = bindChartAutoResize(chart, el);
    return () => {
      unbind();
      kdjHostElRef.current = null;
      kdjKRef.current = null;
      kdjDRef.current = null;
      kdjJRef.current = null;
      kdjChartRef.current?.remove();
      kdjChartRef.current = null;
    };
  }, [openCharts, showKdj]);

  useEffect(() => {
    if (!openCharts || !showMacd) {
      if (macdChartRef.current) {
        try {
          macdChartRef.current.remove();
        } catch {
          // ignore
        }
      }
      macdChartRef.current = null;
      macdHostElRef.current = null;
      macdHistRef.current = null;
      macdDifRef.current = null;
      macdDeaRef.current = null;
      return;
    }
    const el = macdElRef.current;
    if (!el) return;
    if (macdChartRef.current && macdHostElRef.current !== el) {
      try {
        macdChartRef.current.remove();
      } catch {
        // ignore
      }
      macdChartRef.current = null;
      macdHistRef.current = null;
      macdDifRef.current = null;
      macdDeaRef.current = null;
    }
    if (macdChartRef.current) return;
    const chart = createChart(el, {
      layout: { background: { color: "transparent" }, textColor: "#5b4c7a", attributionLogo: false },
      grid: { vertLines: { color: "rgba(90,74,122,0.06)" }, horzLines: { color: "rgba(90,74,122,0.06)" } },
      rightPriceScale: { borderColor: "rgba(186,160,225,0.28)" },
      timeScale: { borderColor: "rgba(186,160,225,0.28)" },
      crosshair: { mode: 0 },
      watermark: { visible: false },
    } as any);
    try {
      const r = el.getBoundingClientRect();
      chart.resize(Math.ceil(r.width || 0), Math.ceil(r.height || 0));
    } catch {
      // ignore
    }
    chart.timeScale().applyOptions({ visible: true });
    const hist = chart.addSeries(HistogramSeries, { priceScaleId: "", priceFormat: { type: "price", precision: 2, minMove: 0.01 } });
    chart.priceScale("").applyOptions({ scaleMargins: { top: 0.2, bottom: 0.2 } });
    const dif = chart.addSeries(LineSeries, { color: "rgba(34,197,94,0.9)", lineWidth: 2 });
    const dea = chart.addSeries(LineSeries, { color: "rgba(239,68,68,0.9)", lineWidth: 2 });
    macdChartRef.current = chart;
    macdHostElRef.current = el;
    macdHistRef.current = hist;
    macdDifRef.current = dif;
    macdDeaRef.current = dea;
    const unbind = bindChartAutoResize(chart, el);
    return () => {
      unbind();
      macdHostElRef.current = null;
      macdHistRef.current = null;
      macdDifRef.current = null;
      macdDeaRef.current = null;
      macdChartRef.current?.remove();
      macdChartRef.current = null;
    };
  }, [openCharts, showMacd]);

  useEffect(() => {
    // Keep main/KDJ/MACD time windows in sync (bidirectional).
    if (!openCharts) return;
    const main = chartRef.current;
    const kdjC = kdjChartRef.current;
    const macdC = macdChartRef.current;
    if (!main || !kdjC || !macdC) return;

    let syncing = false;
    const applyRangeTo = (target: IChartApi, range: any) => {
      if (!range) return;
      // lightweight-charts may emit null ranges during init/resize.
      if (range.from == null || range.to == null) return;
      syncing = true;
      try {
        try {
          target.timeScale().setVisibleRange(range);
        } catch {
          // Some charts may not have data yet; ignore transient "Value is null" from lightweight-charts.
        }
      } finally {
        syncing = false;
      }
    };

    const onMainRange = (r: any) => {
      if (syncing) return;
      applyRangeTo(kdjC, r);
      applyRangeTo(macdC, r);
    };
    const onKdjRange = (r: any) => {
      if (syncing) return;
      applyRangeTo(main, r);
      applyRangeTo(macdC, r);
    };
    const onMacdRange = (r: any) => {
      if (syncing) return;
      applyRangeTo(main, r);
      applyRangeTo(kdjC, r);
    };

    main.timeScale().subscribeVisibleTimeRangeChange(onMainRange);
    kdjC.timeScale().subscribeVisibleTimeRangeChange(onKdjRange);
    macdC.timeScale().subscribeVisibleTimeRangeChange(onMacdRange);

    // Best-effort initial alignment to main chart.
    try {
      const r0 = main.timeScale().getVisibleRange();
      if (r0) {
        applyRangeTo(kdjC, r0 as any);
        applyRangeTo(macdC, r0 as any);
      }
    } catch {
      // ignore
    }

    return () => {
      main.timeScale().unsubscribeVisibleTimeRangeChange(onMainRange);
      kdjC.timeScale().unsubscribeVisibleTimeRangeChange(onKdjRange);
      macdC.timeScale().unsubscribeVisibleTimeRangeChange(onMacdRange);
    };
  }, [openCharts, showKdj, showMacd]);

  useEffect(() => {
    const chartApi = chartRef.current;
    const candleSeries = candleRef.current;
    const volSeries = volRef.current;
    if (!openCharts || !selected || !chartApi || !candleSeries || !volSeries) return;
    const to = todayIso();
    const from = new Date(Date.now() - 365 * 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    setKlineErr(null);
    void getKlines({ symbol: selected.symbol, from, to, freq, adjust: "none" })
      .then((r) => {
        const fail = (step: string, e: any) => {
          throw new Error(`[chart:${step}] ${String(e?.message || e)}`);
        };

        // klines will be set to deduped chart-aligned rows below
        const dataRaw = (r.candles || []).map((c) => ({
          ymd8: String(c.t),
          time: toUtcTimestampSec(c.t),
          open: toFiniteNumber((c as any).open),
          high: toFiniteNumber((c as any).high),
          low: toFiniteNumber((c as any).low),
          close: toFiniteNumber((c as any).close),
          vol: toFiniteNumber((c as any).vol),
        }));
        const isBadCandle = (x: any) => {
          if (x.time == null) return true;
          if (x.open == null || x.high == null || x.low == null || x.close == null) return true;
          if (x.high < x.low) return true;
          const maxOC = Math.max(x.open, x.close);
          const minOC = Math.min(x.open, x.close);
          if (x.high < maxOC) return true;
          if (x.low > minOC) return true;
          return false;
        };
        const bad = dataRaw.filter(isBadCandle);
        const goodSorted = dataRaw
          .filter(
            (x) =>
              x.time != null &&
              x.open != null &&
              x.high != null &&
              x.low != null &&
              x.close != null &&
              x.high >= x.low &&
              x.high >= Math.max(x.open, x.close) &&
              x.low <= Math.min(x.open, x.close)
          )
          .sort((a: any, b: any) => Number(a.time) - Number(b.time)) as any[];
        // Deduplicate by day (keep last) to avoid chart library errors on duplicates.
        const byDay = new Map<number, any>();
        for (const it of goodSorted) {
          byDay.set(Number(it.time), it);
        }
        const data = Array.from(byDay.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, v]) => v);
        // Build time->index map for legend/crosshair lookups.
        try {
          const m = new Map<number, number>();
          for (let i = 0; i < data.length; i++) m.set(Number((data as any)[i].time), i);
          timeIndexRef.current = m;
        } catch {
          // ignore
        }
        try {
          candleSeries.setData(data as any);
        } catch (e: any) {
          // Fallback: use BusinessDay time (more permissive in some builds).
          try {
            const bdData = data
              .map((x: any) => ({
                time: toBusinessDayFromYmd8(x.ymd8),
                open: x.open,
                high: x.high,
                low: x.low,
                close: x.close,
              }))
              .filter((x: any) => x.time);
            candleSeries.setData(bdData as any);
          } catch (e2: any) {
            const sample = bad.slice(0, 3);
            const head = data.slice(0, 3);
            const diag = `good=${data.length} raw=${dataRaw.length} bad=${bad.length} bad_sample=${JSON.stringify(sample)} head=${JSON.stringify(head)}`;
            fail("candles_setData", `${String(e?.message || e)} | ${String(e2?.message || e2)} | ${diag}`);
          }
        }

        const vols = (data as any[])
          .map((c) => ({
            time: c.time,
            value: c.vol,
            color: Number(c.close) >= Number(c.open) ? "rgba(239,68,68,0.35)" : "rgba(16,185,129,0.35)",
          }))
          .filter((x) => x.time != null && x.value != null) as any[];
        try {
          volSeries.setData(vols as any);
        } catch (e: any) {
          fail("volume_setData", e);
        }

        // Keep indicator computations aligned to chart data (deduped).
        setKlines(
          (data as any[]).map((c) => ({
            t: String(c.ymd8),
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            vol: c.vol == null ? 0 : Number(c.vol),
          })) as any
        );

        // Default view: show recent N bars (logical range).
        try {
          const last = data.length;
          if (last > 0) {
            if (visibleBars == null) {
              chartApi.timeScale().fitContent();
            } else {
              const n = Math.max(30, Math.min(520, Math.floor(visibleBars)));
              const from0 = Math.max(0, last - n);
              chartApi.timeScale().setVisibleLogicalRange({ from: from0, to: last - 1 });
            }
          } else {
            chartApi.timeScale().fitContent();
          }
        } catch (e: any) {
          fail("main_visibleRange", e);
        }
      })
      .catch((e: any) => {
        setKlineErr(String(e?.message || e));
      });
  }, [openCharts, selected, freq, visibleBars]);

  useEffect(() => {
    if (!openCharts || !klines.length) return;
    const times = klines.map((c) => toUtcTimestampSec(c.t));
    const closes = klines.map((c) => c.close);
    const rows = klines.map((c) => ({ high: c.high, low: c.low, close: c.close }));
    const kdjOut = kdj(rows);
    const macdOut = macd(closes);
    kdjCacheRef.current = kdjOut;
    macdCacheRef.current = macdOut;

    const kLine = kdjKRef.current;
    const dLine = kdjDRef.current;
    const jLine = kdjJRef.current;
    if (kLine && dLine && jLine) {
      if (showKdj) {
        kLine.setData(
          times.map((t, i) => (t == null || kdjOut.k[i] == null ? null : { time: t, value: round2(kdjOut.k[i]!) })).filter(Boolean) as any,
        );
        dLine.setData(
          times.map((t, i) => (t == null || kdjOut.d[i] == null ? null : { time: t, value: round2(kdjOut.d[i]!) })).filter(Boolean) as any,
        );
        jLine.setData(
          times.map((t, i) => (t == null || kdjOut.j[i] == null ? null : { time: t, value: round2(kdjOut.j[i]!) })).filter(Boolean) as any,
        );
      } else {
        kLine.setData([] as any);
        dLine.setData([] as any);
        jLine.setData([] as any);
      }
    }

    const hist = macdHistRef.current;
    const dif = macdDifRef.current;
    const dea = macdDeaRef.current;
    if (hist && dif && dea) {
      if (showMacd) {
        hist.setData(
          times
            .map((t, i) => {
              const v = macdOut.hist[i];
              if (t == null || v == null) return null;
              return { time: t, value: round2(v), color: v >= 0 ? "rgba(239,68,68,0.45)" : "rgba(16,185,129,0.45)" };
            })
            .filter(Boolean) as any,
        );
        dif.setData(times.map((t, i) => (t == null || macdOut.dif[i] == null ? null : { time: t, value: round2(macdOut.dif[i]!) })).filter(Boolean) as any);
        dea.setData(times.map((t, i) => (t == null || macdOut.dea[i] == null ? null : { time: t, value: round2(macdOut.dea[i]!) })).filter(Boolean) as any);
      } else {
        hist.setData([] as any);
        dif.setData([] as any);
        dea.setData([] as any);
      }
    }

    // Default legend: last bar values (when not hovering).
    const lastIdx = Math.max(0, closes.length - 1);
    const lastTime = times[lastIdx];
    const lastRow: any = (klines as any)[lastIdx];
    const o = lastRow?.open ?? null;
    const c = lastRow?.close ?? null;
    const pct = o && Number.isFinite(o) && c != null ? ((Number(c) - Number(o)) / Number(o)) * 100 : null;
    setIndicatorLegend({
      date_ymd: lastTime == null ? undefined : fmtYmd(lastTime),
      vol: lastRow?.vol ?? null,
      o,
      c,
      pct,
      kdj: { j: kdjOut.j[lastIdx] ?? null },
      macd: { dif: macdOut.dif[lastIdx] ?? null },
    });
  }, [openCharts, klines, showKdj, showMacd]);

  useEffect(() => {
    if (!openCharts) return;
    const main = chartRef.current;
    if (!main) return;
    const onMove = (p: any) => {
      const key = timeToUtcSec(p?.time);
      if (key == null) return;
      const idx = timeIndexRef.current.get(key);
      if (idx == null) return;
      const kdjOut = kdjCacheRef.current;
      const macdOut = macdCacheRef.current;
      if (!kdjOut || !macdOut) return;
      const row: any = (klines as any)[idx];
      const o = row?.open ?? null;
      const c = row?.close ?? null;
      const pct = o && Number.isFinite(o) && c != null ? ((Number(c) - Number(o)) / Number(o)) * 100 : null;
      setIndicatorLegend({
        date_ymd: fmtYmd(key),
        vol: row?.vol ?? null,
        o,
        c,
        pct,
        kdj: { j: kdjOut.j[idx] ?? null },
        macd: { dif: macdOut.dif[idx] ?? null },
      });
    };
    main.subscribeCrosshairMove(onMove);
    return () => {
      main.unsubscribeCrosshairMove(onMove);
    };
  }, [openCharts, klines]);

  useEffect(() => {
    if (!openCharts || !klines.length) return;
    const times = klines.map((c) => toUtcTimestampSec(c.t));
    const closes = klines.map((c) => c.close);
    const selected = new Set<number>((maPeriods || []).map((x) => Math.floor(Number(x))).filter((x) => Number.isFinite(x) && x > 1));
    const boll = bollinger(closes, 20, 2);

    const maMap = maSeriesRef.current || {};
    for (const p of ALL_MA_PERIODS) {
      const s = maMap[p];
      if (!s) continue;
      if (!selected.has(p)) {
        s.setData([] as any);
        continue;
      }
      const out = smaN(closes, p);
      s.setData(times.map((t, i) => (t == null || out[i] == null ? null : { time: t, value: round2(out[i]!) })).filter(Boolean) as any);
    }
    const upper = bollUpperRef.current;
    const mid = bollMidRef.current;
    const lower = bollLowerRef.current;
    if (upper) upper.setData(showBoll ? (times.map((t, i) => (t == null || boll.up[i] == null ? null : { time: t, value: round2(boll.up[i]!) })).filter(Boolean) as any) : ([] as any));
    if (mid) mid.setData(showBoll ? (times.map((t, i) => (t == null || boll.mid[i] == null ? null : { time: t, value: round2(boll.mid[i]!) })).filter(Boolean) as any) : ([] as any));
    if (lower) lower.setData(showBoll ? (times.map((t, i) => (t == null || boll.low[i] == null ? null : { time: t, value: round2(boll.low[i]!) })).filter(Boolean) as any) : ([] as any));
  }, [openCharts, klines, maPeriods, showBoll]);

  useEffect(() => {
    if (!openCharts) return;
    // Allow DOM to settle after expanding, then resize.
    const t = window.setTimeout(() => forceResizeCharts(), 60);
    return () => window.clearTimeout(t);
  }, [openCharts]);

  useEffect(() => {
    if (!maPickerOpen) return;
    const onDown = (e: PointerEvent) => {
      const wrap = maPickerWrapRef.current;
      const t = e.target as any;
      if (wrap && t && typeof wrap.contains === "function" && wrap.contains(t)) return;
      setMaPickerOpen(false);
    };
    window.addEventListener("pointerdown", onDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onDown, { capture: true } as any);
  }, [maPickerOpen]);

  useEffect(() => {
    if (!barsPickerOpen) return;
    const onDown = (e: PointerEvent) => {
      const wrap = barsPickerWrapRef.current;
      const t = e.target as any;
      if (wrap && t && typeof wrap.contains === "function" && wrap.contains(t)) return;
      setBarsPickerOpen(false);
    };
    window.addEventListener("pointerdown", onDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onDown, { capture: true } as any);
  }, [barsPickerOpen]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const qq = q.trim();
      setErr(null);
      if (!qq) {
        setItems([]);
        setSelected(null);
        return;
      }
      try {
        const r = await getJson<{ items: SearchItem[] }>(`/api/symbols/search?q=${encodeURIComponent(qq)}&limit=20`);
        if (!alive) return;
        // Single-select only: keep suggestions, auto-pick best match.
        const list = (r.items || []) as SearchItem[];
        setItems(list);
        if (list.length === 0) {
          setSelected(null);
        } else {
          const qNorm = qq.replace(/\s+/g, "").toUpperCase();
          const best =
            list.find((it) => String(it.symbol || "").toUpperCase() === qNorm || String(it.code || "").toUpperCase() === qNorm) || list[0];
          setSelected(best);
        }
      } catch (e: any) {
        if (!alive) return;
        const msg = String(e?.message || e);
        if (/unauthorized/i.test(msg) || /"error"\s*:\s*"unauthorized"/i.test(msg)) {
          nav(`/login?next=${encodeURIComponent("/stocks")}`);
          return;
        }
        setErr(msg);
      }
    };
    const t = window.setTimeout(run, 250);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [q]); // intentionally not depending on selected

  const onGenerateAi = async () => {
    if (!selected) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await createStockAiAnalysis(selected.symbol, { asof: "today", freq });
      setAiAnalysisId(r.ai_analysis_id);
      setAiSummary(r.summary);
      setOpenAi(true);
      // Persist the session id to URL so refresh won't lose it.
      const sp = new URLSearchParams(params);
      sp.set("ai", String(r.ai_analysis_id));
      setParams(sp, { replace: true });
      // After server-side change, initial assistant message is persisted; fetch to ensure consistency.
      void getStockAiAnalysis(r.ai_analysis_id).then((out) => setAiMessages(out.messages || []));
      setAiQuestion("");
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const onAskAi = async () => {
    if (!aiAnalysisId) return;
    const qq = aiQuestion.trim();
    if (!qq) return;
    setAiBusy(true);
    setErr(null);
    setAiQuestion("");
    setAiMessages((m) => [...m, { role: "user", content: qq }]);
    try {
      const r = await askStockAi(aiAnalysisId, qq);
      const a: StockAiAnswer = r.answer;
      setAiMessages((m) => [...m, { role: "assistant", content: a.text }]);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setAiMessages((m) => [...m, { role: "assistant", content: "追问失败，请稍后重试。" }]);
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="home-landing page-stocks pb-12">
      <StocksTopbar onOpenHelp={() => setHelpOpen(true)} />

      <header className="home-landing-header" aria-labelledby="stocks-page-title">
        <div className="home-landing-header-content">
          <h1 id="stocks-page-title" className="home-landing-title">
            {activeTab === "screener" ? "资研参详·策略选股" : "资研参详·单股研判"}
          </h1>
          <p className="home-landing-subline mt-2">
            {activeTab === "screener" ? "一键运行 · 运行历史 · TopN与理由" : "搜索 · 日/周/月 · 成交量/KDJ/MACD"}
          </p>
        </div>
        <Link to="/" className="home-landing-mascot shrink-0" aria-label="返回首页">
          <div className="home-landing-mascot-icon" aria-hidden />
          <div className="home-landing-mascot-text">可可爱爱小馆灵</div>
        </Link>
      </header>

      <StocksTabs />

      <div className="home-landing-surface max-w-full overflow-x-hidden p-5">
        {activeTab === "screener" ? (
          <StocksScreenerPage />
        ) : (
          <>
        {err ? <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div> : null}

        <div className="mt-4 grid min-w-0 max-w-full items-start gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
          {/* Left: search/results + analysis + AI */}
          <div className="grid min-w-0 gap-3 self-start">
            <div className="home-landing-surface-inset p-4">
              <div className="grid gap-3">
                <label className="block">
                  <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">股票代码/简称</div>
                  <div className="relative">
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      onFocus={() => {
                        if (suggestBlurTimerRef.current) window.clearTimeout(suggestBlurTimerRef.current);
                        setSuggestOpen(true);
                      }}
                      onBlur={() => {
                        // Delay close so click on suggestion can fire.
                        suggestBlurTimerRef.current = window.setTimeout(() => setSuggestOpen(false), 120) as any;
                      }}
                      placeholder="例如：600519 或 000001"
                      disabled={busy}
                      className="mt-1 block h-10 w-full min-w-0 max-w-full rounded-xl border border-[var(--border-main)] bg-white/40 px-3 text-sm text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                    />

                    {canSuggest ? (
                      <div className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-xl border border-[var(--border-soft)] bg-white/90 shadow-lg backdrop-blur">
                        <div className="max-h-64 overflow-auto p-1">
                          {items.slice(0, 12).map((it) => (
                            <button
                              key={it.symbol}
                              type="button"
                              className={[
                                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm",
                                selected?.symbol === it.symbol ? "bg-[rgba(201,162,39,0.18)]" : "hover:bg-black/5",
                              ].join(" ")}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setSelected(it);
                                setQ(it.symbol || it.code || "");
                                setSuggestOpen(false);
                              }}
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-semibold text-[var(--text-strong)]">{it.name || it.symbol}</span>
                                <span className="block truncate text-xs text-[var(--text-muted)]">{it.symbol}</span>
                              </span>
                              <span className="ml-3 shrink-0 text-xs text-[var(--text-muted)]">{it.exchange}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </label>
              </div>
            </div>
            {/* single-select only: no results list */}

            <div className="home-landing-surface-inset p-4">
              <button
                type="button"
                className="flex w-full items-center justify-between text-left text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]"
                onClick={() => setOpenPanel((v) => !v)}
              >
                <span>分析面板</span>
                <span className="text-[0.72rem] opacity-80">{openPanel ? "收起" : "展开"}</span>
              </button>
              {openPanel ? (
                <div>
                  <div className="mt-3 text-sm text-[var(--text-muted)]">
                  </div>
                  {snapshot ? (
                    <div className="mt-4 rounded-xl border border-[var(--border-soft)] bg-white/40 p-3 text-sm text-[var(--text-main)]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">{snapshot.name || "—"}</div>
                        <div className="text-xs text-[var(--text-muted)]">数据日：{snapshot.asof}</div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                        <div>
                          <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">涨跌幅(1D)</div>
                          <div className="mt-0.5 font-semibold text-[var(--text-strong)]">{fmtPct(snapshot.pct_chg_1d)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">涨跌幅(5D)</div>
                          <div className="mt-0.5 font-semibold text-[var(--text-strong)]">{fmtPct(snapshot.pct_chg_5d)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">涨跌幅(20D)</div>
                          <div className="mt-0.5 font-semibold text-[var(--text-strong)]">{fmtPct(snapshot.pct_chg_20d)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">PE(TTM)</div>
                          <div className="mt-0.5 font-semibold text-[var(--text-strong)]">{fmtNum2(snapshot.pe_ttm)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">总市值</div>
                          <div className="mt-0.5 font-semibold text-[var(--text-strong)]">{fmtYi(snapshot.total_mv)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">流通市值</div>
                          <div className="mt-0.5 font-semibold text-[var(--text-strong)]">{fmtYi(snapshot.circ_mv)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">成交额</div>
                          <div className="mt-0.5 font-semibold text-[var(--text-strong)]">{fmtYi(snapshot.amount)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">行业</div>
                          <div className="mt-0.5 font-semibold text-[var(--text-strong)]">{snapshot.industry || "未覆盖"}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 text-xs text-[var(--text-muted)]">快照数据加载中（或暂无数据）。</div>
                  )}

                  {fundamentals ? (
                    <div className="mt-3 rounded-xl border border-[var(--border-soft)] bg-white/40 p-3 text-sm text-[var(--text-main)]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">基本面</div>
                        <div className="text-xs text-[var(--text-muted)]">财报期末：{fundamentals.report_end_date || "—"}</div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                        <div>
                          <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">PB</div>
                          <div className={["mt-0.5 font-semibold", riskValueClass(false)].join(" ")}>{fundamentals.pb == null ? "—" : fundamentals.pb.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">PS(TTM)</div>
                          <div className="mt-0.5 font-semibold text-[var(--text-strong)]">
                            {fundamentals.ps_ttm == null ? "—" : fundamentals.ps_ttm.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">股息率(TTM)</div>
                          <div className="mt-0.5 font-semibold text-[var(--text-strong)]">
                            {fundamentals.dv_ttm == null ? "—" : `${fundamentals.dv_ttm.toFixed(2)}%`}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">ROE</div>
                          <div className={["mt-0.5 font-semibold", riskValueClass(fundamentals.roe != null && fundamentals.roe < 10)].join(" ")}>
                            {fundamentals.roe == null ? "—" : `${fundamentals.roe.toFixed(2)}%`}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">毛利率</div>
                          <div className="mt-0.5 font-semibold text-[var(--text-strong)]">
                            {fundamentals.grossprofit_margin == null ? "—" : `${fundamentals.grossprofit_margin.toFixed(2)}%`}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">净利率</div>
                          <div className="mt-0.5 font-semibold text-[var(--text-strong)]">
                            {fundamentals.netprofit_margin == null ? "—" : `${fundamentals.netprofit_margin.toFixed(2)}%`}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">营收同比</div>
                          <div className={["mt-0.5 font-semibold", riskValueClass(fundamentals.yoy_sales != null && fundamentals.yoy_sales < 0)].join(" ")}>
                            {fundamentals.yoy_sales == null ? "—" : `${fundamentals.yoy_sales.toFixed(2)}%`}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">净利同比</div>
                          <div className={["mt-0.5 font-semibold", riskValueClass(fundamentals.yoy_netprofit != null && fundamentals.yoy_netprofit < 0)].join(" ")}>
                            {fundamentals.yoy_netprofit == null ? "—" : `${fundamentals.yoy_netprofit.toFixed(2)}%`}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">资产负债率</div>
                          <div className={["mt-0.5 font-semibold", riskValueClass(fundamentals.debt_to_assets != null && fundamentals.debt_to_assets >= 60)].join(" ")}>
                            {fundamentals.debt_to_assets == null ? "—" : `${fundamentals.debt_to_assets.toFixed(2)}%`}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-xl border border-[var(--border-soft)] bg-white/40 p-3">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between text-left text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]"
                      onClick={() => setOpenSignals((v) => !v)}
                    >
                      <span>策略信号</span>
                      <span className="text-[0.72rem] opacity-80">{openSignals ? "收起" : "展开"}</span>
                    </button>
                    {openSignals ? (
                      <div className="mt-2 grid gap-2 text-sm text-[var(--text-main)]">
                        {strategySignals.length ? (
                          strategySignals.map((s) => (
                            <div key={s.strategy} className="rounded-xl border border-[var(--border-soft)] bg-white/35 px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-semibold text-[var(--text-strong)]">{s.strategy}</div>
                                <div
                                  className={[
                                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                                    s.status === "hit"
                                      ? "bg-[rgba(16,185,129,0.18)] text-[rgba(6,95,70,0.98)]"
                                      : s.status === "near"
                                        ? "bg-[rgba(245,158,11,0.18)] text-[rgba(120,53,15,0.98)]"
                                        : "bg-[rgba(148,163,184,0.18)] text-[rgba(71,85,105,0.98)]",
                                  ].join(" ")}
                                >
                                  {s.status === "hit" ? "命中" : s.status === "near" ? "接近" : "未命中"}
                                </div>
                              </div>
                              {s.why?.length ? (
                                <ul className="mt-2 list-disc pl-5 text-xs leading-5 text-[var(--text-muted)]">
                                  {s.why.map((w, idx) => (
                                    <li key={idx}>{w}</li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-[var(--text-muted)]">暂无信号（或数据不足）。</div>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {keyLevels.length ? (
                    <div className="mt-3 rounded-xl border border-[var(--border-soft)] bg-white/40 p-3">
                      <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">关键价位</div>
                      <div className="mt-2 grid gap-2 text-sm text-[var(--text-main)]">
                        {keyLevels.map((k) => (
                          <div key={k.kind} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-soft)] bg-white/35 px-3 py-2">
                            <div className="text-xs font-semibold tracking-[0.12em] text-[var(--text-muted)]">
                              {k.kind === "support" ? "支撑" : k.kind === "resistance" ? "压力" : "止损"}
                            </div>
                            <div className="min-w-0 flex flex-1 items-center justify-end gap-3 text-right">
                              <div className="font-semibold text-[var(--text-strong)]">{k.price == null ? "—" : k.price}</div>
                              <div className="truncate text-xs text-[var(--text-muted)]">
                                {String(k.note || "")
                                  .replace(/\s*[（(]MVP[）)]\s*/g, "")
                                  .trim()}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" disabled={!selected || loading} onClick={onGenerateAi}>
                      {loading ? "生成中..." : "AI解读（生成一次）"}
                    </Button>
                  </div>
                  <div className="mt-4 text-xs text-[var(--text-muted)]">
                    这里会逐步补齐：行业(申万一/二级)、涨跌幅、PE(TTM)、策略信号与 reasons_json。
                  </div>
                </div>
              ) : null}
            </div>

            <div className="home-landing-surface-inset p-4">
              <button
                type="button"
                className="flex w-full items-center justify-between text-left text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]"
                onClick={() => setOpenAi((v) => !v)}
              >
                <span>AI解读 / 追问</span>
                <span className="text-[0.72rem] opacity-80">{openAi ? "收起" : "展开"}</span>
              </button>
              {openAi ? (
                !aiSummary ? (
                  <div className="mt-3 text-xs text-[var(--text-muted)]">点击上方“AI解读（生成一次）”后，这里会展示结构化摘要与追问记录。</div>
                ) : (
                  <div className="mt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">摘要</div>
                      <div className="text-xs font-semibold text-[var(--text-muted)]">
                        {(() => {
                          const rs = (aiSummary as any)?.risk_score;
                          const rl = (aiSummary as any)?.risk_level;
                          const v =
                            rs != null && !Number.isNaN(Number(rs))
                              ? Math.round(Number(rs))
                              : rl != null && !Number.isNaN(Number(rl))
                                ? Math.round(Number(rl) * 20)
                                : null;
                          return v == null ? null : `风险分 ${v}`;
                        })()}
                      </div>
                    </div>
                    <div className="mt-2 grid gap-1 text-sm text-[var(--text-main)]">
                      <div>
                        总体观点：
                        <span className="ml-2 font-semibold text-[var(--text-strong)]">
                          {aiSummary.overall_view === "bullish" ? "偏多" : aiSummary.overall_view === "bearish" ? "偏空" : "中性"}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {aiSummary.evidence_note
                          ? `证据链：${String(aiSummary.evidence_note).replace(/\s*[（(]MVP[）)]\s*/g, "").trim()}`
                          : "证据链：快照 + 策略信号 + 指标特征。"}
                      </div>
                      {Array.isArray((aiSummary as any)?.signals) && (aiSummary as any).signals.length ? (
                        <div className="text-xs text-[var(--text-muted)]">
                          策略：
                          {(aiSummary as any).signals
                            .map((s: any) => `${s.strategy}${s.status === "hit" ? "命中" : s.status === "near" ? "接近" : "未命中"}`)
                            .join("；")}
                        </div>
                      ) : null}
                    </div>

                    {/* 证据详情已移除：仅保留摘要与追问 */}

                    <div className="mt-4 grid gap-2">
                      <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">对话</div>

                      <div className="rounded-xl border border-[var(--border-soft)] bg-white/40">
                        <div ref={aiChatScrollRef} className="max-h-[320px] overflow-auto p-3">
                          <div className="grid gap-2">
                            {aiMessages.length ? (
                              aiMessages.map((m, idx) => {
                                const isUser = m.role === "user";
                                return (
                                  <div key={idx} className={["flex", isUser ? "justify-end" : "justify-start"].join(" ")}>
                                    <div
                                      className={[
                                        "max-w-[92%] rounded-2xl border px-3 py-2 text-sm leading-6 shadow-sm",
                                        isUser
                                          ? "border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.12)] text-[var(--text-strong)]"
                                          : "border-[var(--border-soft)] bg-white/60 text-[var(--text-main)]",
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
                                              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                              a: ({ href, children }) => (
                                                <a
                                                  href={href}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="underline decoration-[rgba(245,158,11,0.55)] underline-offset-2 hover:decoration-[rgba(245,158,11,0.85)]"
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
                                            }}
                                          >
                                            {m.content}
                                          </ReactMarkdown>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="text-xs text-[var(--text-muted)]">还没有对话内容，先点“AI解读（生成一次）”，再从这里追问。</div>
                            )}
                          </div>
                        </div>

                        <div className="border-t border-[var(--border-soft)] p-3">
                          <div className="flex gap-2">
                            <input
                              value={aiQuestion}
                              onChange={(e) => setAiQuestion(e.target.value)}
                              placeholder="例如：今天更偏向哪种策略？关键止损价位怎么看？"
                              className="h-10 w-full rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 text-sm text-[var(--text-main)] outline-none focus:border-[var(--focus-ring)]"
                              disabled={aiBusy}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void onAskAi();
                              }}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={aiBusy || !aiQuestion.trim()}
                              onClick={() => void onAskAi()}
                            >
                              {aiBusy ? "发送中" : "发送"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              ) : null}
            </div>
          </div>

          {/* Right: chart */}
          <div className="grid min-w-0 gap-3 self-start">
            <div className="home-landing-surface-inset p-4 self-start">
              <button
                type="button"
                className="flex w-full min-w-0 items-center justify-between overflow-hidden text-left"
                onClick={() => setOpenCharts((v) => !v)}
              >
                <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">图表</div>
                <div className="flex min-w-0 items-center gap-3">
                  <div ref={chartLegendScrollRef} className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-xs text-[var(--text-muted)]">
                    {indicatorLegend.date_ymd ? <span className="mr-3">{indicatorLegend.date_ymd}</span> : null}
                    <span className="mr-3">VOL {indicatorLegend.vol == null ? "—" : indicatorLegend.vol.toLocaleString("zh-CN")}</span>
                    <span className="mr-3">
                      O {indicatorLegend.o == null ? "—" : Number(indicatorLegend.o).toFixed(2)}
                      <span className="ml-2">C {indicatorLegend.c == null ? "—" : Number(indicatorLegend.c).toFixed(2)}</span>
                      <span className="ml-2">涨跌幅 {indicatorLegend.pct == null ? "—" : `${indicatorLegend.pct >= 0 ? "+" : ""}${indicatorLegend.pct.toFixed(2)}%`}</span>
                    </span>
                    {showKdj ? <span className="mr-3">KDJ J {indicatorLegend.kdj?.j == null ? "—" : round2(indicatorLegend.kdj.j).toFixed(2)}</span> : null}
                    {showMacd ? <span>MACD DIF {indicatorLegend.macd?.dif == null ? "—" : round2(indicatorLegend.macd.dif).toFixed(2)}</span> : null}
                  </div>
                  <div className="text-[0.72rem] opacity-80 text-[var(--text-muted)]">{openCharts ? "收起" : "展开"}</div>
                </div>
              </button>

              {openCharts ? (
                <div>
                  {klineErr ? (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{klineErr}</div>
                  ) : null}
                  <div className="relative mt-3 overflow-hidden rounded-xl border border-[var(--border-soft)] bg-white/30">
                    <div
                      ref={chartElRef}
                      className="relative h-[360px] w-full sm:h-[320px]"
                    />
                    <div className="pointer-events-none absolute left-0 top-0 z-10 p-2">
                      <div className="pointer-events-auto w-full max-w-full overflow-x-auto rounded-lg border border-[var(--border-soft)] bg-white/60 px-2 py-1 shadow-sm backdrop-blur">
                        <div className="max-w-full">
                          <div className="flex flex-nowrap items-center gap-1 whitespace-nowrap">
                          {[
                            { label: "日线", v: "1d" as const },
                            { label: "周线", v: "1w" as const },
                            { label: "月线", v: "1m" as const },
                          ].map((opt) => {
                            const active = freq === opt.v;
                            return (
                              <button
                                key={opt.v}
                                type="button"
                                className={[
                                  "rounded-md border px-2 py-1 text-xs font-semibold sm:px-3",
                                  active
                                    ? "border-[rgba(201,162,39,0.55)] bg-[rgba(201,162,39,0.18)] text-[var(--text-strong)]"
                                    : "border-[var(--border-soft)] bg-white/35 text-[var(--text-muted)] hover:bg-white/55",
                                ].join(" ")}
                                onClick={() => setFreq(opt.v)}
                                disabled={busy}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                          <div className="mx-1 h-5 w-px bg-black/10" />
                          <div className="relative" ref={barsPickerWrapRef}>
                            <button
                              type="button"
                              className={[
                                "rounded-md border px-2 py-1 text-xs font-semibold sm:px-3",
                                "border-[var(--border-soft)] bg-white/35 text-[var(--text-muted)] hover:bg-white/55",
                              ].join(" ")}
                              onClick={() => setBarsPickerOpen((v) => !v)}
                              disabled={busy}
                              title="选择最近多少根K线"
                            >
                              {visibleBars == null ? "全部" : `${visibleBars}`}
                            </button>
                            {barsPickerOpen ? (
                              <div className="absolute left-0 top-full z-20 mt-1 w-[220px] max-w-[calc(100vw-3rem)] rounded-lg border border-[var(--border-soft)] bg-white/90 p-2 shadow-lg backdrop-blur">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {[60, 120, 180, 250].map((n) => {
                                    const active = visibleBars === n;
                                    return (
                                      <button
                                        key={n}
                                        type="button"
                                        className={[
                                          "rounded-md border px-2 py-1 text-xs font-semibold sm:px-3",
                                          active
                                            ? "border-[rgba(201,162,39,0.55)] bg-[rgba(201,162,39,0.18)] text-[var(--text-strong)]"
                                            : "border-[var(--border-soft)] bg-white/35 text-[var(--text-muted)] hover:bg-white/55",
                                        ].join(" ")}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          setVisibleBars(n);
                                          setBarsPickerOpen(false);
                                        }}
                                        disabled={busy}
                                        title={`最近 ${n} 根K线`}
                                      >
                                        {n}
                                      </button>
                                    );
                                  })}
                                  <button
                                    type="button"
                                    className={[
                                      "rounded-md border px-2 py-1 text-xs font-semibold sm:px-3",
                                      visibleBars == null
                                        ? "border-[rgba(201,162,39,0.55)] bg-[rgba(201,162,39,0.18)] text-[var(--text-strong)]"
                                        : "border-[var(--border-soft)] bg-white/35 text-[var(--text-muted)] hover:bg-white/55",
                                    ].join(" ")}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      setVisibleBars(null);
                                      setBarsPickerOpen(false);
                                    }}
                                    disabled={busy}
                                    title="显示全量数据"
                                  >
                                    全部
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-md border border-[var(--border-soft)] bg-white/35 px-2 py-1 text-xs font-semibold text-[var(--text-muted)] hover:bg-white/55"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => setBarsPickerOpen(false)}
                                    disabled={busy}
                                    title="关闭"
                                  >
                                    关闭
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                          <div className="mx-1 h-5 w-px bg-black/10" />
                          <div className="relative" ref={maPickerWrapRef}>
                            <button
                              type="button"
                              className={[
                                "rounded-md border px-2 py-1 text-xs font-semibold sm:px-3",
                                maPeriods?.length
                                  ? "border-[rgba(201,162,39,0.55)] bg-[rgba(201,162,39,0.18)] text-[var(--text-strong)]"
                                  : "border-[var(--border-soft)] bg-white/35 text-[var(--text-muted)] hover:bg-white/55",
                              ].join(" ")}
                              onClick={() => setMaPickerOpen((v) => !v)}
                              disabled={busy}
                              title="选择MA周期（可多选）"
                            >
                              MA
                            </button>
                            {maPickerOpen ? (
                              <div className="absolute left-0 top-full z-20 mt-1 w-[320px] max-w-[calc(100vw-3rem)] rounded-lg border border-[var(--border-soft)] bg-white/90 p-2 shadow-lg backdrop-blur">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {ALL_MA_PERIODS.map((p) => {
                                    const active = (maPeriods || []).includes(p);
                                    return (
                                      <button
                                        key={p}
                                        type="button"
                                        className={[
                                          "rounded-md border px-2 py-1 text-xs font-semibold sm:px-3",
                                          active
                                            ? "border-[rgba(201,162,39,0.55)] bg-[rgba(201,162,39,0.18)] text-[var(--text-strong)]"
                                            : "border-[var(--border-soft)] bg-white/35 text-[var(--text-muted)] hover:bg-white/55",
                                        ].join(" ")}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() =>
                                          setMaPeriods((prev) => {
                                            const s = new Set<number>((prev || []).map((x) => Math.floor(Number(x))).filter((x) => Number.isFinite(x) && x > 1));
                                            if (s.has(p)) s.delete(p);
                                            else s.add(p);
                                            return Array.from(s.values()).sort((a, b) => a - b);
                                          })
                                        }
                                        disabled={busy}
                                        title={`MA${p}`}
                                      >
                                        {p}
                                      </button>
                                    );
                                  })}
                                  <div className="mx-1 h-5 w-px bg-black/10" />
                                  <button
                                    type="button"
                                    className="rounded-md border border-[var(--border-soft)] bg-white/35 px-2 py-1 text-xs font-semibold text-[var(--text-muted)] hover:bg-white/55"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => setMaPeriods([])}
                                    disabled={busy}
                                    title="清空MA"
                                  >
                                    清空
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-md border border-[var(--border-soft)] bg-white/35 px-2 py-1 text-xs font-semibold text-[var(--text-muted)] hover:bg-white/55"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => setMaPickerOpen(false)}
                                    disabled={busy}
                                    title="关闭"
                                  >
                                    关闭
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                          <div className="mx-1 h-5 w-px bg-black/10" />
                          <button
                            type="button"
                            className={[
                              "rounded-md border px-3 py-1 text-xs font-semibold",
                              showBoll
                                ? "border-[rgba(201,162,39,0.55)] bg-[rgba(201,162,39,0.18)] text-[var(--text-strong)]"
                                : "border-[var(--border-soft)] bg-white/35 text-[var(--text-muted)] hover:bg-white/55",
                            ].join(" ")}
                            onClick={() => setShowBoll((v) => !v)}
                            disabled={busy}
                            title="布林线（20,2）"
                          >
                            布林线
                          </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                    <div className="mt-3 grid gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className={[
                          "rounded-xl border px-3 py-1.5 text-xs font-semibold",
                          showKdj ? "border-[rgba(201,162,39,0.45)] bg-[rgba(201,162,39,0.12)] text-[var(--text-strong)]" : "border-[var(--border-soft)] bg-white/35 text-[var(--text-muted)]",
                        ].join(" ")}
                        onClick={() => setShowKdj((v) => !v)}
                      >
                        {showKdj ? "隐藏KDJ" : "显示KDJ"}
                      </button>
                      <button
                        type="button"
                        className={[
                          "rounded-xl border px-3 py-1.5 text-xs font-semibold",
                          showMacd
                            ? "border-[rgba(201,162,39,0.45)] bg-[rgba(201,162,39,0.12)] text-[var(--text-strong)]"
                            : "border-[var(--border-soft)] bg-white/35 text-[var(--text-muted)]",
                        ].join(" ")}
                        onClick={() => setShowMacd((v) => !v)}
                      >
                        {showMacd ? "隐藏MACD" : "显示MACD"}
                      </button>
                    </div>

                    {showKdj ? (
                      <div className="rounded-xl border border-[var(--border-soft)] bg-white/30 p-2">
                        <div className="px-1 pb-2 text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">KDJ</div>
                        <div ref={kdjElRef} className="relative h-[140px] w-full overflow-hidden" />
                      </div>
                    ) : null}
                    {showMacd ? (
                      <div className="rounded-xl border border-[var(--border-soft)] bg-white/30 p-2">
                        <div className="px-1 pb-2 text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">MACD</div>
                        <div ref={macdElRef} className="relative h-[160px] w-full overflow-hidden" />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
          </>
        )}
      </div>

      {helpOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(72,54,110,0.28)] p-4 backdrop-blur-[2px]"
          onClick={(e) => e.currentTarget === e.target && setHelpOpen(false)}
        >
          <div className="w-full max-w-[560px] rounded-[18px] border border-[rgba(255,255,255,0.72)] bg-[rgba(255,255,255,0.92)] p-4 text-[#5a4a7a] shadow-[0_18px_40px_rgba(70,50,110,0.18)]">
            <h3 className="mb-2 text-[1.12rem] font-bold text-[#665188]">帮助中心</h3>
            <p className="mb-2 text-[0.92rem] leading-[1.55] text-[#6b5a8b]">这里是资研参详（单股分析）入口：搜索代码、切换日/周/月周期、查看K线与指标副图。</p>
            <p className="mb-2 text-[0.92rem] leading-[1.55] text-[#6b5a8b]">AI 解读：点击“生成一次”产出结构化摘要；随后可在同一会话里继续追问。</p>
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

