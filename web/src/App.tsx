import { AnimatePresence, motion } from "framer-motion";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { HomeSoftStageDecor } from "./components/HomeSoftStageDecor";
import { HomePage } from "./pages/home/HomePage";
import { Placeholder } from "./pages/workspace/Placeholder";
import { BaziPage } from "./pages/bazi/BaziPage";
import { Login } from "./pages/auth/Login";
import { Register } from "./pages/auth/Register";
import { ForgotPassword } from "./pages/auth/ForgotPassword";
import { ResetPassword } from "./pages/auth/ResetPassword";
import { MyCharts } from "./pages/workspace/MyCharts";
import { MyProfiles } from "./pages/workspace/MyProfiles";
import { HepanPage } from "./pages/hepan/HepanPage";
import { MyHepan } from "./pages/hepan/MyHepan";
import { StocksPage } from "./pages/stocks/StocksPage";
import { TravelPage } from "./pages/travel/TravelPage";

function ThemeGate() {
  const loc = useLocation();
  useEffect(() => {
    const p = loc.pathname || "";
    const shouldUseBaziTheme = p === "/bazi" || p === "/my/profiles" || p === "/hepan" || p === "/my/hepan";
    const shouldUseStocksTheme = p === "/stocks";
    const shouldUseTravelTheme = p === "/xinglv" || p.startsWith("/xinglv/");
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

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }}
        exit={{ opacity: 0, y: -8, filter: "blur(8px)", transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
      >
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
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="home-soft-stage">
        <HomeSoftStageDecor />
        <div className="home-soft-stage-content min-h-screen">
          <ThemeGate />
          <AnimatedRoutes />
        </div>
      </div>
    </BrowserRouter>
  );
}
