import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { authRegister } from "../../lib/authClient";

function useNextParam() {
  const loc = useLocation();
  return useMemo(() => {
    const sp = new URLSearchParams(loc.search);
    return sp.get("next") || "/workspace";
  }, [loc.search]);
}

export function Register() {
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
      await authRegister(username, password);
      nav(next);
    } catch (e: any) {
      setErr(String(e?.message || "注册失败").slice(0, 160));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="prompt-stage">
      <div className="mx-auto w-full max-w-lg px-4 pb-12 pt-12">
        <Card className="glass">
          <CardHeader>
            <CardTitle>注册</CardTitle>
            <CardDescription>用户名支持字母数字与 _ @ .；密码至少 8 位。</CardDescription>
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
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
              />
            </div>
            {err ? <div className="text-sm text-red-300">{err}</div> : null}
            <div className="flex items-center justify-between gap-3 pt-2">
              <Button variant="secondary" asChild>
                <Link to={`/login?next=${encodeURIComponent(next)}`}>去登录</Link>
              </Button>
              <Button disabled={busy} onClick={() => void submit()}>
                {busy ? "注册中…" : "注册"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

