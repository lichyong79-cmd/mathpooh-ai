"use client";

type SosTowerProps = {
  title: string;
  accent: "blue" | "gold" | "green";
  conqueredFloors: number[];
  onOpen: () => void;
};

const FLOOR_NUMBERS = Array.from({ length: 10 }, (_, index) => 10 - index);

const ACCENT = {
  blue: {
    label: "대수",
    glow: "#59a8ff",
    glowSoft: "rgba(89, 168, 255, 0.34)",
    bodyTop: "#183a66",
    bodyBottom: "#071a31",
    edge: "#67b2ff",
    windowOn: "#bfe4ff",
  },
  gold: {
    label: "미적분1",
    glow: "#ffd46b",
    glowSoft: "rgba(255, 212, 107, 0.36)",
    bodyTop: "#735014",
    bodyBottom: "#241805",
    edge: "#ffe08a",
    windowOn: "#fff0ad",
  },
  green: {
    label: "확률과통계",
    glow: "#66e0b3",
    glowSoft: "rgba(102, 224, 179, 0.34)",
    bodyTop: "#19594c",
    bodyBottom: "#071f1a",
    edge: "#77e9bf",
    windowOn: "#bfffe8",
  },
} as const;

export default function SosTower({
  title,
  accent,
  conqueredFloors,
  onOpen,
}: SosTowerProps) {
  const conquered = new Set(conqueredFloors);
  const theme = ACCENT[accent];
  const completed = conqueredFloors.length === 10;

  return (
    <button
      type="button"
      className={`landmark-card landmark-card-${accent}`}
      onClick={onOpen}
      aria-label={`${title} 타워 상세 보기`}
    >
      <div className="landmark-stage" aria-hidden="true">
        <div className="sky-glow" />
        <div className="ground-shadow" />

        {accent === "blue" && (
          <svg className="tower-svg" viewBox="0 0 240 420" role="img">
            <defs>
              <linearGradient id="blueBody" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor={theme.bodyTop} />
                <stop offset="1" stopColor={theme.bodyBottom} />
              </linearGradient>
              <filter id="blueGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="7" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <path
              d="M120 14 L132 54 L153 99 L165 161 L177 232 L190 360 L50 360 L63 232 L75 161 L87 99 L108 54 Z"
              fill="url(#blueBody)"
              stroke={theme.edge}
              strokeWidth="2"
            />
            <path d="M120 14 L120 360" stroke="rgba(255,255,255,.22)" strokeWidth="2" />
            <path d="M86 101 L154 101" stroke="rgba(255,255,255,.12)" />
            <path d="M73 164 L167 164" stroke="rgba(255,255,255,.12)" />
            <path d="M61 234 L179 234" stroke="rgba(255,255,255,.12)" />

            {FLOOR_NUMBERS.map((floor, index) => {
              const y = 326 - index * 27;
              const active = conquered.has(floor);
              const halfWidth = 50 - index * 2.7;
              return (
                <g key={floor}>
                  <rect
                    x={120 - halfWidth}
                    y={y}
                    width={halfWidth * 2}
                    height="14"
                    rx="3"
                    fill={active ? theme.windowOn : "#0a1725"}
                    opacity={active ? 1 : 0.82}
                    filter={active ? "url(#blueGlow)" : undefined}
                  />
                  <text x="36" y={y + 11} className="floor-number">
                    {floor}
                  </text>
                </g>
              );
            })}

            {completed && (
              <g filter="url(#blueGlow)">
                <circle cx="120" cy="18" r="7" fill={theme.windowOn} />
                <path d="M104 3 L120 -8 L136 3" fill="none" stroke={theme.windowOn} strokeWidth="4" />
              </g>
            )}
          </svg>
        )}

        {accent === "gold" && (
          <svg className="tower-svg" viewBox="0 0 240 420" role="img">
            <defs>
              <linearGradient id="goldBody" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor={theme.bodyTop} />
                <stop offset="1" stopColor={theme.bodyBottom} />
              </linearGradient>
              <filter id="goldGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="7" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <path
              d="M72 54 L150 22 L184 360 L42 360 Z"
              fill="url(#goldBody)"
              stroke={theme.edge}
              strokeWidth="2"
            />
            <path d="M72 54 L151 22" stroke="rgba(255,255,255,.35)" strokeWidth="3" />
            <path d="M73 54 L44 360" stroke="rgba(255,255,255,.16)" strokeWidth="2" />
            <path d="M151 22 L183 360" stroke="rgba(255,255,255,.16)" strokeWidth="2" />

            {FLOOR_NUMBERS.map((floor, index) => {
              const y = 326 - index * 28;
              const active = conquered.has(floor);
              const left = 60 + index * 1.6;
              const right = 168 - index * 1.6;
              return (
                <g key={floor}>
                  <rect
                    x={left}
                    y={y}
                    width={right - left}
                    height="14"
                    rx="2"
                    fill={active ? theme.windowOn : "#1e1709"}
                    opacity={active ? 1 : 0.86}
                    filter={active ? "url(#goldGlow)" : undefined}
                  />
                  <text x="25" y={y + 11} className="floor-number">
                    {floor}
                  </text>
                </g>
              );
            })}

            {completed && (
              <g filter="url(#goldGlow)">
                <circle cx="151" cy="18" r="7" fill={theme.windowOn} />
                <path d="M136 5 L151 -7 L166 5" fill="none" stroke={theme.windowOn} strokeWidth="4" />
              </g>
            )}
          </svg>
        )}

        {accent === "green" && (
          <svg className="tower-svg" viewBox="0 0 240 420" role="img">
            <defs>
              <linearGradient id="greenBody" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor={theme.bodyTop} />
                <stop offset="1" stopColor={theme.bodyBottom} />
              </linearGradient>
              <filter id="greenGlow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="7" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <path d="M55 113 L99 70 L108 360 L34 360 Z" fill="url(#greenBody)" stroke={theme.edge} strokeWidth="2" />
            <path d="M107 74 L143 34 L158 360 L100 360 Z" fill="url(#greenBody)" stroke={theme.edge} strokeWidth="2" />
            <path d="M156 117 L189 84 L207 360 L151 360 Z" fill="url(#greenBody)" stroke={theme.edge} strokeWidth="2" />
            <path d="M100 360 L108 74" stroke="rgba(255,255,255,.2)" />
            <path d="M151 360 L157 117" stroke="rgba(255,255,255,.2)" />

            {FLOOR_NUMBERS.map((floor, index) => {
              const y = 326 - index * 27;
              const active = conquered.has(floor);
              return (
                <g key={floor}>
                  <rect
                    x="48"
                    y={y}
                    width="144"
                    height="13"
                    rx="3"
                    fill={active ? theme.windowOn : "#071813"}
                    opacity={active ? 1 : 0.86}
                    filter={active ? "url(#greenGlow)" : undefined}
                  />
                  <path d={`M103 ${y} L103 ${y + 13} M151 ${y} L151 ${y + 13}`} stroke="rgba(4,31,24,.6)" />
                  <text x="18" y={y + 11} className="floor-number">
                    {floor}
                  </text>
                </g>
              );
            })}

            {completed && (
              <g filter="url(#greenGlow)">
                <circle cx="143" cy="30" r="7" fill={theme.windowOn} />
                <path d="M128 17 L143 5 L158 17" fill="none" stroke={theme.windowOn} strokeWidth="4" />
              </g>
            )}
          </svg>
        )}
      </div>

      <div className="landmark-label">
        <strong>{title || theme.label}</strong>
        <span>{conqueredFloors.length} / 10 정복</span>
      </div>

      <div className="landmark-progress" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => {
          const floor = index + 1;
          return <i key={floor} className={conquered.has(floor) ? "is-on" : "is-off"} />;
        })}
      </div>

      <style jsx>{`
        .landmark-card {
          --accent: ${theme.glow};
          --accent-soft: ${theme.glowSoft};
          position: relative;
          width: min(100%, 250px);
          min-width: 210px;
          padding: 0;
          border: 0;
          background: transparent;
          color: #fff;
          cursor: pointer;
          text-align: center;
          transition: transform 220ms ease, filter 220ms ease;
        }

        .landmark-card:hover {
          transform: translateY(-7px) scale(1.02);
          filter: brightness(1.08);
        }

        .landmark-card:focus-visible {
          outline: 3px solid var(--accent);
          outline-offset: 8px;
          border-radius: 20px;
        }

        .landmark-stage {
          position: relative;
          height: 365px;
          border-radius: 24px 24px 16px 16px;
          overflow: hidden;
          background:
            radial-gradient(circle at 50% 70%, var(--accent-soft), transparent 38%),
            linear-gradient(180deg, #0b1830 0%, #071120 54%, #02060d 100%);
          box-shadow:
            inset 0 0 0 1px rgba(255, 255, 255, 0.07),
            0 22px 45px rgba(0, 0, 0, 0.45),
            0 0 35px var(--accent-soft);
        }

        .landmark-stage::before,
        .landmark-stage::after {
          content: "";
          position: absolute;
          bottom: 0;
          height: 65px;
          width: 52%;
          opacity: 0.28;
          background:
            linear-gradient(90deg, transparent 0 6%, #142238 6% 17%, transparent 17% 24%, #101d31 24% 39%, transparent 39% 45%, #172943 45% 62%, transparent 62% 69%, #0e1a2b 69% 84%, transparent 84%);
        }

        .landmark-stage::before { left: 0; }
        .landmark-stage::after { right: 0; transform: scaleX(-1); }

        .sky-glow {
          position: absolute;
          inset: 18% 18% 3%;
          border-radius: 50%;
          background: radial-gradient(circle, var(--accent-soft), transparent 67%);
          filter: blur(18px);
        }

        .ground-shadow {
          position: absolute;
          left: 16%;
          right: 16%;
          bottom: 8px;
          height: 24px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.78);
          filter: blur(8px);
        }

        .tower-svg {
          position: absolute;
          left: 50%;
          bottom: 0;
          width: 94%;
          height: 96%;
          transform: translateX(-50%);
          overflow: visible;
          filter: drop-shadow(0 12px 15px rgba(0, 0, 0, 0.62));
        }

        .tower-svg :global(.floor-number) {
          fill: rgba(255, 255, 255, 0.56);
          font-size: 11px;
          font-weight: 800;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .landmark-label {
          display: grid;
          gap: 4px;
          margin-top: 17px;
        }

        .landmark-label strong {
          font-size: 21px;
          font-weight: 900;
          letter-spacing: -0.03em;
        }

        .landmark-label span {
          color: var(--accent);
          font-size: 15px;
          font-weight: 800;
        }

        .landmark-progress {
          display: grid;
          grid-template-columns: repeat(10, minmax(0, 1fr));
          gap: 4px;
          margin: 13px auto 0;
          width: 86%;
        }

        .landmark-progress i {
          height: 4px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.13);
        }

        .landmark-progress i.is-on {
          background: var(--accent);
          box-shadow: 0 0 9px var(--accent);
        }

        @media (max-width: 720px) {
          .landmark-card {
            width: 100%;
            min-width: 0;
            max-width: 270px;
          }

          .landmark-stage {
            height: 330px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .landmark-card {
            transition: none;
          }
        }
      `}</style>
    </button>
  );
}
