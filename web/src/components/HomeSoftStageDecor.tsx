import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * 与 web/public/home.html 一致的装饰层：水墨底纹、云、纸人、花瓣。
 * 仅负责视觉，pointer-events: none。
 */
export function HomeSoftStageDecor() {
  const petalsRef = useRef<HTMLDivElement>(null);
  const loc = useLocation();

  useEffect(() => {
    const box = petalsRef.current;
    if (!box) return;
    box.replaceChildren();
    const frag = document.createDocumentFragment();
    const isHomeModern = document.documentElement.classList.contains("home-root-modern");
    const count = isHomeModern ? 28 : 36;
    for (let i = 0; i < count; i++) {
      const p = document.createElement("div");
      p.className = "home-soft-petal";
      p.style.left = `${Math.random() * 100}%`;
      // 首页更“高级”的克制：更慢、更柔（颜色不变）
      p.style.animationDuration = `${Math.random() * 8 + (isHomeModern ? 14 : 10)}s`;
      p.style.animationDelay = `${Math.random() * 8}s`;
      frag.appendChild(p);
    }
    box.appendChild(frag);
    return () => {
      box.replaceChildren();
    };
  }, [loc.pathname]);

  return (
    <>
      <div className="home-soft-cloud home-soft-cloud1" aria-hidden />
      <div className="home-soft-cloud home-soft-cloud2" aria-hidden />
      <div className="home-soft-cloud home-soft-cloud3" aria-hidden />
      <div className="home-soft-qcharacter" aria-hidden />
      <div ref={petalsRef} className="home-soft-petals-root" aria-hidden />
    </>
  );
}
