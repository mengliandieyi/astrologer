import { Link, useLocation } from "react-router-dom";
import { useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { authForgotPassword } from "../../lib/authClient";

function useNextParam() {
  const loc = useLocation();
  return useMemo(() => {
    const sp = new URLSearchParams(loc.search);
    return sp.get("next") || "/";
  }, [loc.search]);
}

function isLikelyEmail(s: string): boolean {
  const t = s.trim();
  if (t.length < 6 || t.length > 120) return false;
  // pragmatic check; backend should still validate.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function explainSendError(message: string): string {
  const m = String(message || "").trim();
  if (!m) return "发送失败，请稍后重试。";
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(m)) {
    return "网络连接失败：请确认后端服务已启动（/health 正常），然后刷新页面重试。";
  }
  if (m.includes("429") || m.includes("too_many_requests")) return "请求过于频繁，请稍后再试。";
  if (m.includes("500") || m.includes("502") || m.includes("503") || m.includes("504")) return "服务繁忙，请稍后重试。";
  return m.slice(0, 160);
}

export function ForgotPassword() {
  const next = useNextParam();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    const e = email.trim();
    if (!isLikelyEmail(e)) {
      setErr("请输入有效邮箱地址。");
      return;
    }
    setBusy(true);
    try {
      await authForgotPassword(e);
      setDone(true);
    } catch (e: any) {
      setErr(explainSendError(e?.message || e));
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
          <CardHeader className="flex-col items-start gap-1">
            <CardTitle className="whitespace-nowrap">找回密码</CardTitle>
            <CardDescription>我们会向你的邮箱发送“重置密码链接”（有效期 30 分钟）。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label className={labelCls}>邮箱</label>
              <input
                className={inputCls}
                value={email}
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
              />
            </div>

            {done ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                已发送（如未收到，请检查垃圾箱或稍后重试）。
              </div>
            ) : null}
            {err ? <div className="text-sm text-red-600">{err}</div> : null}

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button variant="secondary" asChild>
                <Link to={`/login?next=${encodeURIComponent(next)}`}>返回登录</Link>
              </Button>
              <Button disabled={busy || !isLikelyEmail(email)} onClick={() => void submit()}>
                {busy ? "发送中…" : done ? "再次发送" : "发送链接"}
              </Button>
            </div>

            <div className="pt-2 text-xs text-slate-500">
              邮件到达后，直接点击邮件里的“重置密码”链接即可。
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

