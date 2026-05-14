import { useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { Button } from "../../components/ui/button";
import { StatusBanner } from "../../components/ui/StatusBanner";
import { cn } from "../../lib/cn";
import { errMsg } from "../../lib/http";
import { getStockHotNews, postStockHotNewsSummary, type StockHotNewsItem } from "../../lib/stocksClient";

const FILTER_GROUPS = [
  { title: "总览", tags: ["全部"] },
  { title: "AI算力链", tags: ["AI", "CPO", "光模块", "GPU", "算力", "数据中心", "HBM", "先进封装"] },
  { title: "科技制造", tags: ["半导体", "机器人", "低空经济", "商业航天", "汽车", "新能源"] },
  { title: "行业", tags: ["医药", "消费", "地产", "银行", "军工", "有色"] },
  { title: "市场宏观", tags: ["宏观", "A股"] },
] as const;

const FILTERS = FILTER_GROUPS.flatMap((g) => g.tags) as Array<string>;

/** 摘要内规则高亮：宏观/市场用语、日期、涨跌幅、财报词等（长词优先于短词） */
const SUMMARY_KEYWORD_SOURCE = [
  "\\d{4}年\\d{1,2}月\\d{1,2}日",
  "\\d+(?:\\.\\d+)?%",
  "(?:同比|环比)(?:增长|下降|回落|提升|收窄)?",
  "净利润|营业收入|营收|每股收益|EPS|ROE",
  "暴涨|暴跌|大涨|大跌|拉升|跳水|走强|回落|震荡",
  "涨停|跌停|闪崩|破发",
  "降息|加息|降准|降息预期|加息预期",
  "央行|美联储|欧央行|国务院|证监会|财政部|银保监会|统计局",
  "沪指|上证|深成指|创业板指|科创50|北证50|恒生指数|恒生|纳指|标普|道琼斯",
  "A股|港股|美股|日股|欧股",
  "增持|减持|回购|举牌|要约收购|资产重组|并购|借壳|混改",
  "IPO|定增|配股|转债|可转债",
  "预亏|预增|扭亏|盈转亏|业绩快报|业绩预告|财报",
  "\\*?ST|停牌|复牌|退市|风险警示",
  "分红|派息|除权|除息|股权登记",
  "关税|制裁|地缘政治",
].join("|");

const SUMMARY_TAG_SOURCE = FILTERS.filter((t) => t !== "全部")
  .sort((a, b) => b.length - a.length)
  .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

function renderHighlightedSummary(text: string): ReactNode {
  const src = SUMMARY_TAG_SOURCE.length ? `${SUMMARY_KEYWORD_SOURCE}|(?:${SUMMARY_TAG_SOURCE})` : SUMMARY_KEYWORD_SOURCE;
  const re = new RegExp(src, "g");
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    const hit = m[0];
    if (!hit) {
      if (re.lastIndex === m.index) re.lastIndex++;
      continue;
    }
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(
      <mark
        key={`mk-${k++}`}
        className="rounded-sm bg-[rgba(201,162,39,0.32)] px-0.5 font-semibold text-[var(--text-strong)] ring-1 ring-inset ring-[rgba(201,162,39,0.35)]"
      >
        {hit}
      </mark>
    );
    last = m.index + hit.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : text;
}

const aiSummaryMdComponents = {
  ul: ({ children }: { children?: ReactNode }) => <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">{children}</ul>,
  ol: ({ children }: { children?: ReactNode }) => <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">{children}</ol>,
  li: ({ children }: { children?: ReactNode }) => <li className="text-[var(--text-main)]">{children}</li>,
  p: ({ children }: { children?: ReactNode }) => <p className="mb-2 text-sm leading-relaxed last:mb-0">{children}</p>,
  strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold text-[var(--text-strong)]">{children}</strong>,
};

function sentimentClass(s: StockHotNewsItem["sentiment"]) {
  if (s === "利好") return "border-[rgba(179,38,30,0.28)] bg-[rgba(254,226,226,0.55)] text-[var(--quote-up)]";
  if (s === "利空") return "border-[rgba(22,101,52,0.26)] bg-[rgba(220,252,231,0.45)] text-[var(--quote-down)]";
  return "border-[var(--border-soft)] bg-white/35 text-[var(--text-muted)]";
}

function importanceClass(level: StockHotNewsItem["importance_level"]) {
  if (level === "高") return "border-[rgba(179,38,30,0.32)] bg-[rgba(254,226,226,0.72)] text-[var(--quote-up)]";
  if (level === "中") return "border-[rgba(185,122,43,0.38)] bg-[var(--warning-soft)] text-[var(--warning)]";
  return "border-[var(--border-soft)] bg-white/35 text-[var(--text-muted)]";
}

function importanceAccentClass(level: StockHotNewsItem["importance_level"]) {
  if (level === "高") return "border-l-[3px] border-l-[rgba(201,162,39,0.85)]";
  if (level === "中") return "border-l-[3px] border-l-[rgba(185,122,43,0.65)]";
  return "border-l-[3px] border-l-[var(--border-soft)]";
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "时间未知";
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function NewsRow({
  it,
  expanded,
  onToggleSummary,
}: {
  it: StockHotNewsItem;
  expanded: boolean;
  onToggleSummary: () => void;
}) {
  const summary = String(it.summary || "").trim();
  const showToggle = summary.length > 80;
  const tagsShow = it.tags.slice(0, 3);

  return (
    <article
      className={[
        "rounded-lg border border-[var(--border-soft)] bg-white/40 px-2.5 py-2 shadow-sm backdrop-blur-sm sm:px-3",
        importanceAccentClass(it.importance_level),
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-[var(--text-muted)]">
        <span className="font-semibold text-[var(--text-main)]">{it.source}</span>
        <span className="tabular-nums">{formatTime(it.published_at)}</span>
        <span
          className={`rounded-full border px-1.5 py-0.5 font-semibold ${importanceClass(it.importance_level)}`}
          title={`${it.importance_score}/100 · ${it.importance_reason}`}
        >
          {it.importance_level} {it.importance_score}
        </span>
        <span className={`rounded-full border px-1.5 py-0.5 font-semibold ${sentimentClass(it.sentiment)}`}>{it.sentiment}</span>
        {tagsShow.map((tag) => (
          <span key={tag} className="rounded-full border border-[var(--border-soft)] bg-white/35 px-1.5 py-0.5 text-[var(--text-muted)]">
            {tag}
          </span>
        ))}
      </div>
      <a
        href={it.url}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 block text-[0.9rem] font-extrabold leading-snug text-[var(--text-strong)] hover:underline sm:text-[0.95rem]"
      >
        {it.title}
      </a>
      {summary ? (
        <div className="mt-1.5">
          <p
            className={["text-[13px] leading-snug text-[var(--text-main)] whitespace-pre-line", expanded ? "" : "line-clamp-2"].filter(Boolean).join(" ")}
            title={expanded ? undefined : summary}
          >
            {renderHighlightedSummary(summary)}
          </p>
          {showToggle ? (
            <button
              type="button"
              onClick={onToggleSummary}
              className="mt-0.5 text-[11px] font-semibold text-[rgba(201,162,39,0.95)] hover:underline"
            >
              {expanded ? "收起摘要" : "展开摘要"}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function StocksHotNewsPage() {
  const [items, setItems] = useState<StockHotNewsItem[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<Array<{ source: string; ok: boolean; count: number; error?: string }>>([]);
  const [fetchedAt, setFetchedAt] = useState("");
  const [activeTag, setActiveTag] = useState<string>("全部");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [summaryOpen, setSummaryOpen] = useState<Record<string, boolean>>({});
  const [aiSummary, setAiSummary] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    setAiSummary("");
    setAiModel("");
    setAiErr("");
    try {
      const out = await getStockHotNews(30);
      setItems(out.items || []);
      setSources(out.sources || []);
      setDiagnostics(out.diagnostics || []);
      setFetchedAt(out.fetched_at || "");
      setSummaryOpen({});
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (activeTag === "全部") return items;
    return items.filter((it) => it.tags.includes(activeTag));
  }, [activeTag, items]);

  async function requestAiSummary() {
    const slice = filtered.slice(0, 20).map((it) => ({
      title: it.title,
      summary: it.summary ?? "",
      source: it.source,
    }));
    if (!slice.length) return;
    setAiBusy(true);
    setAiErr("");
    try {
      const out = await postStockHotNewsSummary({ items: slice });
      setAiSummary(out.text || "");
      setAiModel(out.model || "");
    } catch (e) {
      setAiErr(errMsg(e));
      setAiSummary("");
      setAiModel("");
    } finally {
      setAiBusy(false);
    }
  }

  useEffect(() => {
    setAiSummary("");
    setAiModel("");
    setAiErr("");
  }, [activeTag]);

  const tagCounts = useMemo(() => {
    const out = new Map<string, number>();
    out.set("全部", items.length);
    for (const tag of FILTERS) {
      if (tag === "全部") continue;
      out.set(tag, items.filter((it) => it.tags.includes(tag)).length);
    }
    return out;
  }, [items]);

  const bullishTagRank = useMemo(() => {
    const rows = FILTERS.filter((tag) => tag !== "全部")
      .map((tag) => {
        const list = items.filter((it) => it.tags.includes(tag));
        const bullish = list.filter((it) => it.sentiment === "利好").length;
        const bearish = list.filter((it) => it.sentiment === "利空").length;
        const neutral = list.filter((it) => it.sentiment === "中性").length;
        const total = list.length;
        const avgImportance = total
          ? Math.round(list.reduce((sum, it) => sum + (Number(it.importance_score) || 0), 0) / total)
          : 0;
        const bullishRatio = total ? bullish / total : 0;
        return { tag, total, bullish, bearish, neutral, avgImportance, bullishRatio };
      })
      .filter((row) => row.total > 0)
      .sort((a, b) => {
        if (b.bullish !== a.bullish) return b.bullish - a.bullish;
        if (b.bullishRatio !== a.bullishRatio) return b.bullishRatio - a.bullishRatio;
        if (b.avgImportance !== a.avgImportance) return b.avgImportance - a.avgImportance;
        if (b.total !== a.total) return b.total - a.total;
        return a.bearish - b.bearish;
      });
    return rows.slice(0, 10);
  }, [items]);

  const { highlights, others } = useMemo(() => {
    const highs = filtered.filter((it) => it.importance_level === "高" || it.importance_score >= 66);
    const seen = new Set<string>();
    const highlights: StockHotNewsItem[] = [];
    for (const it of highs) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      highlights.push(it);
      if (highlights.length >= 6) break;
    }
    const hid = new Set(highlights.map((h) => h.id));
    const others = filtered.filter((it) => !hid.has(it.id));
    return { highlights, others };
  }, [filtered]);

  const diagHasFailure = diagnostics.some((d) => !d.ok);

  return (
    <section className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-4">
      <aside className="home-landing-surface-inset h-fit p-2.5 sm:p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-extrabold text-[var(--text-strong)]">热点筛选</h2>
          <Button type="button" variant="secondary" size="xs" onClick={() => void load()} disabled={loading}>
            {loading ? "刷新中" : "刷新"}
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-y-1">
          {FILTER_GROUPS.map((group, gi) => (
            <div key={group.title} className="w-full">
              <div className={cn("mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]", gi > 0 ? "mt-1.5" : "mt-0")}>
                {group.title}
              </div>
              <div className="flex flex-wrap gap-x-1 gap-y-1">
                {group.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={
                      activeTag === tag
                        ? "rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-2 py-0.5 text-[11px] font-semibold leading-tight text-[var(--text-strong)]"
                        : "rounded-full border border-transparent px-2 py-0.5 text-[11px] font-semibold leading-tight text-[var(--text-muted)] hover:border-[var(--border-soft)] hover:bg-white/45"
                    }
                    onClick={() => setActiveTag(tag)}
                  >
                    {tag}
                    {items.length ? <span className="ml-0.5 text-[9px] opacity-70 tabular-nums">{tagCounts.get(tag) ?? 0}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {bullishTagRank.length ? (
          <div
            className="mt-2.5 border-t border-[var(--border-soft)] pt-2.5"
            title="基于当前拉取的全量新闻。排序：利好条数 → 利好占比 → 均重 → 覆盖条数 → 利空更少优先。点行与上方标签同步筛选。"
          >
            <div className="text-[10px] font-semibold text-[var(--text-muted)]">细分利好榜</div>
            <p className="mt-0.5 text-[9px] leading-tight text-[var(--text-muted)]">全量样本内排序；点行切标签（细则见悬停）。</p>
            <ul className="mt-1.5 flex max-h-[min(11rem,32vh)] flex-col gap-0.5 overflow-y-auto overscroll-contain pr-0.5">
              {bullishTagRank.map((row, idx) => (
                <li key={row.tag}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between gap-1.5 rounded-md border px-1.5 py-1 text-left text-[10px] leading-tight transition-colors",
                      activeTag === row.tag
                        ? "border-[var(--border-soft)] bg-[var(--surface-soft)] ring-1 ring-inset ring-[rgba(201,162,39,0.3)]"
                        : "border-[var(--border-soft)]/80 bg-white/30 hover:bg-[var(--surface-soft)]"
                    )}
                    onClick={() => setActiveTag(row.tag)}
                    title={`${row.tag}：总数 ${row.total}，利好 ${row.bullish}（${Math.round(row.bullishRatio * 100)}%），利空 ${row.bearish}，中性 ${row.neutral}，均重 ${row.avgImportance}`}
                  >
                    <span className="min-w-0 font-semibold text-[var(--text-strong)]">
                      <span className="mr-0.5 font-mono tabular-nums text-[var(--text-muted)]">{idx + 1}.</span>
                      {row.tag}
                    </span>
                    {row.bullish > 0 ? (
                      <span className="shrink-0 rounded-full border border-[rgba(179,38,30,0.26)] bg-[rgba(254,226,226,0.55)] px-1 py-px text-[9px] font-semibold tabular-nums text-[var(--quote-up)]">
                        +{row.bullish}·{Math.round(row.bullishRatio * 100)}%
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full border border-[var(--border-soft)] bg-white/50 px-1 py-px text-[9px] font-semibold tabular-nums text-[var(--text-muted)]">
                        均{row.avgImportance}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-2 space-y-0.5 text-[10px] leading-snug text-[var(--text-muted)]">
          <div>来源：{sources.length ? sources.join("、") : "—"}</div>
          <div>更新：{fetchedAt ? formatTime(fetchedAt) : "—"}</div>
          {diagHasFailure ? (
            <div className="text-[11px] leading-snug text-[var(--danger)]">
              {diagnostics
                .filter((d) => !d.ok)
                .map((d) => `${d.source}：${d.error || "失败"}`)
                .join("；")}
            </div>
          ) : null}
        </div>
      </aside>

      <div className="min-w-0 max-w-[52rem]">
        {err ? (
          <StatusBanner tone="danger" role="alert" className="mb-3">
            {err}
          </StatusBanner>
        ) : null}
        {loading && !items.length ? (
          <div className="home-landing-surface-inset p-5 text-sm text-[var(--text-muted)]">正在获取热点新闻…</div>
        ) : items.length === 0 ? (
          <div className="home-landing-surface-inset p-5 text-sm leading-relaxed text-[var(--text-muted)]">
            <p>新闻源暂未返回可用条目。可点击刷新；如果仍为空，需要更换或配置环境变量</p>
            <p className="mt-2">
              <code className="rounded-md border border-[var(--border-soft)] bg-white/50 px-2 py-1 font-mono text-[13px] text-[var(--text-main)]">
                STOCK_NEWS_FEEDS
              </code>
              <span className="ml-1">
                （每项为「显示名|RSS 地址」；也可单独写以 https:// 开头的一行 RSS 地址。多条用英文逗号或换行分隔。）
              </span>
            </p>
            {diagHasFailure ? (
              <div className="mt-3 text-xs text-[var(--danger)]">
                {diagnostics
                  .filter((d) => !d.ok)
                  .map((d) => (
                    <div key={d.source}>
                      {d.source}：{d.error || "unknown"}
                    </div>
                  ))}
              </div>
            ) : null}
          </div>
        ) : filtered.length === 0 ? (
          <div className="home-landing-surface-inset p-5 text-sm text-[var(--text-muted)]">
            当前筛选「{activeTag}」没有匹配新闻。已获取 {items.length} 条，可切回“全部”或选择带数量的标签。
          </div>
        ) : (
          <div className="space-y-5">
            {highlights.length ? (
              <div>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">要点速览</h3>
                  <span className="text-[9px] text-[var(--text-muted)]">按重要性优先</span>
                </div>
                <ol className="space-y-2">
                  {highlights.map((it, idx) => (
                    <li key={it.id} className="flex gap-2 rounded-lg border border-[var(--border-soft)] bg-[rgba(201,162,39,0.08)] px-2.5 py-2">
                      <span className="shrink-0 pt-0.5 font-mono text-[11px] font-bold tabular-nums text-[rgba(201,162,39,0.95)]">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-[var(--text-muted)]">
                          <span className="font-semibold text-[var(--text-main)]">{it.source}</span>
                          <span>{formatTime(it.published_at)}</span>
                          <span className={`rounded-full border px-1 py-px text-[9px] font-semibold ${sentimentClass(it.sentiment)}`}>{it.sentiment}</span>
                        </div>
                        <a
                          href={it.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 block text-[13px] font-extrabold leading-snug text-[var(--text-strong)] hover:underline sm:text-sm"
                        >
                          {it.title}
                        </a>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            <div>
              {highlights.length ? (
                <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">全部条目</h3>
              ) : null}
              <div className="space-y-2">
                {(highlights.length ? others : filtered).map((it) => (
                  <NewsRow
                    key={it.id}
                    it={it}
                    expanded={Boolean(summaryOpen[it.id])}
                    onToggleSummary={() => setSummaryOpen((m) => ({ ...m, [it.id]: !m[it.id] }))}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[rgba(201,162,39,0.42)] bg-[rgba(201,162,39,0.07)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-extrabold text-[var(--text-strong)]">AI 要点总结</h3>
                  <p className="mt-0.5 text-[10px] leading-snug text-[var(--text-muted)]">
                    当前筛选下最多 20 条，通义归纳；请与原文核对。
                  </p>
                </div>
                <Button type="button" variant="secondary" size="xs" disabled={aiBusy || !filtered.length} onClick={() => void requestAiSummary()}>
                  {aiBusy ? "生成中…" : "生成要点"}
                </Button>
              </div>
              {aiErr ? (
                <div className="mt-2 rounded-md border border-[rgba(179,38,30,0.22)] bg-[rgba(254,226,226,0.35)] px-2.5 py-2 text-xs leading-snug text-[var(--danger)]" role="alert">
                  <div>{aiErr}</div>
                  {/目标不存在|404/i.test(aiErr) ? (
                    <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                      多为接口未注册或代理打错端口：请确认已重启 API 进程，且前端代理的 <code className="rounded bg-white/60 px-1">PORT</code> 与后端一致。
                    </p>
                  ) : null}
                </div>
              ) : null}
              {aiSummary ? (
                <div className="mt-3 rounded-lg border border-[var(--border-soft)] bg-white/50 p-3">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={aiSummaryMdComponents}>
                    {aiSummary}
                  </ReactMarkdown>
                  {aiModel ? <div className="mt-2 text-[10px] text-[var(--text-muted)]">模型：{aiModel}</div> : null}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
