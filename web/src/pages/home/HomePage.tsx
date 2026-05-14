import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { authLogout, authMe } from "../../lib/authClient";
import { MascotBadge } from "../../components/MascotBadge";

const HOME_LANDING_MODULES = [
  {
    id: "bazi",
    cardClass: "home-landing-card--bazi",
    path: "/bazi",
    icon: "观",
    title: "八字排盘·灵犀解读",
    tagline: "真太阳时 · 流年 · 证据链",
    description: "结论先行，证据为凭；支持排盘、命式与流年一站直达，帮助你快速形成判断与行动建议。",
    cta: "去排盘",
  },
  {
    id: "ziyan",
    cardClass: "home-landing-card--ziyan",
    path: "/stocks",
    icon: "势",
    title: "资研参详·灵犀研判",
    tagline: "摘要 · 风险 · 核验清单",
    description: "材料入手，一页研判；覆盖摘要、风险与核验链路，帮助你在有限时间内抓住关键结论。",
    cta: "去研判",
  },
  {
    id: "xinglv",
    cardClass: "home-landing-card--xinglv",
    path: "/xinglv",
    icon: "定",
    title: "行旅筹划·灵犀行程",
    tagline: "行程 · 预算 · 清单",
    description: "路线预算，一次成行；行程、预算与清单快速成稿，减少反复修改和临时遗漏。",
    cta: "去成行",
  },
  {
    id: "manju",
    cardClass: "home-landing-card--manju",
    path: "/comic",
    icon: "行",
    title: "漫剧工坊·灵犀分镜",
    tagline: "分镜 · 对白 · 留钩",
    description: "轻喜开稿，一键分镜；分镜、对白与留钩同步生成，先搭骨架再精修细节更高效。",
    cta: "去开稿",
  },
] as const;

export function HomePage() {
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const prev = document.title;
    document.title = "知行馆·庭前百器";
    return () => {
      document.title = prev;
    };
  }, []);

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
      setLoggedIn(false);
      navigate(`/login?next=${encodeURIComponent("/")}`, { replace: true });
    }
  }

  return (
    <div className="home-landing home-landing--modern">
      <nav className="home-navbar home-modern-nav">
        <Link to="/" className="home-logo-link" aria-label="返回首页">
          <div className="home-logo-circle" aria-hidden />
          <span className="home-logo-text">知行馆</span>
        </Link>
        <div className="home-navbar-actions">
          <button type="button" className="home-help-btn" onClick={() => setHelpOpen(true)}>
            帮助中心
          </button>
          {loggedIn === false ? (
            <Button asChild variant="secondary" size="sm">
              <Link to={`/login?next=${encodeURIComponent("/")}`}>登录</Link>
            </Button>
          ) : loggedIn === true ? (
            <Button variant="secondary" size="sm" onClick={() => void onLogout()}>
              退出登录
            </Button>
          ) : null}
        </div>
      </nav>

      <div className="home-landing-header">
        <div className="home-landing-header-content">
          <h1 className="home-landing-title home-modern-title">知行馆·庭前百器</h1>
          <p className="home-landing-lead home-modern-lead">
            观象参命；势审利害。
            <br />
            定程筹旅；行文分镜。
          </p>
        </div>
        <MascotBadge to="/" label="小馆灵" size="md" />
      </div>

      <div className="home-landing-grid home-modern-grid">
        {HOME_LANDING_MODULES.map((m) => (
          <div
            key={m.id}
            className={`home-landing-card home-modern-card ${m.cardClass}`}
            role="button"
            tabIndex={0}
            aria-label={`${m.title}，${m.cta}`}
            onClick={() => navigate(m.path)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(m.path);
              }
            }}
          >
            <div className="home-landing-card-header">
              <div className="home-landing-card-icon" aria-hidden>
                {m.icon}
              </div>
              <div className="home-landing-card-title">
                <h3>{m.title}</h3>
                <p>{m.tagline}</p>
              </div>
            </div>
            <div className="home-landing-card-main">
              <div className="home-landing-card-copy">
                <p className="home-landing-card-desc">{m.description}</p>
              </div>
              <div className="home-landing-card-footer">
                <Link
                  to={m.path}
                  className="home-landing-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigate(m.path);
                  }}
                >
                  {m.cta}
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="home-modern-footer mt-10 shrink-0 text-center text-xs">
        <a
          className="home-modern-footer-link"
          href="/terms"
          rel="noreferrer noopener"
        >
          服务条款
        </a>{" "}
        ·{" "}
        <a
          className="home-modern-footer-link"
          href="/privacy"
          rel="noreferrer noopener"
        >
          隐私政策
        </a>{" "}
        · 本服务仅供文化娱乐参考
      </div>

      {helpOpen ? (
        <div
          className="home-modern-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.currentTarget === e.target && setHelpOpen(false)}
        >
          <div className="home-modern-modal-panel w-full max-w-[560px] rounded-[18px] p-4">
            <h3 className="home-modern-modal-title mb-2 text-[1.12rem] font-bold">帮助中心</h3>
            <p className="home-modern-modal-text mb-2 text-[0.92rem] leading-[1.55]">
              欢迎使用知行馆。你可以点击四个卡片快速进入对应功能。
            </p>
            <p className="home-modern-modal-text mb-2 text-[0.92rem] leading-[1.55]">
              功能入口：八字排盘、资研参详、行旅筹划、漫剧工坊。
            </p>
            <p className="home-modern-modal-text mb-2 text-[0.92rem] leading-[1.55]">
              如需查看旧版首页，请访问 <strong>/workspace</strong>。静态版落地页仍可访问 <strong>/home.html</strong>。
            </p>
            <div className="mt-2.5 flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setHelpOpen(false)}>
                我知道了
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
