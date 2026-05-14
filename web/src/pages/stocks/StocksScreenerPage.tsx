import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  buildScreenerResultsCsvUrl,
  deleteScreenerRun,
  getQuotesProgress,
  getScreenerResults,
  listScreenerRuns,
  runScreener,
  syncQuotes,
  streamSyncQuotes,
  type ScreenerResult,
  type ScreenerResultsOrder,
  type ScreenerResultsSort,
  type ScreenerRun,
  type ScreenerStrategy,
  type SyncProgress,
} from "../../lib/screenerClient";
import { errMsg, HttpError } from "../../lib/http";
import { Disclosure } from "../../components/ui/Disclosure";
import { Input } from "../../components/ui/input";
import { SkeletonList } from "../../components/ui/Skeleton";

const STRATEGIES: Array<{
  key: ScreenerStrategy;
  subtitle: string;
  /** 与后端 `stockSignals.ts` 中 evalB1 / evalB2 / evalB3 口径一致 */
  logicBullets: string[];
}> = [
  {
    key: "左侧埋伏",
    subtitle: "低位转强的早期信号",
    logicBullets: [
      "趋势语境：收盘价在 MA60 之上，且乖离不过大；排除「派发」类量价/MACD 形态。",
      "左侧特征：当日振幅不过大、KDJ 的 J 未过热、量能相对 5 日均量偏缩、实体不宜过大等硬筛。",
      "计分：MA 多头与结构、缩量程度、指标与回踩位置、买点分型与盈亏比等加权到 0～100，再映射命中/接近/未命中。",
    ],
  },
  {
    key: "右侧确认",
    subtitle: "趋势结构确认后跟随",
    logicBullets: [
      "前提：收盘在 MA60 之上；当日为强势阳线，且较前一日涨幅达到约 4% 量级。",
      "量能：相对前一日放量；若不放量则需「平量 + 阳包阴」等组合才通过。",
      "计分：在 J 与乖离未过热前提下，按上下影线、量能比、回踩 MA20/60、突破近 20 日平台等加分至 0～100。",
    ],
  },
  {
    key: "超短反转",
    subtitle: "短线回撤后的反弹",
    logicBullets: [
      "核心：近 60 根内识别 RSI(6) 与价格的「两次底背离」结构，未形成则直接 miss。",
      "风控：当前 RSI 不宜过高（避免背离后仍处追涨区）。",
      "计分：背离强度、RSI 区间、均线位置、5 日量能比、以及「第三点后反弹」等加权到 0～100。",
    ],
  },
];

const INDUSTRY_EMPTY_HINT =
  "未在基础资料中匹配到该代码的行业。若整列均为「未覆盖」，请检查 Tushare 配置并完成 stock_basic 同步。";

const STATUS_LABEL: Record<string, string> = { hit: "命中", near: "接近", miss: "未命中" };
const RUN_STATUS_LABEL: Record<string, string> = { running: "运行中", success: "已完成", failed: "失败" };

/** MACD 的 DIF（快线）说明：与单股页 MACD 子图一致（DIF / DEA / 柱）。 */
const MACD_DIF_TITLE =
  "MACD 的 DIF（快线）≈ 短期与长期指数均线的差值；常与 DEA 比较判断多空。柱值 = 2×(DIF−DEA)，动能看柱、拐点常看 DIF 与 DEA 交叉。";

function screenerTagChipClass(tag: string): string {
  if (/金叉|上穿30|上穿0轴/.test(tag)) return "border-[rgba(77,124,79,0.38)] bg-[var(--success-soft)] text-[var(--success)]";
  if (/死叉|下穿70|下穿0轴/.test(tag)) return "border-[rgba(179,38,30,0.38)] bg-[var(--danger-soft)] text-[var(--danger)]";
  return "border-[var(--border-soft)] bg-white/35 text-[var(--text-muted)]";
}

/** 将 snapshot 里的状态 + reasons_json.features + reasons_json.tags 拆成标签，便于扫读。 */
function ScreenerReasonChips({
  feat,
  status,
  tags,
  className,
}: {
  feat: Record<string, unknown> | undefined;
  status: string;
  tags?: string[];
  className?: string;
}) {
  const statusLabel = STATUS_LABEL[status] || (status ? status : "");
  const pct = feat?.pct1d != null ? Number(feat.pct1d) : null;
  const kVal = feat?.k != null ? Number(feat.k) : null;
  const dif = feat?.macd_dif != null ? Number(feat.macd_dif) : null;
  const tagList = Array.isArray(tags) ? tags.filter((t) => String(t).trim()) : [];

  const fullLine = [
    statusLabel,
    pct != null ? `1D ${pct.toFixed(2)}%` : "",
    kVal != null ? `K ${kVal.toFixed(1)}` : "",
    dif != null ? `DIF ${dif.toFixed(2)}` : "",
    tagList.length ? `信号：${tagList.join("、")}` : "",
  ]
    .filter(Boolean)
    .join(" / ");

  const statusTone =
    status === "hit"
      ? "border-[rgba(77,124,79,0.38)] bg-[var(--success-soft)] text-[var(--success)]"
      : status === "near"
        ? "border-[rgba(185,122,43,0.45)] bg-[var(--warning-soft)] text-[var(--warning)]"
        : status === "miss"
          ? "border-[var(--border-soft)] bg-white/25 text-[var(--text-muted)]"
          : "border-[var(--border-soft)] bg-white/35 text-[var(--text-muted)]";

  const hasAny = Boolean(statusLabel) || pct != null || kVal != null || dif != null || tagList.length > 0;

  return (
    <div className={["flex flex-wrap items-center gap-1", className].filter(Boolean).join(" ")} title={fullLine || undefined}>
      {statusLabel ? (
        <span className={`inline-flex shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-tight ${statusTone}`}>{statusLabel}</span>
      ) : null}
      {pct != null && Number.isFinite(pct) ? (
        <span
          className={[
            "inline-flex shrink-0 rounded-md border border-[var(--border-soft)] bg-white/45 px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums leading-tight",
            pct > 0 ? "text-[var(--quote-up)]" : pct < 0 ? "text-[var(--quote-down)]" : "text-[var(--text-muted)]",
          ].join(" ")}
          title="最近一根日 K 相对前收盘涨跌幅；颜色按 A 股习惯（红涨绿跌）。"
        >
          1D {pct > 0 ? "+" : ""}
          {pct.toFixed(2)}%
        </span>
      ) : null}
      {kVal != null && Number.isFinite(kVal) ? (
        <span
          className="inline-flex shrink-0 rounded-md border border-[var(--border-soft)] bg-white/30 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-[var(--text-muted)] leading-tight"
          title="KDJ 指标中的 K 值（0～100），与策略里「低位/超买」等语境相关。"
        >
          K {kVal.toFixed(1)}
        </span>
      ) : null}
      {dif != null && Number.isFinite(dif) ? (
        <span
          className="inline-flex shrink-0 rounded-md border border-[var(--border-soft)] bg-white/30 px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums leading-tight text-[var(--text-main)]"
          title={MACD_DIF_TITLE}
        >
          DIF {dif > 0 ? "+" : ""}
          {dif.toFixed(2)}
        </span>
      ) : null}
      {tagList.map((t, idx) => (
        <span
          key={`${t}-${idx}`}
          className={[
            "inline-flex max-w-[11rem] shrink-0 truncate rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-tight",
            screenerTagChipClass(t),
          ].join(" ")}
          title={`技术信号：${t}（最近一根日 K 相对前一根是否满足条件；重新运行策略后写入）`}
        >
          {t}
        </span>
      ))}
      {!hasAny ? <span className="text-[11px] text-[var(--text-muted)]">—</span> : null}
    </div>
  );
}

function normalizeSymbolInput(raw: string) {
  return String(raw || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();
}

/** 运行历史里只展示到日，避免长 ISO 占满一行 */
function formatRunListDay(iso: string | null | undefined): string {
  const s = String(iso || "").trim();
  if (!s) return "—";
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s.slice(0, 10);
}

function industryLine(it: { industry?: string | null }) {
  const a = it.industry ? String(it.industry).trim() : "";
  return a || "";
}

function marketLine(it: { market?: string | null }) {
  const a = it.market ? String(it.market).trim() : "";
  return a || "";
}

function parseNumField(s: string): number | undefined {
  const t = String(s || "").trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** 选股结果状态筛选：仅命中 / 接近（不含未命中） */
type ScreenerStatusFilter = "hit" | "near" | "hit_near";

function statusFilterToParam(mode: ScreenerStatusFilter): string {
  if (mode === "hit_near") return "hit,near";
  return mode;
}

function industryInParam(values: string[]): string | undefined {
  const list = values.map((x) => x.trim()).filter(Boolean);
  return list.length ? list.join(",") : undefined;
}

function marketInParam(values: string[]): string | undefined {
  const list = values.map((x) => x.trim()).filter(Boolean);
  return list.length ? list.join(",") : undefined;
}

function stringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function StocksScreenerPage() {
  const [ready, setReady] = useState(false);

  const [runs, setRuns] = useState<ScreenerRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [resultsTotal, setResultsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [sort, setSort] = useState<ScreenerResultsSort>("score");
  const [order, setOrder] = useState<ScreenerResultsOrder>("desc");
  const [filterIndustries, setFilterIndustries] = useState<string[]>([]);
  const [industryOptions, setIndustryOptions] = useState<string[]>([]);
  const [industryPickerOpen, setIndustryPickerOpen] = useState(false);
  const [filterMarkets, setFilterMarkets] = useState<string[]>([]);
  const [marketOptions, setMarketOptions] = useState<string[]>([]);
  const [platePickerOpen, setPlatePickerOpen] = useState(false);
  const [filterScoreMin, setFilterScoreMin] = useState("");
  const [filterScoreMax, setFilterScoreMax] = useState("");
  const [filterStatus, setFilterStatus] = useState<ScreenerStatusFilter>("hit_near");
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [running, setRunning] = useState<ScreenerStrategy | null>(null);
  const [deletingRunId, setDeletingRunId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  const pollRef = useRef<number | null>(null);
  const pollFailRef = useRef(0);
  const industryPickerWrapRef = useRef<HTMLDivElement | null>(null);
  const platePickerWrapRef = useRef<HTMLDivElement | null>(null);

  const selectedRun = useMemo(() => runs.find((r) => r.id === selectedRunId) || null, [runs, selectedRunId]);

  useEffect(() => {
    setReady(true);
  }, []);

  function refreshRuns() {
    setLoadingRuns(true);
    setErr(null);
    void listScreenerRuns(20)
      .then((r) => {
        const list = r.runs || [];
        setRuns(list);
        setSelectedRunId((sel) => {
          if (!list.length) return null;
          if (sel != null && list.some((x) => x.id === sel)) return sel;
          return list[0].id;
        });
      })
      .catch((e) => setErr(errMsg(e)))
      .finally(() => setLoadingRuns(false));
  }

  useEffect(() => {
    if (!ready) return;
    refreshRuns();
    // 初始查一次进度，若已有同步在跑则接入轮询
    void getQuotesProgress()
      .then((p) => {
        setProgress(p);
        if (p.running) startProgressPoll();
        else if (p.last_summary) setSyncMsg(`上次同步：${p.last_summary}`);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useLayoutEffect(() => {
    setPage(1);
  }, [selectedRunId, sort, order, filterIndustries, filterMarkets, filterScoreMin, filterScoreMax, filterStatus]);

  useEffect(() => {
    if (!ready) return;
    if (!selectedRunId) {
      setResults((prev) => (prev.length === 0 ? prev : []));
      setResultsTotal((t) => (t === 0 ? t : 0));
      setIndustryOptions((prev) => (prev.length === 0 ? prev : []));
      setFilterIndustries((prev) => (prev.length === 0 ? prev : []));
      setMarketOptions((prev) => (prev.length === 0 ? prev : []));
      setFilterMarkets((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    setLoadingResults(true);
    setErr(null);
    const offset = Math.max(0, (page - 1) * pageSize);
    void getScreenerResults({
      run_id: selectedRunId,
      limit: pageSize,
      offset,
      sort,
      order,
      industry_in: industryInParam(filterIndustries),
      market_in: marketInParam(filterMarkets),
      score_min: parseNumField(filterScoreMin),
      score_max: parseNumField(filterScoreMax),
      status_in: statusFilterToParam(filterStatus),
    })
      .then((r) => {
        setResults(r.items || []);
        setResultsTotal(Number(r.total || 0));
      })
      .catch((e) => {
        const rid = selectedRunId;
        if (e instanceof HttpError && e.status === 404 && rid != null) {
          setResults([]);
          setResultsTotal(0);
          void listScreenerRuns(20)
            .then((r2) => {
              const list = r2.runs || [];
              setRuns(list);
              setSelectedRunId(list[0]?.id ?? null);
            })
            .catch(() => {
              setRuns([]);
              setSelectedRunId(null);
            });
          setErr(`运行记录 ID ${rid} 已不存在（可能已删除或无权查看）。已刷新左侧列表并切换到最新一条；若无记录请重新「立即运行」。`);
          return;
        }
        setErr(errMsg(e));
      })
      .finally(() => setLoadingResults(false));
  }, [ready, selectedRunId, page, pageSize, sort, order, filterIndustries, filterMarkets, filterScoreMin, filterScoreMax, filterStatus]);

  useEffect(() => {
    if (!ready || !selectedRunId) return;
    void getScreenerResults({ run_id: selectedRunId, limit: 300, offset: 0, sort: "symbol", order: "asc" })
      .then((r) => {
        const items = r.items || [];
        const opts = Array.from(
          new Set(
            items
              .map((it) => industryLine(it))
              .map((x) => x.trim())
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
        setIndustryOptions((prev) => (stringArraysEqual(prev, opts) ? prev : opts));
        setFilterIndustries((prev) => {
          const next = prev.filter((x) => opts.includes(x));
          return stringArraysEqual(prev, next) ? prev : next;
        });
        const mopts = Array.from(
          new Set(items.map((it) => marketLine(it)).map((x) => x.trim()).filter(Boolean))
        ).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
        setMarketOptions((prev) => (stringArraysEqual(prev, mopts) ? prev : mopts));
        setFilterMarkets((prev) => {
          const next = prev.filter((x) => mopts.includes(x));
          return stringArraysEqual(prev, next) ? prev : next;
        });
      })
      .catch(() => {
        setIndustryOptions((prev) => (prev.length === 0 ? prev : []));
        setFilterIndustries((prev) => (prev.length === 0 ? prev : []));
        setMarketOptions((prev) => (prev.length === 0 ? prev : []));
        setFilterMarkets((prev) => (prev.length === 0 ? prev : []));
      });
  }, [ready, selectedRunId]);

  useEffect(() => {
    if (!industryPickerOpen && !platePickerOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      const inInd = industryPickerWrapRef.current?.contains(t);
      const inPlate = platePickerWrapRef.current?.contains(t);
      if (inInd || inPlate) return;
      setIndustryPickerOpen(false);
      setPlatePickerOpen(false);
    };
    window.addEventListener("pointerdown", onDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onDown, { capture: true } as any);
  }, [industryPickerOpen, platePickerOpen]);

  function toggleSort(next: ScreenerResultsSort) {
    if (sort === next) {
      setOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSort(next);
      setOrder(next === "symbol" ? "asc" : "desc");
    }
  }

  function onExportCsv() {
    if (!selectedRunId) return;
    const url = buildScreenerResultsCsvUrl({
      run_id: selectedRunId,
      sort,
      order,
      industry_in: industryInParam(filterIndustries),
      market_in: marketInParam(filterMarkets),
      score_min: parseNumField(filterScoreMin),
      score_max: parseNumField(filterScoreMax),
      status_in: statusFilterToParam(filterStatus),
    });
    window.open(url, "_blank", "noopener");
  }

  const totalPages = Math.max(1, Math.ceil(resultsTotal / pageSize));

  function toggleIndustryFilter(industry: string) {
    const v = industry.trim();
    if (!v) return;
    setFilterIndustries((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))));
  }

  function toggleMarketFilter(market: string) {
    const v = market.trim();
    if (!v) return;
    setFilterMarkets((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v].sort((a, b) => a.localeCompare(b, "zh-Hans-CN"))));
  }

  function startProgressPoll() {
    if (pollRef.current != null) return;
    setSyncing(true);
    pollFailRef.current = 0;
    pollRef.current = window.setInterval(async () => {
      try {
        const p = await getQuotesProgress();
        setProgress(p);
        pollFailRef.current = 0;
        if (!p.running) {
          stopProgressPoll();
          setSyncing(false);
          if (p.last_summary) setSyncMsg(`同步完成：${p.last_summary}`);
        }
      } catch {
        pollFailRef.current += 1;
        // 避免“进度请求失败但 UI 仍停在旧进度”造成假性卡死：连续失败则停止轮询并提示用户刷新/重试。
        if (pollFailRef.current >= 3) {
          stopProgressPoll();
          setSyncing(false);
          setErr("进度获取失败（可能登录失效或服务重启）。请刷新页面后重试同步。");
        }
      }
    }, 1500);
  }

  function stopProgressPoll() {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  useEffect(() => () => stopProgressPoll(), []);

  function onRun(strategy: ScreenerStrategy) {
    setRunning(strategy);
    setErr(null);
    void runScreener({ strategy, freq: "1d", topN: 50, lookbackDays: 80 })
      .then((r) => {
        setSelectedRunId(r.run_id);
        refreshRuns();
      })
      .catch((e) => setErr(errMsg(e)))
      .finally(() => setRunning(null));
  }

  async function onDeleteRun(r: ScreenerRun) {
    if (!confirm(`确定删除「${r.strategy} / ID ${r.id}」？该次选股结果将一并删除。`)) return;
    setDeletingRunId(r.id);
    setErr(null);
    try {
      await deleteScreenerRun(r.id);
      const next = runs.filter((x) => x.id !== r.id);
      setRuns(next);
      setSelectedRunId((sel) => (sel === r.id ? next[0]?.id ?? null : sel));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setDeletingRunId(null);
    }
  }

  function onSyncQuotes(lastNDays: number) {
    if (syncing) return;
    setSyncing(true);
    setSyncMsg(null);
    setErr(null);

    // 优先走 SSE：服务端立即返回并持续推 progress；失败则回退到 POST + 轮询。
    void streamSyncQuotes(
      { lastNTradeDays: lastNDays },
      {
        onProgress: (p) => setProgress(p),
      }
    )
      .then(async ({ progress: pFinal }) => {
        const p = pFinal && pFinal.last_summary ? pFinal : await getQuotesProgress().catch(() => pFinal);
        setProgress(p);
        if (p?.last_summary) setSyncMsg(`同步完成：${p.last_summary}`);
      })
      .catch(async (e) => {
        // SSE 不可用（如旧版本服务端、代理不透传 SSE），退回旧路径。
        try {
          startProgressPoll();
          const r = await syncQuotes({ lastNTradeDays: lastNDays });
          setSyncMsg(
            `同步完成：${r.start_date}~${r.end_date}，覆盖 ${r.trade_dates_with_data.length}/${r.trade_dates_attempted.length} 个交易日，写入 ${r.rows_upserted} 行${r.errors.length ? `，失败 ${r.errors.length}` : ""}。`
          );
        } catch (e2) {
          setSyncMsg(null);
          setErr(errMsg(e2 || e));
        } finally {
          void getQuotesProgress().then(setProgress).catch(() => {});
          stopProgressPoll();
        }
      })
      .finally(() => {
        setSyncing(false);
      });
  }

  const progressPct = progress && progress.total ? Math.round((100 * (progress.done || 0)) / progress.total) : 0;

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)] lg:items-start">
      <div className="grid gap-4 self-start">
        <div className="home-landing-surface-inset p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">行情缓存</div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">每日 17:00 自动同步；首次使用建议先灌入历史。</div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => onSyncQuotes(90)}
                disabled={syncing}
                className="touch-manipulation rounded-lg border border-[var(--border-soft)] bg-white/40 px-3 py-2 text-xs font-semibold text-[var(--text-strong)] hover:bg-white/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(201,162,39,0.6)] disabled:opacity-60"
              >
                {syncing ? "同步中…" : "灌入90天"}
              </button>
              <button
                type="button"
                onClick={() => onSyncQuotes(7)}
                disabled={syncing}
                className="touch-manipulation rounded-lg border border-[var(--border-soft)] bg-white/40 px-3 py-2 text-xs font-semibold text-[var(--text-strong)] hover:bg-white/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(201,162,39,0.6)] disabled:opacity-60"
              >
                增量7天
              </button>
            </div>
          </div>
          {progress?.running ? (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>{progress.current_date || "—"} · {progress.done || 0}/{progress.total || 0}</span>
                <span>{progressPct}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/10">
                <div
                  className="h-full rounded-full bg-[rgba(201,162,39,0.8)] transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-[var(--text-muted)]">已写入 {progress.rows_upserted || 0} 行{progress.errors ? `，失败 ${progress.errors}` : ""}</div>
            </div>
          ) : syncMsg ? (
            <div className="mt-2 text-xs text-[var(--text-muted)]">{syncMsg}</div>
          ) : null}
        </div>

        <div className="home-landing-surface-inset p-4">
          <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">策略</div>
          <div className="mt-2.5 grid gap-1.5 sm:gap-2">
            {STRATEGIES.map((s) => (
              <div key={s.key} className="rounded-lg border border-[var(--border-soft)] bg-white/40 p-2.5 sm:p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--text-strong)]">{s.key}</div>
                    <div className="mt-0.5 text-xs text-[var(--text-muted)]">{s.subtitle}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRun(s.key)}
                    disabled={running != null}
                    className="touch-manipulation shrink-0 rounded-lg bg-[var(--btn-primary-bg)] px-3 py-2.5 text-center text-xs font-semibold text-[var(--btn-primary-text)] shadow-sm hover:brightness-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(201,162,39,0.6)] disabled:opacity-60 sm:min-w-[5.5rem] sm:py-2"
                  >
                    {running === s.key ? "运行中…" : "立即运行"}
                  </button>
                </div>
                <div className="mt-1">
                  <Disclosure
                    variant="ghost"
                    title="策略细则"
                    hint="展开"
                    hintOpen="收起"
                    defaultOpen={false}
                  >
                    <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-[var(--text-main)] marker:text-[var(--text-muted)]">
                      {s.logicBullets.map((line, idx) => (
                        <li key={idx}>{line}</li>
                      ))}
                    </ul>
                  </Disclosure>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="home-landing-surface-inset p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">运行历史</div>
            <div className="flex items-center gap-2">
              {runs.length > 0 ? (
                <span className="text-[11px] text-[var(--text-muted)]">共 {runs.length} 条</span>
              ) : null}
              {loadingRuns ? <div className="text-xs text-[var(--text-muted)]">加载中…</div> : null}
            </div>
          </div>
          <div
            className="mt-2 max-h-[min(200px,32vh)] overflow-y-auto overscroll-y-contain rounded-lg border border-[var(--border-soft)]/70 bg-white/25 p-1"
            role="region"
            aria-label="策略运行历史列表"
          >
            <div className="grid gap-1">
              {loadingRuns && !runs.length ? (
                <SkeletonList rows={3} rowClass="h-11" />
              ) : runs.length ? (
                runs.map((r) => (
                  <div
                    key={r.id}
                    className={[
                      "flex gap-0.5 rounded-lg border p-0.5",
                      selectedRunId === r.id
                        ? "border-[rgba(201,162,39,0.45)] bg-[rgba(201,162,39,0.12)]"
                        : "border-[var(--border-soft)]/80 bg-white/30",
                    ].join(" ")}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedRunId(r.id)}
                      className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(201,162,39,0.6)] hover:bg-white/45"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs font-semibold text-[var(--text-strong)]">{r.strategy}</span>
                        <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">ID {r.id}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                        {RUN_STATUS_LABEL[r.status] || r.status}
                        {r.finished_at ? ` · ${formatRunListDay(r.finished_at)}` : ` · ${formatRunListDay(r.started_at)}`}
                      </div>
                      {r.error ? (
                        <div className="mt-0.5 truncate text-[11px] text-red-700" title={r.error}>
                          {r.error}
                        </div>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      title={r.status === "running" ? "运行中，请稍后再删" : "删除此条运行记录"}
                      disabled={deletingRunId != null || r.status === "running"}
                      onClick={() => void onDeleteRun(r)}
                      className="shrink-0 self-stretch rounded-md border border-[var(--border-soft)] bg-white/50 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text-muted)] hover:border-red-300/60 hover:bg-red-50/80 hover:text-red-800 disabled:opacity-50"
                    >
                      {deletingRunId === r.id ? "…" : "删"}
                    </button>
                  </div>
                ))
              ) : (
                <div className="px-2 py-4 text-center text-xs text-[var(--text-muted)]">暂无运行记录，先点「立即运行」。</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="home-landing-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-base font-semibold leading-snug tracking-tight text-[var(--text-strong)] sm:text-[1.0625rem]">
              结果 {selectedRun ? `（${selectedRun.strategy}）` : ""}
              {resultsTotal ? <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">共 {resultsTotal} 条</span> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {loadingResults ? <div className="text-xs text-[var(--text-muted)]">加载中…</div> : null}
            <button
              type="button"
              onClick={onExportCsv}
              disabled={!selectedRunId || !results.length}
              className="rounded-lg border border-[var(--border-soft)] bg-white/40 px-3 py-1.5 text-xs font-semibold text-[var(--text-strong)] hover:bg-white/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(201,162,39,0.6)] disabled:opacity-60"
            >
              导出 CSV
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-[var(--border-soft)] bg-white/25 p-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="grid gap-1" ref={industryPickerWrapRef}>
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">行业</span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setPlatePickerOpen(false);
                    setIndustryPickerOpen((v) => !v);
                  }}
                  className={[
                    "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-xl border px-2 text-left text-sm outline-none focus:border-[var(--focus-ring)]",
                    filterIndustries.length
                      ? "border-[rgba(201,162,39,0.45)] bg-[rgba(201,162,39,0.12)] text-[var(--text-strong)]"
                      : "border-[var(--border-soft)] bg-[var(--surface-soft)] text-[var(--text-muted)]",
                  ].join(" ")}
                  title={filterIndustries.length ? filterIndustries.join("、") : "选择行业"}
                >
                  <span className="truncate">{filterIndustries.length ? filterIndustries.join("、") : "全部行业"}</span>
                  <span className="shrink-0 text-[10px]">{industryPickerOpen ? "▲" : "▼"}</span>
                </button>
                {industryPickerOpen ? (
                  <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-[min(360px,calc(100vw-3rem))] overflow-auto rounded-xl border border-[var(--border-soft)] bg-white/95 p-2 shadow-lg backdrop-blur">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-[var(--text-muted)]">
                        {industryOptions.length ? `可选 ${industryOptions.length} 个行业` : "暂无行业数据"}
                      </div>
                      {filterIndustries.length ? (
                        <button
                          type="button"
                          onClick={() => setFilterIndustries([])}
                          className="rounded-md border border-[var(--border-soft)] bg-white/50 px-2 py-1 text-xs font-semibold text-[var(--text-muted)] hover:bg-white/70"
                        >
                          清空
                        </button>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {industryOptions.map((industry) => {
                        const active = filterIndustries.includes(industry);
                        return (
                          <button
                            key={industry}
                            type="button"
                            onClick={() => toggleIndustryFilter(industry)}
                            className={[
                              "rounded-md border px-2 py-1 text-xs font-semibold",
                              active
                                ? "border-[rgba(201,162,39,0.55)] bg-[rgba(201,162,39,0.18)] text-[var(--text-strong)]"
                                : "border-[var(--border-soft)] bg-white/35 text-[var(--text-muted)] hover:bg-white/55",
                            ].join(" ")}
                          >
                            {active ? `✓ ${industry}` : industry}
                          </button>
                        );
                      })}
                      {!industryOptions.length ? <span className="text-xs text-[var(--text-muted)]">当前运行结果没有行业字段。</span> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="grid gap-1" ref={platePickerWrapRef}>
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">板块</span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setIndustryPickerOpen(false);
                    setPlatePickerOpen((v) => !v);
                  }}
                  className={[
                    "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-xl border px-2 text-left text-sm outline-none focus:border-[var(--focus-ring)]",
                    filterMarkets.length
                      ? "border-[rgba(201,162,39,0.45)] bg-[rgba(201,162,39,0.12)] text-[var(--text-strong)]"
                      : "border-[var(--border-soft)] bg-[var(--surface-soft)] text-[var(--text-muted)]",
                  ].join(" ")}
                  title={filterMarkets.length ? filterMarkets.join("、") : "选择上市板（主板/创业板等）"}
                >
                  <span className="truncate">{filterMarkets.length ? filterMarkets.join("、") : "全部板块"}</span>
                  <span className="shrink-0 text-[10px]">{platePickerOpen ? "▲" : "▼"}</span>
                </button>
                {platePickerOpen ? (
                  <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-[min(360px,calc(100vw-3rem))] overflow-auto rounded-xl border border-[var(--border-soft)] bg-white/95 p-2 shadow-lg backdrop-blur">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-[var(--text-muted)]">
                        {marketOptions.length ? `可选 ${marketOptions.length} 类` : "暂无板块数据"}
                      </div>
                      {filterMarkets.length ? (
                        <button
                          type="button"
                          onClick={() => setFilterMarkets([])}
                          className="rounded-md border border-[var(--border-soft)] bg-white/50 px-2 py-1 text-xs font-semibold text-[var(--text-muted)] hover:bg-white/70"
                        >
                          清空
                        </button>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {marketOptions.map((m) => {
                        const active = filterMarkets.includes(m);
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => toggleMarketFilter(m)}
                            className={[
                              "rounded-md border px-2 py-1 text-xs font-semibold",
                              active
                                ? "border-[rgba(201,162,39,0.55)] bg-[rgba(201,162,39,0.18)] text-[var(--text-strong)]"
                                : "border-[var(--border-soft)] bg-white/35 text-[var(--text-muted)] hover:bg-white/55",
                            ].join(" ")}
                          >
                            {active ? `✓ ${m}` : m}
                          </button>
                        );
                      })}
                      {!marketOptions.length ? (
                        <span className="text-xs text-[var(--text-muted)]">当前运行结果没有上市板字段。</span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">分数 ≥</span>
              <Input
                type="number"
                inputMode="decimal"
                value={filterScoreMin}
                onChange={(e) => setFilterScoreMin(e.target.value)}
                placeholder="空为不限"
                className="h-9 text-sm"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">分数 ≤</span>
              <Input
                type="number"
                inputMode="decimal"
                value={filterScoreMax}
                onChange={(e) => setFilterScoreMax(e.target.value)}
                placeholder="空为不限"
                className="h-9 text-sm"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">命中状态</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as ScreenerStatusFilter)}
                className="h-9 rounded-xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--focus-ring)]"
              >
                <option value="hit_near">命中或接近</option>
                <option value="hit">仅命中</option>
                <option value="near">仅接近</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              setFilterIndustries([]);
              setFilterMarkets([]);
              setFilterScoreMin("");
              setFilterScoreMax("");
              setFilterStatus("hit_near");
            }}
            className="h-9 shrink-0 rounded-xl border border-[var(--border-soft)] bg-white/40 px-3 text-xs font-semibold text-[var(--text-strong)] hover:bg-white/55"
          >
            重置筛选
          </button>
        </div>

        {err ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

        <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border-soft)] bg-white/35">
          <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_72px_88px] items-center gap-x-3 gap-y-0 border-b border-[var(--border-soft)] bg-white/35 px-3 py-2 text-xs font-semibold text-[var(--text-muted)] sm:grid-cols-[2.75rem_minmax(0,140px)_minmax(0,96px)_72px_minmax(0,1fr)_110px]">
            <div className="text-left tabular-nums leading-none" title="按筛选与排序后的连续序号，翻页延续">
              序号
            </div>
            <button
              type="button"
              onClick={() => toggleSort("symbol")}
              className="min-w-0 text-left hover:text-[var(--text-strong)]"
              title="按标的排序"
            >
              标的{sort === "symbol" ? (order === "asc" ? " ↑" : " ↓") : ""}
            </button>
            <div className="hidden min-w-0 sm:block" title="Tushare stock_basic：industry">
              行业
            </div>
            <button
              type="button"
              onClick={() => toggleSort("score")}
              className="text-right hover:text-[var(--text-strong)]"
              title="按分数排序"
            >
              分数{sort === "score" ? (order === "asc" ? " ↑" : " ↓") : ""}
            </button>
            <div className="hidden min-w-0 sm:block text-left">理由（精选）</div>
            <div className="text-right sm:hidden">操作</div>
            <div className="hidden text-right sm:block">操作</div>
          </div>
          {loadingResults && !results.length ? (
            <div className="px-3 py-3">
              <SkeletonList rows={6} rowClass="h-10" />
            </div>
          ) : results.length ? (
            <div className="max-h-[520px] overflow-auto">
              {results.map((it, idx) => {
                const rowNo = (page - 1) * pageSize + idx + 1;
                const feat = (it.reasons_json as any)?.features as Record<string, unknown> | undefined;
                const tagArr = Array.isArray((it.reasons_json as any)?.tags) ? ((it.reasons_json as any).tags as string[]) : [];
                const status = String((it.snapshot_json as any)?.status || "");
                const sym = normalizeSymbolInput(it.symbol);

                const ind = industryLine(it);
                const indTitle = ind || undefined;

                return (
                  <div
                    key={it.id}
                    className="grid grid-cols-[2.75rem_minmax(0,1fr)_72px_88px] items-start gap-x-3 gap-y-1 border-b border-[var(--border-soft)] px-3 py-2 text-sm text-[var(--text-main)] last:border-b-0 sm:grid-cols-[2.75rem_minmax(0,140px)_minmax(0,96px)_72px_minmax(0,1fr)_110px] sm:items-center"
                  >
                    <div className="self-start pt-1 text-left text-xs font-semibold tabular-nums leading-none text-[var(--text-muted)] sm:self-center sm:pt-0">{rowNo}</div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-[var(--text-strong)]">{it.name || it.symbol}</div>
                      <div className="truncate text-xs text-[var(--text-muted)]">{it.symbol}</div>
                      {ind ? (
                        <div className="mt-0.5 truncate text-[11px] text-[var(--text-muted)] sm:hidden" title={indTitle}>
                          {ind}
                        </div>
                      ) : (
                        <div className="mt-0.5 text-[11px] text-[var(--text-muted)] sm:hidden" title={INDUSTRY_EMPTY_HINT}>
                          未覆盖
                        </div>
                      )}
                    </div>
                    <div className="hidden min-w-0 sm:block" title={indTitle}>
                      {ind ? (
                        <div className="truncate text-xs font-medium text-[var(--text-strong)]">{ind}</div>
                      ) : (
                        <div className="text-xs text-[var(--text-muted)]" title={INDUSTRY_EMPTY_HINT}>
                          未覆盖
                        </div>
                      )}
                    </div>
                    <div className="text-right text-sm font-semibold tabular-nums text-[var(--text-strong)]">
                      {it.score == null ? "—" : it.score.toFixed(2)}
                    </div>
                    <div className="hidden min-w-0 sm:block">
                      <ScreenerReasonChips feat={feat} status={status} tags={tagArr} />
                    </div>
                    <div className="text-right">
                      {sym ? (
                        <Link
                          to={`/stocks?tab=single&symbol=${encodeURIComponent(sym)}`}
                          className="inline-flex rounded-lg border border-[var(--border-soft)] bg-white/40 px-2 py-1 text-xs font-semibold text-[var(--text-strong)] hover:bg-white/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(201,162,39,0.6)]"
                        >
                          查看
                        </Link>
                      ) : (
                        <span className="inline-flex cursor-not-allowed rounded-lg border border-[var(--border-soft)] bg-white/20 px-2 py-1 text-xs font-semibold text-[var(--text-muted)] opacity-70">
                          查看
                        </span>
                      )}
                    </div>
                    <div className="col-span-4 pb-0.5 sm:hidden">
                      <ScreenerReasonChips feat={feat} status={status} tags={tagArr} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-3 py-6 text-sm text-[var(--text-muted)]">暂无结果。先选择一个运行记录，或点击左侧"立即运行"。</div>
          )}
        </div>

        {resultsTotal > pageSize ? (
          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
            <div>
              第 {page} / {totalPages} 页，共 {resultsTotal} 条
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loadingResults}
                className="rounded-md border border-[var(--border-soft)] bg-white/40 px-2 py-1 font-semibold text-[var(--text-strong)] hover:bg-white/55 disabled:opacity-50"
              >
                上一页
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loadingResults}
                className="rounded-md border border-[var(--border-soft)] bg-white/40 px-2 py-1 font-semibold text-[var(--text-strong)] hover:bg-white/55 disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
