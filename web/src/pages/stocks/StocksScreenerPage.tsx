import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getScreenerResults, listScreenerRuns, runScreener, type ScreenerResult, type ScreenerRun, type ScreenerStrategy } from "../../lib/screenerClient";

const STRATEGIES: Array<{ key: ScreenerStrategy; subtitle: string }> = [
  { key: "左侧埋伏", subtitle: "低位转强的早期信号" },
  { key: "右侧确认", subtitle: "趋势结构确认后跟随" },
  { key: "超短反转", subtitle: "短线回撤后的反弹" },
];

export function StocksScreenerPage() {
  const [ready, setReady] = useState(false);

  const [runs, setRuns] = useState<ScreenerRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [running, setRunning] = useState<ScreenerStrategy | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const selectedRun = useMemo(() => runs.find((r) => r.id === selectedRunId) || null, [runs, selectedRunId]);

  useEffect(() => {
    setReady(true);
  }, []);

  function refreshRuns() {
    setLoadingRuns(true);
    setErr(null);
    void listScreenerRuns(20)
      .then((r) => {
        setRuns(r.runs || []);
        if (!selectedRunId && r.runs?.length) setSelectedRunId(r.runs[0].id);
      })
      .catch((e: any) => setErr(String(e?.error || e?.message || e)))
      .finally(() => setLoadingRuns(false));
  }

  useEffect(() => {
    if (!ready) return;
    refreshRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (!selectedRunId) {
      setResults([]);
      return;
    }
    setLoadingResults(true);
    setErr(null);
    void getScreenerResults({ run_id: selectedRunId, limit: 80 })
      .then((r) => setResults(r.items || []))
      .catch((e: any) => setErr(String(e?.error || e?.message || e)))
      .finally(() => setLoadingResults(false));
  }, [ready, selectedRunId]);

  function onRun(strategy: ScreenerStrategy) {
    setRunning(strategy);
    setErr(null);
    void runScreener({ strategy, freq: "1d", topN: 50, lookbackDays: 80 })
      .then((r) => {
        setSelectedRunId(r.run_id);
        refreshRuns();
      })
      .catch((e: any) => setErr(String(e?.error || e?.message || e)))
      .finally(() => setRunning(null));
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)] lg:items-start">
      <div className="grid gap-4 self-start">
        <div className="home-landing-surface-inset p-4">
              <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">策略</div>
              <div className="mt-3 grid gap-2">
                {STRATEGIES.map((s) => (
                  <div key={s.key} className="rounded-xl border border-[var(--border-soft)] bg-white/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-[var(--text-strong)]">{s.key}</div>
                        <div className="mt-0.5 text-xs text-[var(--text-muted)]">{s.subtitle}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onRun(s.key)}
                        disabled={running != null}
                        className="rounded-lg bg-[var(--btn-primary-bg)] px-3 py-2 text-xs font-semibold text-[var(--btn-primary-text)] hover:brightness-[1.02] disabled:opacity-60"
                      >
                        {running === s.key ? "运行中…" : "立即运行"}
                      </button>
                    </div>
                    <div className="mt-2 text-xs text-[var(--text-muted)]">默认：1D、近80日样本、Top50。</div>
                  </div>
                ))}
              </div>
            </div>

        <div className="home-landing-surface-inset p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold tracking-[0.14em] text-[var(--text-muted)]">运行历史</div>
                {loadingRuns ? <div className="text-xs text-[var(--text-muted)]">加载中…</div> : null}
              </div>
              <div className="mt-3 grid gap-2">
                {runs.length ? (
                  runs.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedRunId(r.id)}
                      className={[
                        "w-full rounded-xl border px-3 py-2 text-left text-sm",
                        selectedRunId === r.id
                          ? "border-[rgba(201,162,39,0.45)] bg-[rgba(201,162,39,0.12)]"
                          : "border-[var(--border-soft)] bg-white/35 hover:bg-white/55",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-[var(--text-strong)]">{r.strategy}</div>
                        <div className="text-xs text-[var(--text-muted)]">#{r.id}</div>
                      </div>
                      <div className="mt-1 text-xs text-[var(--text-muted)]">
                        状态：{r.status}
                        {r.finished_at ? `；完成：${r.finished_at}` : `；开始：${r.started_at}`}
                      </div>
                      {r.error ? <div className="mt-1 text-xs text-red-700">错误：{r.error}</div> : null}
                    </button>
                  ))
                ) : (
                  <div className="text-sm text-[var(--text-muted)]">暂无运行记录，先点“立即运行”。</div>
                )}
              </div>
            </div>
      </div>

      <div className="home-landing-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-[var(--text-strong)]">
                  结果 {selectedRun ? `（${selectedRun.strategy} / #${selectedRun.id}）` : ""}
                </div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">排序：hit 优先，其次 near；再按 scores 分数降序。</div>
              </div>
              {loadingResults ? <div className="text-xs text-[var(--text-muted)]">加载中…</div> : null}
            </div>

            {err ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}

            <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border-soft)] bg-white/35">
              <div className="grid grid-cols-[140px_90px_1fr_110px] gap-0 border-b border-[var(--border-soft)] bg-white/35 px-3 py-2 text-xs font-semibold text-[var(--text-muted)]">
                <div>标的</div>
                <div>分数</div>
                <div>理由（精选）</div>
                <div className="text-right">操作</div>
              </div>
              {results.length ? (
                <div className="max-h-[520px] overflow-auto">
                  {results.map((it) => {
                    const feat = (it.reasons_json as any)?.features;
                    const status = String((it.snapshot_json as any)?.status || "");
                    const shortWhy = (() => {
                      // computeSignals puts per-strategy why inside signals[] returned separately, not in reasons_json.
                      // Here we show a compact line from features + status.
                      const p = feat?.pct1d != null ? `1D ${Number(feat.pct1d).toFixed(2)}%` : "";
                      const k = feat?.k != null ? `K ${Number(feat.k).toFixed(1)}` : "";
                      const hist = feat?.macd_hist != null ? `柱 ${Number(feat.macd_hist).toFixed(2)}` : "";
                      return [status, p, k, hist].filter(Boolean).join(" / ");
                    })();

                    return (
                      <div key={it.id} className="grid grid-cols-[140px_90px_1fr_110px] items-start gap-0 border-b border-[var(--border-soft)] px-3 py-2 text-sm text-[var(--text-main)] last:border-b-0">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-[var(--text-strong)]">{it.name || it.symbol}</div>
                          <div className="truncate text-xs text-[var(--text-muted)]">{it.symbol}</div>
                        </div>
                        <div className="text-sm font-semibold text-[var(--text-strong)]">{it.score == null ? "—" : it.score.toFixed(2)}</div>
                        <div className="min-w-0 text-xs text-[var(--text-muted)]">
                          <div className="truncate">{shortWhy || "—"}</div>
                        </div>
                        <div className="text-right">
                          <Link
                            to={`/stocks`}
                            className="inline-flex rounded-lg border border-[var(--border-soft)] bg-white/40 px-2 py-1 text-xs font-semibold text-[var(--text-strong)] hover:bg-white/55"
                            onClick={() => {
                              // navigation + user will select in single-stock page
                            }}
                          >
                            去单股页
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="px-3 py-6 text-sm text-[var(--text-muted)]">暂无结果。先选择一个运行记录，或点击左侧“立即运行”。</div>
              )}
            </div>
      </div>
    </div>
  );
}

