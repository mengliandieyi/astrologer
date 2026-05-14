import { AnimatePresence, motion } from "framer-motion";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useState, lazy, Suspense } from "react";
import { HomeSoftStageDecor } from "./components/HomeSoftStageDecor";
import { HomePage } from "./pages/home/HomePage";
import { ToastProvider } from "./components/ui/Toast";

const Placeholder = lazy(() => import("./pages/workspace/Placeholder").then((m) => ({ default: m.Placeholder })));
const BaziPage = lazy(() => import("./pages/bazi/BaziPage").then((m) => ({ default: m.BaziPage })));
const Login = lazy(() => import("./pages/auth/Login").then((m) => ({ default: m.Login })));
const Register = lazy(() => import("./pages/auth/Register").then((m) => ({ default: m.Register })));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword").then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword").then((m) => ({ default: m.ResetPassword })));
const MyCharts = lazy(() => import("./pages/workspace/MyCharts").then((m) => ({ default: m.MyCharts })));
const MyProfiles = lazy(() => import("./pages/workspace/MyProfiles").then((m) => ({ default: m.MyProfiles })));
const HepanPage = lazy(() => import("./pages/hepan/HepanPage").then((m) => ({ default: m.HepanPage })));
const MyHepan = lazy(() => import("./pages/hepan/MyHepan").then((m) => ({ default: m.MyHepan })));
const StocksPage = lazy(() => import("./pages/stocks/StocksPage").then((m) => ({ default: m.StocksPage })));
const TravelPage = lazy(() => import("./pages/travel/TravelPage").then((m) => ({ default: m.TravelPage })));

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
        <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-[var(--accent,#c9a227)]" />
        <span>正在加载…</span>
      </div>
    </div>
  );
}

function ThemeGate() {
  const loc = useLocation();
  useEffect(() => {
    const p = loc.pathname || "";
    const shouldUseHomeModern = p === "/";
    const shouldUseBaziTheme = p === "/bazi" || p === "/my/profiles" || p === "/hepan" || p === "/my/hepan";
    const shouldUseStocksTheme = p === "/stocks";
    const shouldUseTravelTheme = p === "/xinglv" || p.startsWith("/xinglv/");
    if (shouldUseHomeModern) {
      document.documentElement.classList.add("home-root-modern");
    } else {
      document.documentElement.classList.remove("home-root-modern");
    }
    if (shouldUseBaziTheme) {
      document.documentElement.classList.add("theme-bazi");
    } else {
      document.documentElement.classList.remove("theme-bazi");
    }
    if (shouldUseStocksTheme) {
      document.documentElement.classList.add("theme-stocks");
    } else {
      document.documentElement.classList.remove("theme-stocks");
    }
    if (shouldUseTravelTheme) {
      document.documentElement.classList.add("theme-travel");
    } else {
      document.documentElement.classList.remove("theme-travel");
    }
  }, [loc.pathname]);
  return null;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    try {
      mq.addEventListener("change", handler);
    } catch {
      // Safari < 14
      mq.addListener(handler);
    }
    return () => {
      try {
        mq.removeEventListener("change", handler);
      } catch {
        mq.removeListener(handler);
      }
    };
  }, []);
  return reduced;
}

function AnimatedRoutes() {
  const location = useLocation();
  const reduced = usePrefersReducedMotion();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={reduced
          ? { opacity: 1, transition: { duration: 0.15 } }
          : { opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
        exit={reduced
          ? { opacity: 0, transition: { duration: 0.1 } }
          : { opacity: 0, y: -6, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }}
      >
        <Suspense fallback={<RouteFallback />}>
          <Routes location={location}>
            <Route path="/" element={<HomePage />} />
            <Route path="/workspace" element={<Navigate to="/" replace />} />
            <Route path="/my/charts" element={<MyCharts />} />
            <Route path="/my/profiles" element={<MyProfiles />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/bazi" element={<BaziPage />} />
            <Route path="/hepan" element={<HepanPage />} />
            <Route path="/my/hepan" element={<MyHepan />} />
            <Route path="/stocks" element={<StocksPage />} />
            <Route path="/xinglv" element={<TravelPage />} />
            <Route path="/xinglv/recommend" element={<TravelPage />} />
            <Route path="/xinglv/plan" element={<TravelPage />} />
            <Route path="/comic" element={<Placeholder title="漫剧工坊" hint="将接入分镜脚本与角色卡模板。" />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}

function StageDecor() {
  const loc = useLocation();
  if (loc.pathname !== "/") return null;
  return <HomeSoftStageDecor />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <div className="home-soft-stage">
          <StageDecor />
          <div className="home-soft-stage-content min-h-screen">
            <ThemeGate />
            <AnimatedRoutes />
          </div>
        </div>
      </ToastProvider>
    </BrowserRouter>
  );
}
