"use client";

type SosTowerProps = {
  title: string;
  accent: "blue" | "gold" | "green";
  conqueredFloors: number[];
  onOpen: () => void;
};

export default function SosTower({
  title,
  accent,
  conqueredFloors,
  onOpen,
}: SosTowerProps) {
  const conquered = new Set(conqueredFloors);

  return (
    <button
      type="button"
      className={`sos-tower sos-tower-${accent}`}
      onClick={onOpen}
      aria-label={`${title} 타워 상세 보기`}
    >
      <div className="sos-tower-roof">
        <i />
        <span />
        <i />
      </div>
      <div className="sos-tower-body">
        {Array.from({ length: 10 }, (_, index) => 10 - index).map((floor) => {
          const active = conquered.has(floor);
          return (
            <div
              key={floor}
              className={`sos-tower-floor ${active ? "is-on" : "is-off"}`}
            >
              <b>{floor}</b>
              <div className="sos-tower-windows" aria-hidden="true">
                <i /><i /><i /><i />
              </div>
            </div>
          );
        })}
      </div>
      <div className="sos-tower-base" />
      <div className="sos-tower-label">
        <strong>{title}</strong>
        <span>{conqueredFloors.length} / 10 정복</span>
      </div>
    </button>
  );
}
