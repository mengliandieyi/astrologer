import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { authLogin } from "../../lib/authClient";

function useNextParam() {
  const loc = useLocation();
  return useMemo(() => {
    const sp = new URLSearchParams(loc.search);
    return sp.get("next") || "/workspace";
  }, [loc.search]);
}

export function Login() {
  const nav = useNavigate();
  const next = useNextParam();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    setBusy(true);
    try {
      await authLogin(username, password);
      nav(next);
    } catch (e: any) {
      setErr(String(e?.message || "登录失败").slice(0, 160));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="prompt-stage">
      <div className="mx-auto w-full max-w-lg px-4 pb-12 pt-12">
        <Card className="glass">
          <CardHeader>
            <CardTitle>登录</CardTitle>
            <CardDescription>登录后可保存历史盘面，并解锁排盘计算。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm text-slate-200/80">用户名</label>
              <input
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-100 outline-none focus:border-white/25"
                value={username}
                autoComplete="username"
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-slate-200/80">密码</label>
              <input
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-100 outline-none focus:border-white/25"
                value={password}
                type="password"
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
              />
            </div>
            {err ? <div className="text-sm text-red-300">{err}</div> : null}
            <div className="flex items-center justify-between gap-3 pt-2">
              <Button variant="secondary" asChild>
                <Link to={`/register?next=${encodeURIComponent(next)}`}>去注册</Link>
              </Button>
              <Button disabled={busy} onClick={() => void submit()}>
                {busy ? "登录中…" : "登录"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

