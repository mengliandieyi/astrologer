import { useEffect, useRef } from "react";

/**
 * 与 web/public/home.html 一致的装饰层：水墨底纹、云、纸人、花瓣。
 * 仅负责视觉，pointer-events: none。
 */
export function HomeSoftStageDecor() {
  const petalsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = petalsRef.current;
    if (!box) return;
    box.replaceChildren();
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 36; i++) {
      const p = document.createElement("div");
      p.className = "home-soft-petal";
      p.style.left = `${Math.random() * 100}%`;
      p.style.animationDuration = `${Math.random() * 6 + 10}s`;
      p.style.animationDelay = `${Math.random() * 8}s`;
      frag.appendChild(p);
    }
    box.appendChild(frag);
    return () => {
      box.replaceChildren();
    };
  }, []);

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
