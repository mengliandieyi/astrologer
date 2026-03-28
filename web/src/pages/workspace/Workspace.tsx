import { Link } from "react-router-dom";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

function Topbar() {
  return (
    <div className="flex items-center justify-between gap-3 py-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-gold to-jade shadow-soft" />
        <div className="text-sm font-extrabold tracking-[0.18em] text-slate-100">知行馆</div>
      </div>
      <nav className="flex flex-wrap items-center justify-end gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/">工作台</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/bazi">八字</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/stocks">资研</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/travel">行旅</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/comic">漫剧</Link>
        </Button>
      </nav>
    </div>
  );
}

function ToolCard(props: {
  icon: string;
  title: string;
  subtitle: string;
  desc: string;
  href: string;
  tag: string;
  tone?: "bazi" | "stocks" | "travel" | "comic";
  cta?: string;
  featured?: boolean;
  auxHref?: string;
  auxLabel?: string;
}) {
  const tone = props.tone || "bazi";
  const toneBg =
    tone === "bazi"
      ? "from-gold/25 via-transparent to-jade/20"
      : tone === "stocks"
        ? "from-indigo-500/25 via-transparent to-gold/15"
        : tone === "travel"
          ? "from-jade/25 via-transparent to-violet-500/15"
          : "from-violet-500/25 via-transparent to-gold/15";

  const iconBg =
    tone === "bazi"
      ? "from-gold to-jade text-slate-950"
      : tone === "stocks"
        ? "from-indigo-400 to-gold text-slate-950"
        : tone === "travel"
          ? "from-jade to-indigo-400 text-slate-950"
          : "from-violet-400 to-gold text-slate-950";

  const tagCls =
    tone === "bazi"
      ? "border-gold/35 bg-gold/10"
      : tone === "stocks"
        ? "border-indigo-300/30 bg-indigo-400/10"
        : tone === "travel"
          ? "border-jade/35 bg-jade/10"
          : "border-violet-300/35 bg-violet-400/10";

  const cardCls =
    tone === "bazi"
      ? "hover:border-gold/45"
      : tone === "stocks"
        ? "hover:border-indigo-300/40"
        : tone === "travel"
          ? "hover:border-jade/45"
          : "hover:border-violet-300/40";

  const auraCls =
    tone === "bazi"
      ? "aura aura-bazi"
      : tone === "stocks"
        ? "aura aura-stocks"
        : tone === "travel"
          ? "aura aura-travel"
          : "aura aura-comic";

  const surfaceCls =
    tone === "bazi"
      ? "from-[#0b1228] via-[#0a152d] to-[#091127] border-gold/20"
      : tone === "stocks"
        ? "from-[#0a1028] via-[#0b1433] to-[#070b1c] border-indigo-300/20"
        : tone === "travel"
          ? "from-[#071826] via-[#071c2d] to-[#061525] border-jade/20"
          : "from-[#120a2a] via-[#0b1433] to-[#0a071c] border-violet-300/20";

  const textureCls =
    tone === "bazi"
      ? "texture texture-bazi"
      : tone === "stocks"
        ? "texture texture-stocks"
        : tone === "travel"
          ? "texture texture-travel"
          : "texture texture-comic";

  return (
    <Card className={`relative overflow-hidden transition-transform hover:-translate-y-0.5 hover:bg-white/10 ${cardCls}`}>
      <div className={`${auraCls}${props.featured ? " aura-featured" : ""}`} />
      <div className={`pointer-events-none absolute -inset-12 bg-gradient-to-br ${toneBg} blur-2xl opacity-70`} />
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${surfaceCls} opacity-90`} />
      <div className={textureCls} />
      <CardHeader>
        <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl shadow-soft icon-glint">
          <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${iconBg}`} />
          <div className="relative font-black">{props.icon}</div>
        </div>
        <div className="relative min-w-0">
          <CardTitle className="clamp-1">{props.title}</CardTitle>
          <CardDescription className="mt-0.5 clamp-1">{props.subtitle}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative flex h-full min-h-[84px] flex-col">
          <p className="clamp-2 text-sm text-slate-200/80">{props.desc}</p>

          <div className="mt-auto pt-4 flex items-center justify-between gap-3">
            <Badge className={tagCls}>{props.tag}</Badge>
            <Button asChild size="sm" className="btn-anime">
              <Link to={props.href}>{props.cta || "进入"}</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function Workspace() {
  const [mascotBroken, setMascotBroken] = useState(false);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      document.documentElement.style.setProperty("--mx", `${x}%`);
      document.documentElement.style.setProperty("--my", `${y}%`);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const mascotFallbackSvg = useMemo(() => {
    return (
      <svg viewBox="0 0 1200 720" className="h-full w-full">
        <defs>
          <linearGradient id="mf1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(201,162,39,0.92)" />
            <stop offset="55%" stopColor="rgba(31,157,138,0.62)" />
            <stop offset="100%" stopColor="rgba(109,40,217,0.52)" />
          </linearGradient>
          <radialGradient id="mf2" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
            <stop offset="70%" stopColor="rgba(255,255,255,0.02)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="1200" height="720" fill="rgba(255,255,255,0.03)" />
        <path
          d="M0,520 C180,420 260,580 430,520 C610,455 670,300 860,330 C1020,355 1090,300 1200,270 L1200,720 L0,720 Z"
          fill="rgba(255,255,255,0.035)"
        />
        <path
          d="M0,560 C200,430 300,640 470,560 C640,480 700,360 900,380 C1040,394 1110,340 1200,320"
          stroke="url(#mf1)"
          strokeWidth="10"
          opacity="0.25"
          fill="none"
        />
        <circle cx="905" cy="240" r="190" fill="url(#mf2)" opacity="0.9" />
        <circle cx="900" cy="270" r="120" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
        <circle cx="860" cy="255" r="10" fill="rgba(241,245,249,0.85)" />
        <circle cx="940" cy="255" r="10" fill="rgba(241,245,249,0.85)" />
        <path d="M860 300c22 18 58 18 80 0" stroke="rgba(241,245,249,0.7)" strokeWidth="10" strokeLinecap="round" fill="none" />
      </svg>
    );
  }, []);

  const fadeUp: Variants = {
    hidden: { opacity: 0, y: 14, filter: "blur(6px)" },
    show: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
    },
  };

  return (
    <div className="prompt-stage">
      <div className="mx-auto w-full max-w-6xl px-4">
        <Topbar />
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-10">
        <motion.section
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } }}
          initial="hidden"
          animate="show"
          className="grid min-h-[calc(100vh-88px)] grid-rows-[minmax(320px,48vh)_1fr] gap-4"
        >
          <motion.div variants={fadeUp} className="glass relative overflow-hidden rounded-[22px] p-5 shadow-soft">
            <div className="pointer-events-none absolute inset-0 opacity-90 [background:radial-gradient(420px_240px_at_18%_22%,rgba(201,162,39,.22),transparent_65%),radial-gradient(520px_240px_at_88%_14%,rgba(31,157,138,.18),transparent_70%),radial-gradient(520px_260px_at_60%_110%,rgba(109,40,217,.20),transparent_70%)]" />
            <div className="relative grid h-full grid-cols-1 gap-4 lg:grid-cols-[1fr_1.15fr] lg:items-stretch">
              <div className="min-w-0 self-end pb-1">
                <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">知行馆 · 庭前百器</h1>
                <div className="mt-3 text-sm leading-7 text-slate-200/80">
                  <div>
                    <span className="acrostic-head">观</span>象参命；<span className="acrostic-head">势</span>审利害。
                  </div>
                  <div>
                    <span className="acrostic-head">定</span>程筹旅；<span className="acrostic-head">行</span>文分镜。
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-200/70">
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">古风 · Q版 · 动效</span>
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">四器平权 · 一屏即达</span>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-white/5 shadow-soft hero-mascot">
                <div className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(560px_260px_at_20%_10%,rgba(201,162,39,0.22),transparent_64%),radial-gradient(620px_300px_at_86%_16%,rgba(31,157,138,0.16),transparent_70%),radial-gradient(720px_360px_at_56%_118%,rgba(109,40,217,0.10),transparent_70%)]" />
                <div className="pointer-events-none absolute inset-0 opacity-20 [background:linear-gradient(115deg,transparent_0%,rgba(255,255,255,0.10)_45%,transparent_62%)] hero-sheen" />
                <div className="absolute left-3 top-3 z-10">
                  <Badge className="border-white/20 bg-white/10">万相 · 吉祥物</Badge>
                </div>
                <div className="relative h-full min-h-[190px]">
                  {!mascotBroken ? (
                    <img
                      src="/mascot.png"
                      alt="知行馆 吉祥物"
                      className="h-full w-full object-cover"
                      loading="eager"
                      onError={() => setMascotBroken(true)}
                    />
                  ) : (
                    <div className="h-full w-full">{mascotFallbackSvg}</div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-rows-2">
            <motion.div variants={fadeUp}>
              <ToolCard featured icon="观" title="八字排盘 · 灵犀解读" subtitle="真太阳时 · 流年 · 证据链" desc="结论先行，证据为凭。" href="/bazi" tag="可用" tone="bazi" cta="去排盘" />
            </motion.div>
            <motion.div variants={fadeUp}>
              <ToolCard icon="势" title="资研参详 · 灵犀研判" subtitle="摘要 · 风险 · 核验清单" desc="材料入手，一页研判。" href="/stocks" tag="MVP" tone="stocks" cta="去研判" />
            </motion.div>
            <motion.div variants={fadeUp}>
              <ToolCard icon="定" title="行旅筹划 · 灵犀行程" subtitle="行程 · 预算 · 清单" desc="路线预算，一次成行。" href="/travel" tag="MVP" tone="travel" cta="去成行" />
            </motion.div>
            <motion.div variants={fadeUp}>
              <ToolCard icon="行" title="漫剧工坊 · 灵犀分镜" subtitle="分镜 · 对白 · 留钩" desc="轻喜开稿，一键分镜。" href="/comic" tag="MVP" tone="comic" cta="去开稿" />
            </motion.div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}

