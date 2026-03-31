import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { authLogout, authMe } from "../lib/authClient";

export function AppAuthCorner() {
  const nav = useNavigate();
  const loc = useLocation();
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const p0 = loc.pathname || "";
  // Pages that already have their own header actions; avoid overlay collisions.
  const shouldHide =
    p0 === "/bazi" ||
    p0 === "/" ||
    p0 === "/my/profiles" ||
    p0 === "/my/charts" ||
    p0 === "/hepan" ||
    p0 === "/my/hepan";
  const next = useMemo(() => {
    const p = loc.pathname || "/";
    const s = loc.search || "";
    return `${p}${s}`;
  }, [loc.pathname, loc.search]);

  useEffect(() => {
    let cancelled = false;
    // On /bazi we render logout alongside Help Center in the page topbar.
    // Important: we must still call hooks consistently across route changes.
    if (shouldHide) {
      setLoggedIn(null);
      return () => {
        cancelled = true;
      };
    }
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
  }, [next, shouldHide]);

  async function onLogout() {
    try {
      await authLogout();
    } finally {
      setLoggedIn(false);
      nav(`/login?next=${encodeURIComponent(next)}`, { replace: true });
    }
  }

  if (shouldHide) return null;

  if (loggedIn === false) {
    return (
      <div className="pointer-events-auto">
        <Button asChild variant="secondary" size="sm">
          <Link to={`/login?next=${encodeURIComponent(next)}`}>登录</Link>
        </Button>
      </div>
    );
  }

  if (loggedIn === true) {
    return (
      <div className="pointer-events-auto">
        <Button variant="secondary" size="sm" onClick={() => void onLogout()}>
          退出登录
        </Button>
      </div>
    );
  }

  return null;
}

