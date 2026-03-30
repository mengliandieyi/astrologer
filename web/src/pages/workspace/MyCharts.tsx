import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { authLogout, authMe, listChartsByProfile, listProfiles, type Profile } from "../../lib/authClient";

function formatTime(s: string) {
  const t = s.replace("T", " ").replace("Z", "");
  return t.length > 16 ? t.slice(0, 16) : t;
}

export function MyCharts() {
  const nav = useNavigate();
  const [me, setMe] = useState<{ id: number; username: string } | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<number | null>(null);
  const [rows, setRows] = useState<Array<{ chart_id: string; created_at: string; summary: string }>>([]);
  const [busy, setBusy] = useState(true);
  const next = useMemo(() => "/my/charts", []);

  useEffect(() => {
    let cancelled = false;
    void authMe()
      .then((m) => {
        if (cancelled) return;
        if (!(m as any)?.logged_in) {
          nav(`/login?next=${encodeURIComponent(next)}`);
          return;
        }
        setMe((m as any).user);
        return listProfiles().then((out) => {
          if (cancelled) return;
          const ps = out.profiles || [];
          setProfiles(ps);
          const pid = ps[0]?.id ?? null;
          setActiveProfileId(pid);
          if (!pid) {
            setRows([]);
            return;
          }
          return listChartsByProfile(pid, 30).then((r) => {
            if (!cancelled) setRows(r.charts || []);
          });
        });
      })
      .catch(() => {
        if (!cancelled) nav(`/login?next=${encodeURIComponent(next)}`);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nav, next]);

  async function logout() {
    await authLogout();
    nav("/login?next=/workspace");
  }

  return (
    <div className="prompt-stage">
      <div className="mx-auto w-full max-w-4xl px-4 pb-10">
        <div className="flex items-center justify-between gap-3 py-4">
          <div className="text-sm font-extrabold tracking-[0.18em] text-slate-100">我的盘面</div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/workspace">工作台</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/bazi">八字</Link>
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void logout()}>
              退出登录
            </Button>
          </div>
        </div>

        <Card className="glass">
          <CardHeader>
            <CardTitle>历史记录</CardTitle>
            <CardDescription>{me ? `用户：${me.username}` : "—"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {profiles.length ? (
              <div className="flex flex-wrap items-center gap-2 pb-2">
                <span className="text-sm text-slate-200/70">人物：</span>
                <select
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-100 outline-none focus:border-white/25"
                  value={String(activeProfileId ?? "")}
                  onChange={(e) => {
                    const pid = Number(e.target.value) || null;
                    setActiveProfileId(pid);
                    if (!pid) return;
                    setBusy(true);
                    void listChartsByProfile(pid, 30)
                      .then((r) => setRows(r.charts || []))
                      .finally(() => setBusy(false));
                  }}
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {busy ? (
              <div className="text-slate-200/80">加载中…</div>
            ) : rows.length ? (
              <div className="space-y-2">
                {rows.map((r) => (
                  <div
                    key={r.chart_id}
                    className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-100">{formatTime(r.created_at)}</div>
                      <Button asChild size="sm">
                        <Link to={`/bazi?chart_id=${encodeURIComponent(r.chart_id)}`}>打开</Link>
                      </Button>
                    </div>
                    <div className="text-sm text-slate-200/80">{r.summary || "—"}</div>
                    <div className="text-xs text-slate-200/60">{r.chart_id}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-slate-200/80">
                暂无历史记录。去 <Link className="underline" to="/bazi">八字排盘</Link> 生成第一条吧。
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

