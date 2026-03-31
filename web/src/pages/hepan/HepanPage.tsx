import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { authLogout, authMe, listProfiles, type Profile } from "../../lib/authClient";
import { HepanPanel } from "./HepanPanel";

export function HepanPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const reportIdFromQuery = Number(params.get("report_id") || "");

  const [loggedIn, setLoggedIn] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    let cancelled = false;
    void authMe()
      .then((m) => {
        if (cancelled) return;
        const ok = Boolean((m as any)?.logged_in);
        setLoggedIn(ok);
        if (!ok) {
          nav(`/login?next=${encodeURIComponent(`/hepan${window.location.search || ""}`)}`);
          return;
        }
        return listProfiles()
          .then((out) => {
            if (cancelled) return;
            const ps = (out.profiles || []) as Profile[];
            setProfiles(ps);
          })
          .catch(() => {
            if (!cancelled) setProfiles([]);
          });
      })
      .catch(() => {
        if (!cancelled) nav(`/login?next=${encodeURIComponent(`/hepan${window.location.search || ""}`)}`);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="home-landing page-bazi pb-12">
      <header className="home-landing-header" aria-labelledby="hepan-title">
        <div className="home-landing-header-content">
          <h1 id="hepan-title" className="home-landing-title">
            合盘
          </h1>
          <p className="home-landing-subline mt-2">选择两份档案，生成相处建议与风险提示。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/bazi">去八字</Link>
          </Button>
          {loggedIn ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void (async () => {
                  try {
                    await authLogout();
                  } finally {
                    nav(`/login?next=${encodeURIComponent("/hepan")}`, { replace: true });
                  }
                })();
              }}
            >
              退出登录
            </Button>
          ) : null}
        </div>
      </header>
      <HepanPanel loggedIn={loggedIn} profiles={profiles} reportId={reportIdFromQuery} />
    </div>
  );
}

