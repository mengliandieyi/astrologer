import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { authResetPassword } from "../../lib/authClient";

function useNextParam() {
  const loc = useLocation();
  return useMemo(() => {
    const sp = new URLSearchParams(loc.search);
    return sp.get("next") || "/";
  }, [loc.search]);
}

function useTokenParam() {
  const loc = useLocation();
  return useMemo(() => {
    const sp = new URLSearchParams(loc.search);
    return sp.get("token") || "";
  }, [loc.search]);
}

export function ResetPassword() {
  const nav = useNavigate();
  const next = useNextParam();
  const tokenFromUrl = useTokenParam();
  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    setBusy(true);
    try {
      await authResetPassword(token, password);
      setDone(true);
    } catch (e: any) {
      setErr(String(e?.message || "重置失败").slice(0, 160));
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-400";
  const labelCls = "text-sm text-slate-600";

  return (
    <div className="prompt-stage">
      <div className="mx-auto w-full max-w-lg px-4 pb-12 pt-12">
        <Card className="glass">
          <CardHeader>
            <CardTitle>设置新密码</CardTitle>
            <CardDescription>请粘贴邮件中的 token，并设置新密码（至少 8 位）。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label className={labelCls}>Token</label>
              <input
                className={inputCls}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="从邮件链接复制 token"
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>新密码</label>
              <input
                className={inputCls}
                value={password}
                type="password"
                autoComplete="new-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
              />
            </div>

            {done ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                密码已更新。请重新登录。
              </div>
            ) : null}
            {err ? <div className="text-sm text-red-600">{err}</div> : null}

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button variant="secondary" asChild>
                <Link to={`/login?next=${encodeURIComponent(next)}`}>去登录</Link>
              </Button>
              <Button disabled={busy} onClick={() => void submit()}>
                {busy ? "提交中…" : "更新密码"}
              </Button>
            </div>

            {done ? (
              <div className="pt-2">
                <Button variant="ghost" onClick={() => nav(`/login?next=${encodeURIComponent(next)}`)}>
                  返回登录
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

