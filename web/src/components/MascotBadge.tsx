import { Link } from "react-router-dom";

type Props = {
  to?: string;
  label?: string;
  text?: string;
  className?: string;
  size?: "sm" | "md";
};

export function MascotBadge({ to = "/", label = "返回首页", text = "可可爱爱小馆灵", className = "", size = "sm" }: Props) {
  return (
    <Link
      to={to}
      className={`home-landing-mascot home-modern-mascot shrink-0 mascot-size-${size} ${className}`.trim()}
      aria-label={label}
    >
      <div className="home-mascot-badge-graphic" aria-hidden>
        <svg
          className="home-mascot-badge-svg"
          viewBox="0 0 64 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M32 78c14.5 0 26-7.3 26-16.3 0-11.2-9.9-18.9-26-18.9S6 50.5 6 61.7C6 70.7 17.5 78 32 78Z"
            fill="rgba(255,255,255,0.72)"
            stroke="rgba(28,25,23,0.12)"
          />
          <path
            d="M12 56c5.8-6.7 12.8-10.2 20-10.2S46.2 49.3 52 56c-3.8 8.4-12 14-20 14s-16.2-5.6-20-14Z"
            fill="rgba(212,196,176,0.45)"
          />
          <circle cx="32" cy="28" r="18" fill="rgba(255,255,255,0.9)" stroke="rgba(28,25,23,0.12)" />
          <path
            d="M18.6 23.2c2.8-4.2 7.1-6.8 13.4-6.8s10.6 2.6 13.4 6.8"
            stroke="rgba(92,83,72,0.45)"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <path d="M25.2 20.9c-.9 2.1-2.5 3.6-4.8 4.5" stroke="rgba(92,83,72,0.38)" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M38.8 20.9c.9 2.1 2.5 3.6 4.8 4.5" stroke="rgba(92,83,72,0.38)" strokeWidth="2.6" strokeLinecap="round" />
          <path
            d="M24.6 19.6c1.2 1.4 3 2.2 5.4 2.2s4.2-.8 5.4-2.2"
            stroke="rgba(92,83,72,0.34)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M27.2 18.8c.6 1.4 1.8 2.3 3.6 2.3s3-.9 3.6-2.3"
            stroke="rgba(92,83,72,0.26)"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <path d="M18.4 28.6c-1.9 1.8-2.8 3.7-2.8 5.6" stroke="rgba(92,83,72,0.30)" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M45.6 28.6c1.9 1.8 2.8 3.7 2.8 5.6" stroke="rgba(92,83,72,0.30)" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="25" cy="28.2" r="2.9" fill="#1c1917" opacity="0.86" />
          <circle cx="39" cy="28.2" r="2.9" fill="#1c1917" opacity="0.86" />
          <circle cx="24.2" cy="27.4" r="0.9" fill="rgba(255,255,255,0.88)" />
          <circle cx="38.2" cy="27.4" r="0.9" fill="rgba(255,255,255,0.88)" />
          <ellipse cx="20.4" cy="32.2" rx="3.4" ry="2.25" fill="rgba(212,196,176,0.55)" />
          <ellipse cx="43.6" cy="32.2" rx="3.4" ry="2.25" fill="rgba(212,196,176,0.55)" />
          <path
            d="M27.6 34.4c1.4 1.2 2.4 1.8 4.2 1.8s2.8-.6 4.2-1.8"
            stroke="#1c1917"
            strokeOpacity="0.55"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M29.2 35.1c.6.7 1.4 1.1 2.8 1.1s2.2-.4 2.8-1.1"
            stroke="#1c1917"
            strokeOpacity="0.38"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M48.5 19.5l1.2 2.4 2.6.4-1.9 1.8.4 2.6-2.3-1.2-2.3 1.2.4-2.6-1.9-1.8 2.6-.4 1.1-2.4Z"
            fill="rgba(212,196,176,0.7)"
            stroke="rgba(28,25,23,0.12)"
          />
          <path
            d="M18.5 16.5c3.8-5.2 10-8.5 13.5-8.5s9.7 3.3 13.5 8.5"
            stroke="rgba(92,83,72,0.55)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M18.2 22.0c2.6-8.2 7.9-12.8 13.8-12.8S43.2 13.8 45.8 22.0"
            stroke="rgba(92,83,72,0.50)"
            strokeWidth="4.8"
            strokeLinecap="round"
          />
          <path
            d="M20.0 21.4c2.5-7.1 7.0-11.0 12.0-11.0s9.5 3.9 12.0 11.0"
            stroke="rgba(250,250,249,0.75)"
            strokeWidth="2.9"
            strokeLinecap="round"
            opacity="0.85"
          />
          <g opacity="0.98">
            <path
              d="M23.2 15.4c-2.8-1.2-5.2.3-6.4 1.9 1.5 2.2 4.3 3.8 7.1 3 .2-1.6.1-3.2-.7-4.9Z"
              fill="rgba(212,196,176,0.78)"
              stroke="rgba(28,25,23,0.12)"
            />
            <path
              d="M23.2 15.4c2.8-1.2 5.2.3 6.4 1.9-1.5 2.2-4.3 3.8-7.1 3-.2-1.6-.1-3.2.7-4.9Z"
              fill="rgba(250,250,249,0.78)"
              stroke="rgba(28,25,23,0.12)"
            />
            <circle cx="23.2" cy="18.1" r="1.25" fill="rgba(212,196,176,0.95)" stroke="rgba(28,25,23,0.14)" />
          </g>
          <path
            d="M10 60c6.5 3.8 14.2 6 22 6s15.5-2.2 22-6"
            stroke="rgba(28,25,23,0.12)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M32 44c2.6 0 4.8 1.2 4.8 2.8S34.6 50 32 50s-4.8-1.2-4.8-3.2S29.4 44 32 44Z"
            fill="rgba(212,196,176,0.72)"
          />
          <path d="M27.5 47c-3.6-1.2-6-3.7-6-6 3.5-.8 7.1.7 8.5 3.2" fill="rgba(212,196,176,0.55)" />
          <path d="M36.5 47c3.6-1.2 6-3.7 6-6-3.5-.8-7.1.7-8.5 3.2" fill="rgba(212,196,176,0.55)" />
          <g className="home-mascot-hands">
            <path d="M18.2 43.2c3.6-2.4 7-2.9 10.4-1.6" stroke="rgba(28,25,23,0.26)" strokeWidth="2.8" strokeLinecap="round" />
            <path d="M45.8 43.2c-3.6-2.4-7-2.9-10.4-1.6" stroke="rgba(28,25,23,0.26)" strokeWidth="2.8" strokeLinecap="round" />
            <path
              d="M21.2 42.6c1.6-.7 3.2-.7 4.6.2 1.2.8 1.8 2.1 1.3 3.2-.6 1.3-2.4 2.2-4.6 1.6-2.2-.6-3.4-2.6-1.3-5Z"
              fill="rgba(250,250,249,0.82)"
              stroke="rgba(28,25,23,0.18)"
              strokeWidth="1.4"
            />
            <path
              d="M42.8 42.6c-1.6-.7-3.2-.7-4.6.2-1.2.8-1.8 2.1-1.3 3.2.6 1.3 2.4 2.2 4.6 1.6 2.2-.6 3.4-2.6 1.3-5Z"
              fill="rgba(250,250,249,0.82)"
              stroke="rgba(28,25,23,0.18)"
              strokeWidth="1.4"
            />
            <circle cx="24.0" cy="45.4" r="0.75" fill="rgba(212,196,176,0.9)" opacity="0.9" />
            <circle cx="40.0" cy="45.4" r="0.75" fill="rgba(212,196,176,0.9)" opacity="0.9" />
          </g>
        </svg>
      </div>
      <div className="home-landing-mascot-text">{text}</div>
    </Link>
  );
}
