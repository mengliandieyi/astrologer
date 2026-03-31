import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { authLogin } from "../../lib/authClient";

function explainAuthError(raw: string): string {
  const s = (raw || "").trim();
  if (/AbortError|aborted/i.test(s)) return "登录超时，请重试";
  try {
    const j = JSON.parse(s);
    const code = String(j?.error || "");
    if (code === "username_required") return "请输入用户名";
    if (code === "password_required") return "请输入密码";
    if (code === "invalid_credentials") return "用户名或密码错误";
    if (code === "username_invalid_length") return "用户名长度需 3–64";
    if (code === "username_invalid_chars") return "用户名仅支持字母/数字/下划线/@/点";
    if (code === "password_invalid_length") return "密码长度需 8–72";
    if (code === "auth_backend_unavailable") return "鉴权服务暂不可用（数据库连接失败），请稍后重试或检查数据库连通性";
    if (code) return code;
  } catch {
    // ignore
  }
  return s.slice(0, 160) || "登录失败";
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-400";
const labelCls = "text-sm text-slate-600";

function useNextParam() {
  const loc = useLocation();
  return useMemo(() => {
    const sp = new URLSearchParams(loc.search);
    return sp.get("next") || "/";
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
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label className={labelCls}>邮箱或用户名</label>
              <input
                className={inputCls}
                value={username}
                autoComplete="username"
                placeholder="name@example.com 或 username"
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>密码</label>
              <input
                className={inputCls}
                value={password}
                type="password"
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
              />
            </div>
            {err ? <div className="text-sm text-red-600">{explainAuthError(err)}</div> : null}
            <div className="flex items-center justify-between gap-3 pt-2">
              <Button variant="secondary" asChild>
                <Link to={`/register?next=${encodeURIComponent(next)}`}>去注册</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link to={`/forgot-password?next=${encodeURIComponent(next)}`}>忘记密码</Link>
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

