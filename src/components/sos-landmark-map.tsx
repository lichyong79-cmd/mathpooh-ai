"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  LANDMARK_SUBJECTS,
  type LandmarkSubject,
  type LandmarkSummary,
} from "@/lib/landmark";

type Weather = "clear" | "cloudy" | "rain";

type Props = {
  data: LandmarkSummary;
  studentName?: string;
  onSelect: (subject: LandmarkSubject) => void;
};

/* ══════════════════════════════════════════════════════════════════════════
   지도 좌표계
   지도는 실제 경위도를 옮긴 좌표(geo)로 그리고, 그 위에 같은 행렬을 적용해
   기울여서 바닥면을 만듭니다. 건물 위치도 같은 함수를 쓰기 때문에
   지도를 고쳐도 건물이 따라 움직입니다.
     geo x = (경도 - 125.8) * 230
     geo y = (38.8 - 위도) * 230
   ══════════════════════════════════════════════════════════════════════════ */

const MAP_W = 820;
const MAP_H = 574;

/**
 * 바닥 만들기 3단계. 지도, 건물, 지명이 모두 이 행렬 하나를 통과합니다.
 *  1) 서울–부산 대각선 방향으로만 축척을 줄입니다.
 *     실제 축척대로 두면 서울과 부산이 너무 멀어 화면이 비어 보입니다.
 *  2) 바닥을 눕힙니다. (세로 55%, 아래로 갈수록 왼쪽으로)
 *  3) 화면 크기에 맞춰 옮기고 줄입니다.
 * DIAGONAL_SCALE만 바꾸면 두 도시 사이 거리가 조절됩니다. (1 = 실제 축척)
 */
const DIAGONAL_SCALE = 0.68;
const AXIS = { x: 0.642, y: 0.766 };
const AXIS_CENTER = { x: 509, y: 567 };
const TILT = { x: -0.12, y: 0.55 };
const FIT = { scale: 0.9678, x: 49.953, y: -43.857 };

const VIEW = (() => {
  const s = DIAGONAL_SCALE - 1;
  const m = {
    a: 1 + s * AXIS.x * AXIS.x,
    b: s * AXIS.x * AXIS.y,
    c: s * AXIS.x * AXIS.y,
    d: 1 + s * AXIS.y * AXIS.y,
  };
  const ox = AXIS_CENTER.x - (m.a * AXIS_CENTER.x + m.b * AXIS_CENTER.y);
  const oy = AXIS_CENTER.y - (m.c * AXIS_CENTER.x + m.d * AXIS_CENTER.y);
  return {
    a: (m.a + TILT.x * m.c) * FIT.scale,
    b: TILT.y * m.c * FIT.scale,
    c: (m.b + TILT.x * m.d) * FIT.scale,
    d: TILT.y * m.d * FIT.scale,
    e: (ox + TILT.x * oy) * FIT.scale + FIT.x,
    f: TILT.y * oy * FIT.scale + FIT.y,
  };
})();

const VIEW_MATRIX = `matrix(${VIEW.a} ${VIEW.b} ${VIEW.c} ${VIEW.d} ${VIEW.e} ${VIEW.f})`;

function place(x: number, y: number) {
  return {
    left: `${((VIEW.a * x + VIEW.c * y + VIEW.e) / MAP_W) * 100}%`,
    top: `${((VIEW.b * x + VIEW.d * y + VIEW.f) / MAP_H) * 100}%`,
  };
}

/** 남한 해안선 (서북 임진강 하구에서 시계 방향) */
const KOREA_PATH = `M207 207
C300 150 450 100 598 57
C640 120 665 180 713 241
C762 300 802 352 828 416
C851 482 863 561 867 625
C856 682 831 721 816 759
C796 802 771 831 747 851
C700 881 651 900 598 908
C551 921 511 926 483 931
C462 936 447 927 437 931
C412 971 381 1001 357 1012
C300 1031 221 1041 161 1035
C131 1001 133 951 138 920
C146 871 131 831 138 805
C161 751 191 701 207 648
C191 621 166 601 161 575
C131 541 91 511 80 483
C121 461 181 446 207 425
C201 391 181 341 184 310
C171 281 191 241 207 207 Z`;

const PLACES = [
  { name: "대전", x: 363, y: 564 },
  { name: "대구", x: 615, y: 690 },
  { name: "광주", x: 242, y: 837 },
  { name: "부산", x: 650, y: 875 },
  { name: "제주", x: 232, y: 1128 },
];

/** 야경 불빛이 모이는 도시들 (x, y, 반경, 밀도) */
const LIGHT_CLUSTERS = [
  { x: 271, y: 283, r: 62, w: 44 },
  { x: 184, y: 310, r: 34, w: 16 },
  { x: 363, y: 564, r: 28, w: 14 },
  { x: 350, y: 470, r: 24, w: 10 },
  { x: 644, y: 674, r: 30, w: 16 },
  { x: 242, y: 837, r: 28, w: 13 },
  { x: 772, y: 837, r: 32, w: 18 },
  { x: 816, y: 759, r: 22, w: 10 },
  { x: 662, y: 821, r: 24, w: 10 },
  { x: 280, y: 650, r: 24, w: 10 },
  { x: 713, y: 241, r: 20, w: 7 },
  { x: 444, y: 212, r: 20, w: 7 },
  { x: 819, y: 639, r: 20, w: 8 },
  { x: 232, y: 1128, r: 26, w: 7 },
];

/* ══════════════════════════════════════════════════════════════════════════
   과목 ↔ 랜드마크 배정
   대수      = 63빌딩 (금색, 서울 여의도)
   미적분1   = 롯데월드타워 (파랑, 서울 잠실)
   확률과통계 = 해운대 LCT (초록, 부산 해운대)
   배정을 바꾸려면 subject 값만 서로 바꾸면 됩니다.
   ══════════════════════════════════════════════════════════════════════════ */

type TowerConfig = {
  subject: LandmarkSubject;
  kind: "sixtythree" | "lotte" | "lct";
  place: string;
  city: string;
  /** 지도 위 발밑 좌표 (geo) */
  x: number;
  y: number;
  /** 바닥 대비 높이(%)와 가로세로 비율 */
  height: number;
  aspect: string;
  /** 정보 카드가 붙는 방향 */
  side: "left" | "right";
  /** 층 게이지가 붙는 방향 */
  gauge: "left" | "right";
};

const TOWERS: TowerConfig[] = [
  {
    subject: "대수",
    kind: "sixtythree",
    place: "63빌딩",
    city: "서울 여의도",
    x: 214,
    y: 306,
    height: 30,
    aspect: "120 / 300",
    side: "left",
    gauge: "right",
  },
  {
    subject: "미적분1",
    kind: "lotte",
    place: "롯데월드타워",
    city: "서울 잠실",
    x: 338,
    y: 276,
    height: 44,
    aspect: "94 / 300",
    side: "right",
    gauge: "right",
  },
  {
    subject: "확률과통계",
    kind: "lct",
    place: "해운대 LCT",
    city: "부산 해운대",
    x: 752,
    y: 824,
    height: 35,
    aspect: "150 / 300",
    side: "right",
    gauge: "right",
  },
];

const CITY_STAGE = [
  "불 꺼진 해안선",
  "첫 도시에 불이 들어옴",
  "고속도로가 열린 나라",
  "야경이 도는 대도시권",
  "빛으로 덮인 대한민국",
];

/* ─────────────────────────── 비 ─────────────────────────── */

type Drop = { x: number; y: number; length: number; speed: number; alpha: number };

function RainLayer({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let drops: Drop[] = [];
    let last = performance.now();

    const makeDrop = (randomY = false): Drop => {
      const depth = 0.25 + Math.random() * 0.75;
      return {
        x: Math.random() * width,
        y: randomY ? Math.random() * height : -20 - Math.random() * 160,
        length: 7 + depth * 16,
        speed: 260 + depth * 520,
        alpha: 0.14 + depth * 0.3,
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
      drops = Array.from({ length: Math.round(Math.min(150, width / 7)) }, () =>
        makeDrop(true),
      );
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const draw = (now: number) => {
      const dt = Math.min(0.035, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = "round";
      for (const drop of drops) {
        drop.x += 22 * dt;
        drop.y += drop.speed * dt;
        ctx.strokeStyle = `rgba(214,236,255,${drop.alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x + drop.length * 0.05, drop.y + drop.length);
        ctx.stroke();
        if (drop.y > height) Object.assign(drop, makeDrop(false));
      }
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [active]);

  if (!active) return null;
  return <canvas ref={canvasRef} className="slm-rain" aria-hidden="true" />;
}

/* ─────────────────────────── 건물 실루엣 ─────────────────────────── */

function TowerArt({ kind }: { kind: TowerConfig["kind"] }) {
  const win = `slm-win-${kind}`;
  const face = `slm-face-${kind}`;
  const box =
    kind === "lotte" ? "0 0 94 300" : kind === "lct" ? "0 0 150 300" : "0 0 120 300";
  return (
    <svg className="slm-art" viewBox={box} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id={win} width="9" height="12" patternUnits="userSpaceOnUse">
          <rect x="2" y="3" width="5" height="5" rx="1" fill="var(--slm-window)" />
        </pattern>
        <linearGradient id={face} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--slm-face-dark)" />
          <stop offset="0.38" stopColor="var(--slm-face-lit)" />
          <stop offset="0.66" stopColor="var(--slm-face-mid)" />
          <stop offset="1" stopColor="var(--slm-face-dark)" />
        </linearGradient>
      </defs>

      {kind === "sixtythree" ? (
        <g>
          <path className="slm-shape" d="M34 300 L38 82 L82 52 L86 300 Z" fill={`url(#${face})`} />
          <path d="M34 300 L38 82 L82 52 L86 300 Z" fill={`url(#${win})`} opacity="0.9" />
          <path className="slm-edge" d="M38 82 L82 52" />
          <rect x="79" y="24" width="3" height="30" fill="var(--slm-accent)" />
          <circle className="slm-beacon" cx="80" cy="22" r="4" />
          <rect className="slm-podium" x="18" y="286" width="84" height="14" rx="4" />
        </g>
      ) : null}

      {kind === "lotte" ? (
        <g>
          <path
            className="slm-shape"
            d="M28 300 C33 186 39 96 47 26 C55 96 61 186 66 300 Z"
            fill={`url(#${face})`}
          />
          <path
            d="M28 300 C33 186 39 96 47 26 C55 96 61 186 66 300 Z"
            fill={`url(#${win})`}
            opacity="0.85"
          />
          <path className="slm-edge" d="M47 28 C50 120 56 210 61 294" />
          <rect x="46" y="6" width="2" height="22" fill="var(--slm-accent)" />
          <circle className="slm-beacon" cx="47" cy="6" r="3.6" />
          <rect className="slm-podium" x="12" y="288" width="70" height="12" rx="4" />
        </g>
      ) : null}

      {kind === "lct" ? (
        <g>
          <rect className="slm-shape" x="16" y="112" width="32" height="188" rx="16" fill={`url(#${face})`} />
          <rect className="slm-shape" x="58" y="46" width="34" height="254" rx="17" fill={`url(#${face})`} />
          <rect className="slm-shape" x="102" y="92" width="32" height="208" rx="16" fill={`url(#${face})`} />
          <rect x="16" y="112" width="32" height="188" rx="16" fill={`url(#${win})`} opacity="0.85" />
          <rect x="58" y="46" width="34" height="254" rx="17" fill={`url(#${win})`} opacity="0.85" />
          <rect x="102" y="92" width="32" height="208" rx="16" fill={`url(#${win})`} opacity="0.85" />
          <circle className="slm-beacon" cx="75" cy="42" r="3.6" />
          <rect className="slm-podium" x="8" y="284" width="134" height="16" rx="5" />
        </g>
      ) : null}
    </svg>
  );
}

/* ─────────────────────────── 층 게이지 ─────────────────────────── */

function FloorGauge({ floors }: { floors: number }) {
  return (
    <span className="slm-gauge" aria-hidden="true">
      {Array.from({ length: 10 }, (_, index) => 10 - index).map((floor) => (
        <i
          key={floor}
          className={
            floor === floors && floors > 0
              ? "is-current"
              : floor <= floors
                ? "is-on"
                : ""
          }
        >
          {floor}
        </i>
      ))}
    </span>
  );
}

/* ─────────────────────────── 건물 ─────────────────────────── */

function Tower({
  config,
  state,
  reveal,
  onSelect,
}: {
  config: TowerConfig;
  state: LandmarkSummary["subjects"][LandmarkSubject];
  reveal: boolean;
  onSelect: () => void;
}) {
  const completion = reveal ? state.best : 0;
  return (
    <button
      type="button"
      className={`slm-tower slm-${config.kind} side-${config.side} gauge-${config.gauge}`}
      onClick={onSelect}
      style={
        {
          ...place(config.x, config.y),
          "--completion": `${completion}%`,
          "--height": `${config.height}%`,
          "--aspect": config.aspect,
        } as CSSProperties
      }
      aria-label={`${config.subject} ${config.place}, 백분위 ${state.best}, ${state.floors}층 완성. 자세히 보기`}
    >
      <span className="slm-tower-body">
        <span className="slm-tower-reveal">
          <TowerArt kind={config.kind} />
        </span>
      </span>
      <FloorGauge floors={reveal ? state.floors : 0} />
      <span className="slm-pin" />
      <span className="slm-tower-badge">
        <b>{state.attempts ? `${state.floors}층` : "대기"}</b>
        <small>{config.subject}</small>
      </span>
    </button>
  );
}

/* ─────────────────────────── 본체 ─────────────────────────── */

export default function SosLandmarkMap({ data, studentName, onSelect }: Props) {
  const [reveal, setReveal] = useState(false);
  const [intro, setIntro] = useState(false);

  const weather: Weather =
    data.recentCondition >= 70
      ? "clear"
      : data.recentCondition >= 45
        ? "cloudy"
        : "rain";

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const seen = window.sessionStorage.getItem("sos-landmark-intro") === "1";
    if (reduce || seen) {
      setReveal(true);
      return;
    }
    setIntro(true);
    window.sessionStorage.setItem("sos-landmark-intro", "1");
    const riseTimer = window.setTimeout(() => setReveal(true), 950);
    const endTimer = window.setTimeout(() => setIntro(false), 2600);
    return () => {
      clearTimeout(riseTimer);
      clearTimeout(endTimer);
    };
  }, []);

  const replay = () => {
    setReveal(false);
    setIntro(true);
    window.setTimeout(() => setReveal(true), 700);
    window.setTimeout(() => setIntro(false), 2200);
  };

  const skip = () => {
    setIntro(false);
    setReveal(true);
  };

  /** 도시 불빛: 완성도가 오를수록 더 많이 켜집니다. 값은 고정 시드로 계산합니다. */
  const lights = useMemo(() => {
    let seed = 20260803;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const dots: { x: number; y: number; r: number; delay: number }[] = [];
    for (const cluster of LIGHT_CLUSTERS) {
      const count = Math.round(cluster.w * (0.45 + data.cityLevel * 0.2));
      for (let i = 0; i < count; i += 1) {
        const angle = random() * Math.PI * 2;
        const radius = Math.sqrt(random()) * cluster.r;
        dots.push({
          x: cluster.x + Math.cos(angle) * radius,
          y: cluster.y + Math.sin(angle) * radius,
          r: 1.6 + random() * 2.6,
          delay: random() * 3,
        });
      }
    }
    return dots;
  }, [data.cityLevel]);

  return (
    <section
      className={`slm weather-${weather} city-${data.cityLevel} ${reveal ? "is-lit" : ""}`}
    >
      <div className="slm-sky" aria-hidden="true">
        <span className="slm-cloud cloud-a" />
        <span className="slm-cloud cloud-b" />
        <span className="slm-cloud cloud-c" />
      </div>

      <header className="slm-head">
        <div className="slm-head-title">
          <small>MATHPOOH · SCORE OPTIMIZATION SYSTEM</small>
          <h1>SOS LANDMARK</h1>
          <p>
            {studentName ? `${studentName} 학생의 ` : ""}실전모의고사 백분위가
            건물을 한 층씩 올립니다.
          </p>
        </div>
        <div className="slm-head-total">
          <span>전체 정복 현황</span>
          <b>
            {data.totalFloors}
            <em>/30층</em>
          </b>
          <small>국토 완성도 {data.overall}%</small>
        </div>
      </header>

      <aside className="slm-legend">
        {LANDMARK_SUBJECTS.map((subject) => {
          const config = TOWERS.find((tower) => tower.subject === subject);
          if (!config) return null;
          return (
            <button
              key={subject}
              type="button"
              className={`slm-legend-row slm-${config.kind}`}
              onClick={() => onSelect(subject)}
            >
              <i />
              <b>{subject}</b>
              <span>{data.subjects[subject].floors} / 10층</span>
            </button>
          );
        })}
      </aside>

      <div className="slm-stage">
        <div className="slm-globe">
          <svg
            className="slm-map"
            viewBox={`0 0 ${MAP_W} ${MAP_H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="대한민국 야간 지도"
          >
            <defs>
              <linearGradient id="slm-land" x1="0" y1="0" x2="0.6" y2="1">
                <stop offset="0" stopColor="#16403f" />
                <stop offset="0.5" stopColor="#0e3138" />
                <stop offset="1" stopColor="#071e28" />
              </linearGradient>
              <linearGradient id="slm-coast" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#5fe0d4" stopOpacity="0.95" />
                <stop offset="1" stopColor="#1d95a4" stopOpacity="0.35" />
              </linearGradient>
              <filter id="slm-drop" x="-40%" y="-40%" width="200%" height="220%">
                <feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="#00121d" floodOpacity="0.9" />
              </filter>
              <filter id="slm-soft">
                <feGaussianBlur stdDeviation="6" />
              </filter>
            </defs>

            <g transform={VIEW_MATRIX}>
              <g filter="url(#slm-drop)">
                <path className="slm-land-glow" d={KOREA_PATH} filter="url(#slm-soft)" />
                <path
                  className="slm-land"
                  d={KOREA_PATH}
                  fill="url(#slm-land)"
                  stroke="url(#slm-coast)"
                  strokeWidth="6"
                  vectorEffect="non-scaling-stroke"
                />
                <ellipse className="slm-land-glow" cx="232" cy="1128" rx="80" ry="34" filter="url(#slm-soft)" />
                <ellipse
                  className="slm-land"
                  cx="232"
                  cy="1128"
                  rx="76"
                  ry="30"
                  fill="url(#slm-land)"
                  stroke="url(#slm-coast)"
                  strokeWidth="5"
                  vectorEffect="non-scaling-stroke"
                />
              </g>

              {/* 산맥: 태백 · 소백 · 노령 · 차령 */}
              <g className="slm-mountains">
                {[
                  "M606 150 C648 226 692 316 714 396 C734 470 736 546 734 620 C732 686 728 730 724 780",
                  "M706 428 C650 480 592 530 540 590 C494 644 470 720 446 792",
                ].map((d, index) => (
                  <g key={`major-${index}`}>
                    <path className="slm-range-shadow" d={d} vectorEffect="non-scaling-stroke" />
                    <path className="slm-range" d={d} vectorEffect="non-scaling-stroke" />
                    <path className="slm-range-crest" d={d} vectorEffect="non-scaling-stroke" />
                  </g>
                ))}
                {[
                  "M470 640 C420 690 360 740 300 800 C276 824 258 846 244 866",
                  "M430 420 C390 448 340 470 292 492 C252 510 214 520 190 528",
                ].map((d, index) => (
                  <g key={`minor-${index}`}>
                    <path className="slm-range-shadow minor" d={d} vectorEffect="non-scaling-stroke" />
                    <path className="slm-range minor" d={d} vectorEffect="non-scaling-stroke" />
                    <path className="slm-range-crest minor" d={d} vectorEffect="non-scaling-stroke" />
                  </g>
                ))}
              </g>

              {/* 강: 한강 · 북한강 · 낙동강 · 금강 · 영산강 · 섬진강 */}
              <g className="slm-rivers">
                {[
                  "M700 402 C620 418 548 424 492 414 C436 404 404 320 348 296 C312 280 232 282 186 276",
                  "M444 214 C428 250 400 272 372 292",
                  "M731 391 C700 450 676 500 668 540 C656 600 648 650 644 674 C640 710 660 760 686 800 C702 826 716 842 726 852",
                  "M392 722 C376 668 368 614 368 566 C346 546 322 540 302 544 C266 552 232 600 208 648",
                  "M276 800 C258 828 232 852 212 868 C186 890 158 908 140 920",
                  "M392 736 C404 780 424 820 446 856",
                ].map((d, index) => (
                  <g key={`river-${index}`}>
                    <path className="slm-river-glow" d={d} vectorEffect="non-scaling-stroke" />
                    <path className="slm-river" d={d} vectorEffect="non-scaling-stroke" />
                  </g>
                ))}
                <ellipse className="slm-lake" cx="452" cy="238" rx="17" ry="7" />
                <ellipse className="slm-lake" cx="486" cy="404" rx="15" ry="6" />
              </g>

              {/* 경부선 · 호남선 */}
              <path
                className="slm-road"
                d="M271 283 C336 402 424 520 560 640 C640 712 704 792 747 851"
                vectorEffect="non-scaling-stroke"
              />
              <path
                className="slm-road minor"
                d="M330 500 C300 600 268 700 242 837"
                vectorEffect="non-scaling-stroke"
              />

              <g className="slm-lights">
                {lights.map((dot, index) => (
                  <circle
                    key={index}
                    cx={dot.x}
                    cy={dot.y}
                    r={dot.r}
                    style={{ animationDelay: `${dot.delay}s` }}
                  />
                ))}
              </g>
            </g>
          </svg>

          {PLACES.map((item) => (
            <span
              key={item.name}
              className={`slm-place place-${item.name}`}
              style={place(item.x, item.y)}
            >
              <i />
              {item.name}
            </span>
          ))}

          {TOWERS.map((config) => (
            <Tower
              key={config.subject}
              config={config}
              state={data.subjects[config.subject]}
              reveal={reveal}
              onSelect={() => onSelect(config.subject)}
            />
          ))}
        </div>
      </div>

      <div className="slm-cardrow">
        {TOWERS.map((config) => (
          <button
            key={config.subject}
            type="button"
            className={`slm-rowcard slm-${config.kind}`}
            onClick={() => onSelect(config.subject)}
          >
            <i />
            <b>{config.subject}</b>
            <span>{config.place}</span>
            <strong>
              {data.subjects[config.subject].attempts
                ? `${data.subjects[config.subject].best} · ${data.subjects[config.subject].floors}층`
                : "착공 대기"}
            </strong>
          </button>
        ))}
      </div>

      <footer className="slm-foot">
        <div className="slm-progress">
          <span style={{ width: `${reveal ? data.overall : 0}%` }} />
        </div>
        <div className="slm-foot-text">
          <b>{CITY_STAGE[data.cityLevel]}</b>
          <span>
            건물 완성도는 과목별 최고 백분위, 날씨는 최근 3회 평균 백분위(
            {data.recentCondition})로 정합니다.
          </span>
        </div>
        <button type="button" className="slm-replay" onClick={replay}>
          처음부터 보기
        </button>
      </footer>

      <RainLayer active={weather === "rain"} />

      {intro ? (
        <div className="slm-intro" onClick={skip}>
          <div className="slm-intro-copy">
            <small>MATHPOOH SOS</small>
            <strong>SOS LANDMARK</strong>
            <p>{studentName ? `${studentName} 학생의 ` : ""}국토에 불을 켭니다</p>
          </div>
          <button type="button" className="slm-intro-skip" onClick={skip}>
            건너뛰기
          </button>
        </div>
      ) : null}

      <div className="slm-vignette" aria-hidden="true" />
    </section>
  );
}
