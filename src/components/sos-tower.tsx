"use client";

type SosTowerProps = {
  title: string;
  accent: "blue" | "gold" | "green";
  conqueredFloors: number[];
  onOpen: () => void;
};

const FLOORS = Array.from({ length: 10 }, (_, index) => 10 - index);

export default function SosTower({
  title,
  accent,
  conqueredFloors,
  onOpen,
}: SosTowerProps) {
  const conquered = new Set(conqueredFloors);
  const completed = conqueredFloors.length === 10;

  return (
    <button
      type="button"
      className={`tower-card tower-${accent}`}
      onClick={onOpen}
      aria-label={`${title} 타워 상세 보기`}
    >
      <span className="tower-title">{title}</span>

      <span className="tower-stage" aria-hidden="true">
        <span className="tower-shadow" />

        <span className={`tower-building landmark-${accent} ${completed ? "is-complete" : ""}`}>
          <span className="tower-crown">
            <span className="crown-light" />
            <span className="crown-cap" />
            <span className="crown-spire" />
            <span className="crown-fin crown-fin-left" />
            <span className="crown-fin crown-fin-right" />
          </span>

          <span className="tower-wing tower-wing-left" />
          <span className="tower-wing tower-wing-right" />

          <span className="tower-face tower-front">
            {FLOORS.map((floor) => {
              const active = conquered.has(floor);
              return (
                <span
                  key={`front-${floor}`}
                  className={`tower-floor ${active ? "is-on" : "is-off"}`}
                >
                  <b>{floor}</b>
                  <span className="window-row">
                    <i />
                    <i />
                    <i />
                  </span>
                </span>
              );
            })}
          </span>

          <span className="tower-face tower-side">
            {FLOORS.map((floor) => {
              const active = conquered.has(floor);
              return (
                <span
                  key={`side-${floor}`}
                  className={`tower-side-floor ${active ? "is-on" : "is-off"}`}
                >
                  <i />
                  <i />
                </span>
              );
            })}
          </span>

          <span className="tower-base-front" />
          <span className="tower-base-side" />
          <span className="tower-entrance">
            <i />
            <i />
          </span>
        </span>
      </span>

      <span className="tower-progress">
        <strong>{conqueredFloors.length}</strong>
        <em>/ 10</em>
        <small>정복</small>
      </span>

      <style jsx>{`
        .tower-card {
          --accent: #4da3ff;
          --accent-rgb: 77, 163, 255;
          --front-1: #0e2036;
          --front-2: #07111f;
          --side-1: #07101b;
          --side-2: #02070d;
          --lit-1: #fff6b0;
          --lit-2: #ffc93d;
          appearance: none;
          border: 0;
          background: transparent;
          padding: 8px 10px 4px;
          color: #fff;
          cursor: pointer;
          width: 240px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          font: inherit;
          isolation: isolate;
        }

        .tower-gold {
          --accent: #f4c34f;
          --accent-rgb: 244, 195, 79;
          --front-1: #3b3019;
          --front-2: #171208;
          --side-1: #211907;
          --side-2: #080602;
        }

        .tower-green {
          --accent: #54d58a;
          --accent-rgb: 84, 213, 138;
          --front-1: #123626;
          --front-2: #06170f;
          --side-1: #092016;
          --side-2: #020a06;
        }

        .tower-title {
          font-size: 22px;
          font-weight: 900;
          letter-spacing: -0.04em;
          text-shadow: 0 0 18px rgba(var(--accent-rgb), 0.45);
          color: var(--accent);
        }

        .tower-stage {
          width: 220px;
          height: 430px;
          display: block;
          position: relative;
          perspective: 900px;
          perspective-origin: 50% 46%;
        }

        .tower-shadow {
          position: absolute;
          left: 22px;
          right: 12px;
          bottom: 5px;
          height: 34px;
          border-radius: 50%;
          background: radial-gradient(
            ellipse,
            rgba(var(--accent-rgb), 0.3) 0%,
            rgba(0, 0, 0, 0.55) 48%,
            rgba(0, 0, 0, 0) 76%
          );
          filter: blur(7px);
          transform: rotateX(70deg);
          transition: 0.35s ease;
        }

        .tower-building {
          position: absolute;
          left: 50%;
          bottom: 31px;
          width: 136px;
          height: 350px;
          transform-style: preserve-3d;
          transform: translateX(-58%) rotateY(-16deg) rotateX(1deg);
          transition: transform 0.42s cubic-bezier(0.2, 0.8, 0.2, 1),
            filter 0.42s ease;
        }

        .tower-card:hover .tower-building,
        .tower-card:focus-visible .tower-building {
          transform: translateX(-58%) translateY(-8px) rotateY(-8deg)
            rotateX(1deg) scale(1.025);
          filter: drop-shadow(0 18px 28px rgba(var(--accent-rgb), 0.2));
        }

        .tower-card:hover .tower-shadow,
        .tower-card:focus-visible .tower-shadow {
          transform: rotateX(70deg) scale(1.08);
          opacity: 0.86;
        }


        /* 세 건물의 실루엣을 완전히 다르게 만든다. */
        .landmark-blue {
          width: 132px;
          height: 368px;
          transform: translateX(-58%) rotateY(-16deg) rotateX(1deg);
        }

        .landmark-blue .tower-front {
          width: 132px;
          height: 300px;
          clip-path: polygon(45% 0, 55% 0, 76% 22%, 90% 58%, 100% 100%, 0 100%, 10% 58%, 24% 22%);
        }

        .landmark-blue .tower-side {
          left: 132px;
          width: 38px;
          height: 300px;
          clip-path: polygon(0 0, 72% 21%, 100% 100%, 0 100%);
        }

        .landmark-blue .tower-crown {
          left: 14px;
          top: -20px;
          width: 104px;
          height: 86px;
        }

        .landmark-blue .crown-cap {
          left: 28px;
          width: 48px;
          height: 42px;
          clip-path: polygon(46% 0, 54% 0, 100% 100%, 0 100%);
        }

        .landmark-blue .crown-spire {
          height: 54px;
        }

        .landmark-gold {
          width: 148px;
          height: 338px;
          transform: translateX(-58%) rotateY(-14deg) rotateX(1deg);
        }

        .landmark-gold .tower-front {
          width: 148px;
          height: 276px;
          clip-path: polygon(5% 0, 100% 7%, 92% 100%, 0 100%);
          background: linear-gradient(110deg, #5d4514 0%, #9d7726 22%, #3b2b0d 50%, #7a5a18 76%, #241806 100%);
        }

        .landmark-gold .tower-side {
          left: 148px;
          width: 50px;
          height: 276px;
          clip-path: polygon(0 7%, 100% 0, 100% 100%, 0 100%);
        }

        .landmark-gold .tower-crown {
          left: 3px;
          top: 18px;
          width: 145px;
          height: 35px;
        }

        .landmark-gold .crown-cap {
          left: 5px;
          width: 132px;
          height: 20px;
          clip-path: polygon(0 0, 100% 30%, 96% 100%, 0 100%);
        }

        .landmark-gold .crown-spire,
        .landmark-gold .crown-fin {
          display: none;
        }

        .landmark-green {
          width: 126px;
          height: 342px;
          transform: translateX(-56%) rotateY(-18deg) rotateX(1deg);
        }

        .landmark-green .tower-front {
          width: 126px;
          height: 278px;
          clip-path: polygon(18% 5%, 38% 0, 52% 7%, 68% 1%, 88% 7%, 100% 100%, 0 100%);
          background: linear-gradient(180deg, #174d39, #07180f 64%, #031009);
        }

        .landmark-green .tower-side {
          left: 126px;
          width: 46px;
          height: 278px;
          clip-path: polygon(0 7%, 78% 0, 100% 100%, 0 100%);
        }

        .landmark-green .tower-crown {
          left: 0;
          top: 8px;
          width: 126px;
          height: 48px;
        }

        .landmark-green .crown-cap {
          left: 38px;
          width: 48px;
          height: 25px;
          clip-path: polygon(15% 0, 85% 0, 100% 100%, 0 100%);
        }

        .landmark-green .crown-spire {
          height: 26px;
        }

        .crown-fin {
          display: none;
          position: absolute;
          bottom: 0;
          width: 22px;
          height: 34px;
          border: 1px solid rgba(var(--accent-rgb), 0.5);
          background: linear-gradient(180deg, var(--front-1), var(--front-2));
        }

        .landmark-green .crown-fin { display: block; }
        .landmark-green .crown-fin-left { left: 12px; transform: skewY(-12deg); }
        .landmark-green .crown-fin-right { right: 10px; transform: skewY(12deg); }

        .tower-wing {
          display: none;
          position: absolute;
          bottom: 36px;
          width: 34px;
          height: 210px;
          background: linear-gradient(180deg, #103b2b, #04130c);
          border: 1px solid rgba(var(--accent-rgb), 0.35);
          box-shadow: inset 0 0 20px rgba(0,0,0,.45);
        }

        .landmark-green .tower-wing { display: block; }
        .landmark-green .tower-wing-left {
          left: -24px;
          clip-path: polygon(40% 0, 100% 8%, 100% 100%, 0 100%);
          transform: translateZ(10px);
        }
        .landmark-green .tower-wing-right {
          right: -31px;
          clip-path: polygon(0 8%, 60% 0, 100% 100%, 0 100%);
          transform: translateZ(-4px);
        }

        .tower-face {
          position: absolute;
          top: 42px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid rgba(var(--accent-rgb), 0.4);
          box-shadow: inset 0 0 35px rgba(0, 0, 0, 0.52),
            0 0 24px rgba(var(--accent-rgb), 0.12);
        }

        .tower-front {
          left: 0;
          width: 136px;
          height: 282px;
          background: linear-gradient(180deg, var(--front-1), var(--front-2));
          transform: translateZ(22px);
          clip-path: polygon(18% 0, 82% 0, 100% 100%, 0 100%);
          padding: 6px 10px 8px;
        }

        .tower-side {
          left: 136px;
          width: 44px;
          height: 282px;
          background: linear-gradient(180deg, var(--side-1), var(--side-2));
          transform-origin: left center;
          transform: rotateY(90deg) translateZ(22px);
          padding: 6px 5px 8px;
        }

        .tower-floor,
        .tower-side-floor {
          flex: 1;
          min-height: 0;
          position: relative;
          display: flex;
          align-items: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.055);
        }

        .tower-floor b {
          width: 18px;
          color: rgba(255, 255, 255, 0.7);
          font-size: 10px;
          font-weight: 800;
          text-align: center;
        }

        .window-row {
          flex: 1;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 4px;
          padding-right: 2px;
        }

        .window-row i,
        .tower-side-floor i {
          display: block;
          height: 13px;
          border-radius: 2px;
          background: linear-gradient(180deg, #101820, #05090d);
          border: 1px solid rgba(255, 255, 255, 0.055);
          box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.04);
          transition: background 0.35s ease, box-shadow 0.35s ease,
            border-color 0.35s ease;
        }

        .tower-side-floor {
          gap: 3px;
        }

        .tower-side-floor i {
          flex: 1;
          height: 12px;
        }

        .is-on .window-row i,
        .tower-side-floor.is-on i {
          background: linear-gradient(180deg, var(--lit-1), var(--lit-2));
          border-color: rgba(255, 244, 179, 0.9);
          box-shadow: 0 0 7px rgba(255, 211, 82, 0.95),
            0 0 15px rgba(255, 184, 36, 0.42),
            inset 0 0 5px rgba(255, 255, 255, 0.95);
        }

        .tower-crown {
          position: absolute;
          left: 16px;
          top: 0;
          width: 105px;
          height: 60px;
          transform: translateZ(22px);
          z-index: 4;
        }

        .crown-cap {
          position: absolute;
          left: 16px;
          bottom: 0;
          width: 74px;
          height: 28px;
          background: linear-gradient(180deg, var(--front-1), var(--front-2));
          border: 1px solid rgba(var(--accent-rgb), 0.55);
          clip-path: polygon(35% 0, 65% 0, 100% 100%, 0 100%);
          box-shadow: 0 0 18px rgba(var(--accent-rgb), 0.14);
        }

        .crown-spire {
          position: absolute;
          left: 50%;
          top: 0;
          width: 4px;
          height: 34px;
          border-radius: 4px 4px 0 0;
          background: linear-gradient(180deg, #fff, var(--accent));
          transform: translateX(-50%);
          box-shadow: 0 0 10px rgba(var(--accent-rgb), 0.42);
        }

        .crown-light {
          position: absolute;
          left: 50%;
          top: -8px;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          transform: translateX(-50%);
          background: rgba(255, 255, 255, 0.18);
          opacity: 0;
        }

        .is-complete .crown-light {
          opacity: 1;
          background: #fff7a6;
          box-shadow: 0 0 12px #fff7a6, 0 0 30px var(--accent),
            0 0 55px rgba(var(--accent-rgb), 0.75);
          animation: crownPulse 1.8s ease-in-out infinite;
        }

        .tower-base-front {
          position: absolute;
          left: -9px;
          bottom: 8px;
          width: 154px;
          height: 34px;
          transform: translateZ(22px);
          background: linear-gradient(180deg, #17283a, #07111b);
          border: 1px solid rgba(var(--accent-rgb), 0.45);
          clip-path: polygon(8% 0, 92% 0, 100% 100%, 0 100%);
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.5),
            inset 0 0 16px rgba(var(--accent-rgb), 0.08);
        }

        .tower-base-side {
          position: absolute;
          left: 145px;
          bottom: 8px;
          width: 42px;
          height: 34px;
          transform-origin: left center;
          transform: rotateY(90deg) translateZ(22px);
          background: linear-gradient(180deg, #101a25, #03070c);
          border: 1px solid rgba(var(--accent-rgb), 0.28);
        }

        .tower-entrance {
          position: absolute;
          left: 48px;
          bottom: 8px;
          z-index: 5;
          width: 42px;
          height: 27px;
          transform: translateZ(25px);
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2px;
          padding: 4px;
          background: #06101a;
          border: 1px solid rgba(var(--accent-rgb), 0.65);
          box-shadow: 0 0 14px rgba(var(--accent-rgb), 0.18);
        }

        .tower-entrance i {
          display: block;
          background: linear-gradient(180deg, #fff3ad, #e5a92d);
          box-shadow: 0 0 8px rgba(255, 209, 75, 0.68);
        }

        .tower-progress {
          min-width: 116px;
          display: flex;
          align-items: baseline;
          justify-content: center;
          gap: 4px;
          padding: 9px 13px;
          border-radius: 14px;
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.08),
            rgba(255, 255, 255, 0.025)
          );
          border: 1px solid rgba(var(--accent-rgb), 0.28);
          box-shadow: 0 8px 22px rgba(0, 0, 0, 0.2);
        }

        .tower-progress strong {
          color: var(--accent);
          font-size: 25px;
          line-height: 1;
        }

        .tower-progress em {
          font-style: normal;
          color: rgba(255, 255, 255, 0.88);
          font-weight: 800;
          font-size: 17px;
        }

        .tower-progress small {
          margin-left: 4px;
          color: rgba(255, 255, 255, 0.64);
          font-size: 12px;
          font-weight: 700;
        }

        .tower-card:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 5px;
          border-radius: 20px;
        }

        @keyframes crownPulse {
          0%,
          100% {
            transform: translateX(-50%) scale(0.9);
            opacity: 0.72;
          }
          50% {
            transform: translateX(-50%) scale(1.2);
            opacity: 1;
          }
        }

        @media (max-width: 760px) {
          .tower-card {
            width: 205px;
          }

          .tower-stage {
            transform: scale(0.9);
            transform-origin: center top;
            margin-bottom: -42px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .tower-building,
          .tower-shadow,
          .window-row i,
          .tower-side-floor i {
            transition: none;
          }

          .is-complete .crown-light {
            animation: none;
          }
        }
      `}</style>
    </button>
  );
}
