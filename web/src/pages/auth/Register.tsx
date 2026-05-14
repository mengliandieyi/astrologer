import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { FormField } from "../../components/ui/FormField";
import { StatusBanner } from "../../components/ui/StatusBanner";
import { MascotBadge } from "../../components/MascotBadge";
import { authRegister } from "../../lib/authClient";

function explainAuthError(raw: string): string {
  const s = (raw || "").trim();
  try {
    const j = JSON.parse(s);
    const code = String(j?.error || "");
    if (code === "username_required") return "请输入用户名";
    if (code === "email_required") return "请输入邮箱";
    if (code === "email_invalid") return "邮箱格式不正确";
    if (code === "email_taken") return "邮箱已被占用";
    if (code === "password_required") return "请输入密码";
    if (code === "username_taken") return "用户名已被占用";
    if (code === "username_invalid_length") return "用户名长度需 3–64";
    if (code === "username_invalid_chars") return "用户名仅支持字母/数字/下划线/@/点";
    if (code === "password_invalid_length") return "密码长度需 8–72";
    if (code) return code;
  } catch {
    // ignore
  }
  return s.slice(0, 160) || "注册失败";
}

function useNextParam() {
  const loc = useLocation();
  return useMemo(() => {
    const sp = new URLSearchParams(loc.search);
    return sp.get("next") || "/";
  }, [loc.search]);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Register() {
  const nav = useNavigate();
  const next = useNextParam();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [touched, setTouched] = useState<{ u?: boolean; e?: boolean; p?: boolean }>({});

  const usernameErr = touched.u && (!username.trim() ? "请输入用户名" : username.trim().length < 3 ? "用户名长度需 ≥ 3" : "");
  const emailErr = touched.e && (!email.trim() ? "请输入邮箱" : !EMAIL_RE.test(email) ? "邮箱格式不正确" : "");
  const passwordErr = touched.p && (!password ? "请输入密码" : password.length < 8 ? "密码长度需 ≥ 8" : "");

  async function submit() {
    setTouched({ u: true, e: true, p: true });
    if (!username.trim() || !EMAIL_RE.test(email) || password.length < 8) return;
    setErr("");
    setBusy(true);
    try {
      await authRegister(username, email, password);
      nav(next);
    } catch (e: any) {
      setErr(String(e?.message || "注册失败").slice(0, 160));
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
        <h1 className="text-[var(--fs-2xl)] font-bold text-[var(--text-strong)]">注册</h1>
        <p className="mt-1 text-[var(--fs-sm)] text-[var(--text-soft)]">创建账户后，可保存命盘、研判与行旅档案。</p>

        <form
          className="mt-5 grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <FormField label="用户名" htmlFor="reg-user" required error={usernameErr} help="3–64 字符；字母/数字/下划线/@/点">
            <Input
              autoFocus
              value={username}
              autoComplete="username"
              invalid={!!usernameErr}
              onBlur={() => setTouched((t) => ({ ...t, u: true }))}
              onChange={(e) => setUsername(e.target.value)}
            />
          </FormField>

          <FormField label="邮箱" htmlFor="reg-email" required error={emailErr}>
            <Input
              value={email}
              type="email"
              autoComplete="email"
              invalid={!!emailErr}
              onBlur={() => setTouched((t) => ({ ...t, e: true }))}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>

          <FormField label="密码" htmlFor="reg-pwd" required error={passwordErr} help="8–72 字符">
            <Input
              value={password}
              type="password"
              autoComplete="new-password"
              invalid={!!passwordErr}
              onBlur={() => setTouched((t) => ({ ...t, p: true }))}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>

          {err ? <StatusBanner tone="danger" role="alert" dismissible onDismiss={() => setErr("")}>{explainAuthError(err)}</StatusBanner> : null}

          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="secondary" asChild>
              <Link to={`/login?next=${encodeURIComponent(next)}`}>去登录</Link>
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "注册中…" : "注册"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
