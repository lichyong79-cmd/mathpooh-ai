import type { ReactNode } from "react";

type MathPoohLoaderProps = {
  title: string;
  detail?: ReactNode;
  current?: number;
  total?: number;
  compact?: boolean;
  kind?: "analysis" | "crop" | "grading" | "exam" | "save" | "report" | "loading";
};

const kindLabel: Record<NonNullable<MathPoohLoaderProps["kind"]>, string> = {
  analysis: "문제를 살펴보는 중",
  crop: "문항을 정리하는 중",
  grading: "성적을 계산하는 중",
  exam: "시험을 준비하는 중",
  save: "안전하게 저장하는 중",
  report: "리포트를 만드는 중",
  loading: "자료를 불러오는 중",
};

export default function MathPoohLoader({
  title,
  detail,
  current,
  total,
  compact = false,
  kind = "loading",
}: MathPoohLoaderProps) {
  const hasProgress = Number.isFinite(current) && Number.isFinite(total) && Number(total) > 0;
  const safeCurrent = hasProgress ? Math.max(0, Math.min(Number(current), Number(total))) : 0;
  const percent = hasProgress ? Math.round((safeCurrent / Number(total)) * 100) : 0;

  return (
    <div className={`mathpooh-loader ${compact ? "is-compact" : ""}`} role="status" aria-live="polite" aria-busy="true">
      <div className="mathpooh-loader-card">
        <div className="mathpooh-runway" aria-hidden="true">
          <span className="mathpooh-runner">🐻</span>
          <i className="mathpooh-shadow" />
        </div>
        <small className="mathpooh-kicker">MATSPU SOS · {kindLabel[kind]}</small>
        <h2>{title}</h2>
        {detail ? <p>{detail}</p> : null}
        {hasProgress ? (
          <>
            <div className="mathpooh-progress-copy">
              <b>{safeCurrent} / {total}</b>
              <span>{percent}% 완료</span>
            </div>
            <div className="mathpooh-progress-track" aria-label={`${percent}% 완료`}>
              <i style={{ width: `${percent}%` }} />
            </div>
          </>
        ) : (
          <div className="mathpooh-dots" aria-hidden="true"><i /><i /><i /></div>
        )}
        <strong className="mathpooh-wait">화면을 닫거나 조작하지 말고 잠시 기다려 주세요.</strong>
      </div>
    </div>
  );
}
