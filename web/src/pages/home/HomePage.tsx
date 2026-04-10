import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { authLogout, authMe } from "../../lib/authClient";

function splashAndNavigate(el: HTMLElement | null, path: string, navigate: (p: string) => void) {
  if (!el) {
    navigate(path);
    return;
  }
  const sp = document.createElement("div");
  sp.className = "home-landing-ink-splash";
  el.appendChild(sp);
  window.setTimeout(() => {
    sp.remove();
    navigate(path);
  }, 180);
}

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
    <div className="home-landing">
      <nav className="home-navbar">
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
          <h1 className="home-landing-title">知行馆·庭前百器</h1>
          <p className="home-landing-lead">
            观象参命；势审利害。
            <br />
            定程筹旅；行文分镜。
          </p>
        </div>
      <Link to="/" className="home-landing-mascot" aria-label="返回首页">
          <div className="home-landing-mascot-icon" aria-hidden />
          <div className="home-landing-mascot-text">可可爱爱小馆灵</div>
        </Link>
      </div>

      <div className="home-landing-grid">
        <div
          className="home-landing-card home-landing-card--bazi"
          role="button"
          tabIndex={0}
          onClick={(e) => splashAndNavigate(e.currentTarget, "/bazi", navigate)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              splashAndNavigate(e.currentTarget, "/bazi", navigate);
            }
          }}
        >
          <div className="home-landing-card-header">
            <div className="home-landing-card-icon">观</div>
            <div className="home-landing-card-title">
              <h3>八字排盘·灵犀解读</h3>
              <p>真太阳时 · 流年 · 证据链</p>
            </div>
          </div>
          <div className="home-landing-card-main">
            <div className="home-landing-card-copy">
              <p className="home-landing-card-desc">
                结论先行，证据为凭；支持排盘、命式与流年一站直达，帮助你快速形成判断与行动建议。
              </p>
            </div>
            <div className="home-landing-card-footer">
              <span className="home-landing-badge">可用</span>
              <Link
                to="/bazi"
                className="home-landing-btn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  splashAndNavigate(e.currentTarget.closest(".home-landing-card"), "/bazi", navigate);
                }}
              >
                去排盘
              </Link>
            </div>
          </div>
        </div>

        <div
          className="home-landing-card home-landing-card--ziyan"
          role="button"
          tabIndex={0}
          onClick={(e) => splashAndNavigate(e.currentTarget, "/stocks", navigate)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              splashAndNavigate(e.currentTarget, "/stocks", navigate);
            }
          }}
        >
          <div className="home-landing-card-header">
            <div className="home-landing-card-icon">势</div>
            <div className="home-landing-card-title">
              <h3>资研参详·灵犀研判</h3>
              <p>摘要 · 风险 · 核验清单</p>
            </div>
          </div>
          <div className="home-landing-card-main">
            <div className="home-landing-card-copy">
              <p className="home-landing-card-desc">
                材料入手，一页研判；覆盖摘要、风险与核验链路，帮助你在有限时间内抓住关键结论。
              </p>
            </div>
            <div className="home-landing-card-footer">
              <span className="home-landing-badge">可用</span>
              <Link
                to="/stocks"
                className="home-landing-btn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  splashAndNavigate(e.currentTarget.closest(".home-landing-card"), "/stocks", navigate);
                }}
              >
                去研判
              </Link>
            </div>
          </div>
        </div>

        <div
          className="home-landing-card home-landing-card--xinglv"
          role="button"
          tabIndex={0}
          onClick={(e) => splashAndNavigate(e.currentTarget, "/xinglv", navigate)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              splashAndNavigate(e.currentTarget, "/xinglv", navigate);
            }
          }}
        >
          <div className="home-landing-card-header">
            <div className="home-landing-card-icon">定</div>
            <div className="home-landing-card-title">
              <h3>行旅筹划·灵犀行程</h3>
              <p>行程 · 预算 · 清单</p>
            </div>
          </div>
          <div className="home-landing-card-main">
            <div className="home-landing-card-copy">
              <p className="home-landing-card-desc">
                路线预算，一次成行；行程、预算与清单快速成稿，减少反复修改和临时遗漏。
              </p>
            </div>
            <div className="home-landing-card-footer">
              <span className="home-landing-badge">可用</span>
              <Link
                to="/xinglv"
                className="home-landing-btn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  splashAndNavigate(e.currentTarget.closest(".home-landing-card"), "/xinglv", navigate);
                }}
              >
                去成行
              </Link>
            </div>
          </div>
        </div>

        <div
          className="home-landing-card home-landing-card--manju"
          role="button"
          tabIndex={0}
          onClick={(e) => splashAndNavigate(e.currentTarget, "/comic", navigate)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              splashAndNavigate(e.currentTarget, "/comic", navigate);
            }
          }}
        >
          <div className="home-landing-card-header">
            <div className="home-landing-card-icon">行</div>
            <div className="home-landing-card-title">
              <h3>漫剧工坊·灵犀分镜</h3>
              <p>分镜 · 对白 · 留钩</p>
            </div>
          </div>
          <div className="home-landing-card-main">
            <div className="home-landing-card-copy">
              <p className="home-landing-card-desc">
                轻喜开稿，一键分镜；分镜、对白与留钩同步生成，先搭骨架再精修细节更高效。
              </p>
            </div>
            <div className="home-landing-card-footer">
              <span className="home-landing-badge">可用</span>
              <Link
                to="/comic"
                className="home-landing-btn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  splashAndNavigate(e.currentTarget.closest(".home-landing-card"), "/comic", navigate);
                }}
              >
                去开稿
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 shrink-0 text-center text-xs text-[#6d5d8f]">
        <a
          className="underline decoration-[rgba(106,93,143,0.4)] underline-offset-4"
          href="/terms"
          rel="noreferrer noopener"
        >
          服务条款
        </a>{" "}
        ·{" "}
        <a
          className="underline decoration-[rgba(106,93,143,0.4)] underline-offset-4"
          href="/privacy"
          rel="noreferrer noopener"
        >
          隐私政策
        </a>{" "}
        · 本服务仅供文化娱乐参考
      </div>

      {helpOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(72,54,110,0.28)] p-4 backdrop-blur-[2px]"
          onClick={(e) => e.currentTarget === e.target && setHelpOpen(false)}
        >
          <div className="w-full max-w-[560px] rounded-[18px] border border-[rgba(255,255,255,0.72)] bg-[rgba(255,255,255,0.92)] p-4 text-[#5a4a7a] shadow-[0_18px_40px_rgba(70,50,110,0.18)]">
            <h3 className="mb-2 text-[1.12rem] font-bold text-[#665188]">帮助中心</h3>
            <p className="mb-2 text-[0.92rem] leading-[1.55] text-[#6b5a8b]">欢迎使用知行馆。你可以点击四个卡片快速进入对应功能。</p>
            <p className="mb-2 text-[0.92rem] leading-[1.55] text-[#6b5a8b]">功能入口：八字排盘、资研参详、行旅筹划、漫剧工坊。</p>
            <p className="mb-2 text-[0.92rem] leading-[1.55] text-[#6b5a8b]">
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
