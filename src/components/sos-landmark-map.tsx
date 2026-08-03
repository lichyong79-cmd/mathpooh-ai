"use client";

import { useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";

type SubjectName = "대수" | "미적분1" | "확률과통계";
type Weather = "clear" | "cloudy" | "rain";

type Props = {
  progress: Record<SubjectName, number>;
  recentCondition: number;
  onSelect: (subject: SubjectName) => void;
};

type Drop = {
  x: number;
  y: number;
  length: number;
  speed: number;
  drift: number;
  width: number;
  alpha: number;
  depth: number;
};

type Splash = {
  x: number;
  y: number;
  age: number;
  life: number;
  radius: number;
};

function RealRain({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let drops: Drop[] = [];
    let splashes: Splash[] = [];
    let last = performance.now();

    const makeDrop = (randomY = false): Drop => {
      const depth = 0.25 + Math.random() * 0.75;
      return {
        x: Math.random() * width,
        y: randomY ? Math.random() * height : -20 - Math.random() * 180,
        length: 7 + depth * 18 + Math.random() * 8,
        speed: 260 + depth * 520 + Math.random() * 150,
        drift: 15 + Math.random() * 28,
        width: 0.45 + depth * 1.05,
        alpha: 0.16 + depth * 0.34,
        depth,
      };
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drops = Array.from({ length: Math.round(Math.min(180, width / 6)) }, () => makeDrop(true));
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = (now: number) => {
      const dt = Math.min(0.035, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, width, height);

      for (const drop of drops) {
        drop.x += drop.drift * dt;
        drop.y += drop.speed * dt;
        const tilt = drop.length * 0.045;
        const grad = ctx.createLinearGradient(drop.x, drop.y, drop.x + tilt, drop.y + drop.length);
        grad.addColorStop(0, "rgba(205,230,255,0)");
        grad.addColorStop(0.28, `rgba(205,230,255,${drop.alpha * 0.6})`);
        grad.addColorStop(1, `rgba(238,248,255,${drop.alpha})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = drop.width;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x + tilt, drop.y + drop.length);
        ctx.stroke();

        if (drop.y > height - 20 - drop.depth * 16) {
          if (Math.random() < 0.38) {
            splashes.push({
              x: drop.x,
              y: height - 13 - Math.random() * 14,
              age: 0,
              life: 0.22 + Math.random() * 0.18,
              radius: 2 + drop.depth * 5,
            });
          }
          Object.assign(drop, makeDrop(false));
        }
      }

      splashes = splashes.filter((splash) => {
        splash.age += dt;
        const p = splash.age / splash.life;
        if (p >= 1) return false;
        ctx.strokeStyle = `rgba(205,232,255,${(1 - p) * 0.32})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.ellipse(splash.x, splash.y, splash.radius * (0.4 + p), splash.radius * 0.28 * (0.4 + p), 0, 0, Math.PI * 2);
        ctx.stroke();
        return true;
      });

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [active]);

  if (!active) return null;
  return <canvas ref={canvasRef} className="landmark-real-rain" aria-hidden="true" />;
}

function ConstructionMask({ progress }: { progress: number }) {
  if (progress >= 90) return null;
  const scaffold = Math.max(8, 100 - progress);
  return (
    <span className="construction-layer" style={{ height: `${scaffold}%` }} aria-hidden="true">
      <i className="construction-crane"><b /><em /></i>
      <i className="construction-grid" />
      <i className="construction-lamp lamp-one" />
      <i className="construction-lamp lamp-two" />
    </span>
  );
}

function Landmark({
  kind,
  subject,
  progress,
  onClick,
}: {
  kind: "sixty-three" | "lotte" | "lct";
  subject: SubjectName;
  progress: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`landmark-building landmark-${kind}`}
      onClick={onClick}
      aria-label={`${subject} 랜드마크 상세 보기`}
      style={{ "--completion": `${Math.max(5, progress)}%` } as CSSProperties}
    >
      <span className="landmark-shadow" />
      <span className="landmark-shell">
        <span className="landmark-built" />
        <span className="landmark-dark" />
        <span className="landmark-windows" />
        <ConstructionMask progress={progress} />
      </span>
      <span className="landmark-info">
        <small>{kind === "sixty-three" ? "SEOUL · YEOUIDO" : kind === "lotte" ? "SEOUL · JAMSIL" : "BUSAN · HAEUNDAE"}</small>
        <strong>{subject}</strong>
        <span><b>{progress}</b>% 완성</span>
      </span>
    </button>
  );
}

export default function SosLandmarkMap({ progress, recentCondition, onSelect }: Props) {
  const weather: Weather = recentCondition >= 78 ? "clear" : recentCondition >= 58 ? "cloudy" : "rain";
  const overall = Math.round((progress.대수 + progress.미적분1 + progress.확률과통계) / 3);
  const weatherText = weather === "clear" ? "맑고 활기찬 도시" : weather === "cloudy" ? "구름이 낀 도시" : "비 내리는 도시";

  const lightDots = useMemo(
    () => Array.from({ length: 90 }, (_, i) => ({
      left: `${8 + ((i * 37) % 82)}%`,
      top: `${10 + ((i * 53) % 75)}%`,
      delay: `${(i % 12) * 0.17}s`,
      size: 1 + (i % 3),
    })),
    [],
  );

  return (
    <section className={`landmark-map weather-${weather}`}>
      <div className="landmark-sky" aria-hidden="true">
        <span className="landmark-cloud cloud-a" />
        <span className="landmark-cloud cloud-b" />
        <span className="landmark-cloud cloud-c" />
      </div>

      <header className="landmark-head">
        <div>
          <small>MATHPOOH · STUDENT LANDMARK</small>
          <h1>SOS LANDMARK</h1>
          <p>실전모의고사 최고 기록으로 대한민국 랜드마크를 완성하세요.</p>
        </div>
        <div className="landmark-status">
          <span>도시 완성도</span>
          <b>{overall}<em>%</em></b>
          <small>{weatherText} · 최근 실모 {recentCondition}점</small>
        </div>
      </header>

      <div className="landmark-world">
        <div className="landmark-sea-shine" aria-hidden="true" />
        <svg className="korea-map" viewBox="0 0 760 680" role="img" aria-label="대한민국 3D 지도">
          <defs>
            <linearGradient id="landGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#244b48" />
              <stop offset="0.42" stopColor="#173b3d" />
              <stop offset="1" stopColor="#0b252d" />
            </linearGradient>
            <linearGradient id="coastGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#45c7bc" stopOpacity=".85" />
              <stop offset="1" stopColor="#168b96" stopOpacity=".22" />
            </linearGradient>
            <filter id="mapShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="16" dy="24" stdDeviation="18" floodColor="#00121d" floodOpacity=".75" />
            </filter>
            <filter id="terrainGlow">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g transform="translate(88 28) rotate(-4 300 320)" filter="url(#mapShadow)">
            <path className="korea-depth" d="M249 18 C286 27 313 57 316 92 C339 114 355 146 347 176 C373 205 366 240 346 263 C354 288 342 311 320 328 C325 357 305 381 286 399 C293 426 277 449 253 463 C250 492 228 511 211 529 C198 548 199 580 175 604 C155 626 119 615 112 589 C93 572 95 543 105 519 C86 498 80 470 93 447 C77 421 82 395 98 374 C84 350 91 321 111 304 C102 274 118 251 136 232 C127 205 142 177 165 160 C159 130 177 108 197 91 C196 58 216 32 249 18 Z" transform="translate(18 26)" />
            <path className="korea-land" d="M249 18 C286 27 313 57 316 92 C339 114 355 146 347 176 C373 205 366 240 346 263 C354 288 342 311 320 328 C325 357 305 381 286 399 C293 426 277 449 253 463 C250 492 228 511 211 529 C198 548 199 580 175 604 C155 626 119 615 112 589 C93 572 95 543 105 519 C86 498 80 470 93 447 C77 421 82 395 98 374 C84 350 91 321 111 304 C102 274 118 251 136 232 C127 205 142 177 165 160 C159 130 177 108 197 91 C196 58 216 32 249 18 Z" fill="url(#landGrad)" stroke="url(#coastGrad)" strokeWidth="5" />
            <path className="mountain-range" d="M271 70 C248 127 258 179 231 230 C209 276 231 321 203 371 C180 413 193 458 163 515" />
            <path className="mountain-range minor" d="M204 121 C232 180 201 231 213 286 C222 327 190 370 194 416" />
            <path className="river han" d="M117 184 C161 173 190 189 230 180 C260 173 281 184 308 174" />
            <path className="road-line" d="M145 198 C177 250 179 319 159 384 C150 429 152 482 169 537" />
            <path className="road-line secondary" d="M238 190 C260 235 253 297 233 341 C213 386 211 446 193 490" />
            <ellipse className="jeju-depth" cx="113" cy="648" rx="52" ry="18" />
            <ellipse className="jeju-land" cx="104" cy="637" rx="50" ry="17" />
            <circle className="ulleung" cx="397" cy="213" r="8" />
          </g>
        </svg>

        <div className="city-light-field" aria-hidden="true">
          {lightDots.map((dot, index) => (
            <i key={index} style={{ left: dot.left, top: dot.top, animationDelay: dot.delay, width: dot.size, height: dot.size }} />
          ))}
        </div>

        <div className="city-label city-seoul"><i /><b>서울</b><span>SEOUL</span></div>
        <div className="city-label city-daejeon"><i /><b>대전</b><span>DAEJEON</span></div>
        <div className="city-label city-daegu"><i /><b>대구</b><span>DAEGU</span></div>
        <div className="city-label city-busan"><i /><b>부산</b><span>BUSAN</span></div>
        <div className="city-label city-gwangju"><i /><b>광주</b><span>GWANGJU</span></div>

        <Landmark kind="sixty-three" subject="대수" progress={progress.대수} onClick={() => onSelect("대수")} />
        <Landmark kind="lotte" subject="미적분1" progress={progress.미적분1} onClick={() => onSelect("미적분1")} />
        <Landmark kind="lct" subject="확률과통계" progress={progress.확률과통계} onClick={() => onSelect("확률과통계")} />

        <div className="map-legend">
          <span><i className="legend-gold" />대수 · 63빌딩</span>
          <span><i className="legend-blue" />미적분1 · 롯데월드타워</span>
          <span><i className="legend-green" />확률과통계 · 해운대 LCT</span>
        </div>
      </div>

      <RealRain active={weather === "rain"} />
      <div className="landmark-vignette" aria-hidden="true" />
    </section>
  );
}
