import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { authLogout, authMe, deleteHepanReport, listHepanReports, type HepanListItem } from "../../lib/authClient";

function explainError(message: string): string {
  const s = String(message || "").trim();
  try {
    const j = JSON.parse(s);
    const code = String(j?.error || "");
    if (code === "unauthorized") return "请先登录";
    if (code) return code;
  } catch {
    // ignore
  }
  return s.slice(0, 160) || "请求失败";
}

export function MyHepan() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [items, setItems] = useState<HepanListItem[]>([]);

  async function refresh() {
    setErr("");
    setBusy(true);
    try {
      const m = await authMe();
      const ok = Boolean((m as any)?.logged_in);
      if (!ok) {
        // Use replace to avoid back-button redirect loops.
        nav(`/login?next=${encodeURIComponent("/my/hepan")}`, { replace: true });
        return;
      }
      const out = await listHepanReports(50);
      setItems((out.reports || []) as HepanListItem[]);
    } catch (e: any) {
      setErr(explainError(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onDelete(reportId: number) {
    if (!window.confirm("确认删除这条合盘记录？")) return;
    setErr("");
    setBusy(true);
    try {
      await deleteHepanReport(reportId);
      await refresh();
    } catch (e: any) {
      setErr(explainError(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="home-landing page-bazi pb-12">
      <header className="home-landing-header" aria-labelledby="my-hepan-title">
        <div className="home-landing-header-content">
          <h1 id="my-hepan-title" className="home-landing-title">
            我的合盘
          </h1>
          <p className="home-landing-subline mt-2">最近生成的合盘记录。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" asChild size="sm">
            <Link to="/bazi?tab=hepan">去合盘</Link>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void (async () => {
                try {
                  await authLogout();
                } finally {
                  nav(`/login?next=${encodeURIComponent("/my/hepan")}`, { replace: true });
                }
              })();
            }}
          >
            退出登录
          </Button>
        </div>
      </header>

      <section className="mt-2">
        <div className="home-landing-surface min-w-0 p-5 sm:p-6">
          {err ? <div className="text-sm text-[var(--bazi-danger)]">{err}</div> : null}
          {busy ? <div className="text-sm text-[var(--text-muted)]">加载中…</div> : null}
          {!busy && !err && items.length === 0 ? (
            <div className="text-sm text-[var(--text-muted)]">暂无记录。</div>
          ) : null}
          <div className="mt-3 space-y-2">
            {items.map((x) => (
              <div
                key={x.id}
                className="home-landing-surface-inset flex items-center gap-3 rounded-xl border border-[var(--border-soft)] px-3 py-2 hover:bg-[var(--surface-soft)]"
              >
                <Link to={`/hepan?report_id=${encodeURIComponent(String(x.id))}`} className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold text-[var(--text-strong)]">
                    {x.profile_name_a} × {x.profile_name_b}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--text-muted)]">更新：{x.updated_at || "—"}</div>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void onDelete(x.id);
                  }}
                >
                  删除
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

