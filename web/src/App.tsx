import { AnimatePresence, motion } from "framer-motion";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { HomeSoftStageDecor } from "./components/HomeSoftStageDecor";
import { HomePage } from "./pages/home/HomePage";
import { Workspace } from "./pages/workspace/Workspace";
import { Placeholder } from "./pages/workspace/Placeholder";
import { BaziPage } from "./pages/bazi/BaziPage";
import { Login } from "./pages/auth/Login";
import { Register } from "./pages/auth/Register";
import { MyCharts } from "./pages/workspace/MyCharts";

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
          <Route path="/workspace" element={<Workspace />} />
          <Route path="/my/charts" element={<MyCharts />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/bazi" element={<BaziPage />} />
          <Route path="/stocks" element={<Placeholder title="资研参详" hint="将接入结构化摘要/风险清单与历史记录。" />} />
          <Route path="/travel" element={<Placeholder title="行旅筹划" hint="将接入行程生成、预算拆分与清单。" />} />
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
          <AnimatedRoutes />
        </div>
      </div>
    </BrowserRouter>
  );
}
