import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { FormField } from "../../components/ui/FormField";
import { StatusBanner } from "../../components/ui/StatusBanner";
import { MascotBadge } from "../../components/MascotBadge";
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
    if (code === "auth_backend_unavailable") return "鉴权服务暂不可用，请稍后重试";
    if (code) return code;
  } catch {
    // ignore
  }
  return s.slice(0, 160) || "登录失败";
}

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
  const [touched, setTouched] = useState<{ u?: boolean; p?: boolean }>({});

  const usernameErr = touched.u && !username.trim() ? "请输入用户名" : "";
  const passwordErr = touched.p && !password ? "请输入密码" : "";

  async function submit() {
    setTouched({ u: true, p: true });
    if (!username.trim() || !password) return;
    setErr("");
    setBusy(true);
    try {
      await authLogin(username, password);
      nav(next);
    } catch (e: any) {
      const raw = String(e?.message || "登录失败");
      setErr(raw.length > 320 ? `${raw.slice(0, 320)}…` : raw);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8 sm:py-12">
      <div className="mb-6 flex items-center justify-between">
        <Link to="/" className="home-logo-link" aria-label="返回首页">
          <div className="home-logo-circle" aria-hidden />
          <span className="home-logo-text">知行馆</span>
        </Link>
        <MascotBadge to="/" label="返回首页" />
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--border-soft)] bg-[var(--surface-card)] p-5 shadow-[var(--elev-card)] sm:p-7">
        <h1 className="text-[var(--fs-2xl)] font-bold text-[var(--text-strong)]">登录</h1>
        <p className="mt-1 text-[var(--fs-sm)] text-[var(--text-soft)]">观象参命；势审利害。请先登录以继续。</p>

        <form
          className="mt-5 grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <FormField label="邮箱或用户名" htmlFor="login-user" required error={usernameErr}>
            <Input
              autoFocus
              value={username}
              autoComplete="username"
              placeholder="name@example.com 或 username"
              invalid={!!usernameErr}
              onBlur={() => setTouched((t) => ({ ...t, u: true }))}
              onChange={(e) => setUsername(e.target.value)}
            />
          </FormField>

          <FormField label="密码" htmlFor="login-pwd" required error={passwordErr}>
            <Input
              value={password}
              type="password"
              autoComplete="current-password"
              invalid={!!passwordErr}
              onBlur={() => setTouched((t) => ({ ...t, p: true }))}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>

          {err ? <StatusBanner tone="danger" role="alert" dismissible onDismiss={() => setErr("")}>{explainAuthError(err)}</StatusBanner> : null}

          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <Button type="button" variant="secondary" asChild>
                <Link to={`/register?next=${encodeURIComponent(next)}`}>去注册</Link>
              </Button>
              <Button type="button" variant="ghost" asChild>
                <Link to={`/forgot-password?next=${encodeURIComponent(next)}`}>忘记密码</Link>
              </Button>
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "登录中…" : "登录"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
