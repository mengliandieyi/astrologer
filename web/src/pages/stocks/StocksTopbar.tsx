import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { authLogout, authMe } from "../../lib/authClient";

export function StocksTabs() {
  const [params, setParams] = useSearchParams();
  const active = params.get("tab") === "screener" ? "screener" : "single";

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={
          active === "single"
            ? "rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--text-strong)]"
            : "rounded-full border border-transparent bg-transparent px-3 py-1.5 text-sm font-semibold text-[var(--text-muted)] hover:border-[var(--border-soft)] hover:bg-[var(--surface-soft)]"
        }
        onClick={() => {
          const sp = new URLSearchParams(params);
          sp.delete("tab");
          setParams(sp, { replace: true });
        }}
      >
        单股研判
      </button>
      <button
        type="button"
        className={
          active === "screener"
            ? "rounded-full border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--text-strong)]"
            : "rounded-full border border-transparent bg-transparent px-3 py-1.5 text-sm font-semibold text-[var(--text-muted)] hover:border-[var(--border-soft)] hover:bg-[var(--surface-soft)]"
        }
        onClick={() => {
          const sp = new URLSearchParams(params);
          sp.set("tab", "screener");
          setParams(sp, { replace: true });
        }}
      >
        策略选股
      </button>
    </div>
  );
}

export function StocksTopbar(props: { onOpenHelp: () => void }) {
  const nav = useNavigate();
  const loc = useLocation();
  const [loggedIn, setLoggedIn] = useState(false);
  const next = useMemo(() => loc.pathname + loc.search, [loc.pathname, loc.search]);

  useEffect(() => {
    let cancelled = false;
    void authMe()
      .then((m) => {
        if (!cancelled) setLoggedIn(Boolean((m as any)?.logged_in));
      })
      .catch(() => {
        if (!cancelled) setLoggedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onLogout() {
    try {
      await authLogout();
    } finally {
      nav(`/login?next=${encodeURIComponent(next)}`, { replace: true });
    }
  }

  return (
    <nav className="home-navbar">
      <Link to="/" className="home-logo-link" aria-label="返回首页">
        <div className="home-logo-circle" aria-hidden />
        <span className="home-logo-text">知行馆</span>
      </Link>
      <div className="home-navbar-actions">
        <button type="button" className="home-help-btn" onClick={props.onOpenHelp}>
          帮助中心
        </button>
        {loggedIn ? (
          <Button variant="secondary" size="sm" onClick={() => void onLogout()}>
            退出登录
          </Button>
        ) : null}
      </div>
    </nav>
  );
}

