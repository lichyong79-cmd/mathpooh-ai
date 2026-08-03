import type { ReactNode } from "react";

type MATHPOOHLoaderProps = {
  title: string;
  detail?: ReactNode;
  current?: number;
  total?: number;
  compact?: boolean;
  kind?: "analysis" | "crop" | "grading" | "exam" | "save" | "report" | "loading";
  audience?: "student" | "admin";
};

const kindLabel: Record<NonNullable<MATHPOOHLoaderProps["kind"]>, string> = {
  analysis: "AI ANALYSIS",
  crop: "QUESTION CROPPING",
  grading: "SCORE PROCESSING",
  exam: "EXAM PREPARATION",
  save: "SAVING RESULTS",
  report: "REPORT GENERATION",
  loading: "LOADING DATA",
};

export default function MATHPOOHLoader({
  title,
  detail,
  current,
  total,
  compact = false,
  kind = "loading",
  audience = "student",
}: MATHPOOHLoaderProps) {
  const hasProgress = Number.isFinite(current) && Number.isFinite(total) && Number(total) > 0;
  const safeCurrent = hasProgress ? Math.max(0, Math.min(Number(current), Number(total))) : 0;
  const percent = hasProgress ? Math.round((safeCurrent / Number(total)) * 100) : 0;

  return (
    <div className={`mathpooh-loader ${compact ? "is-compact" : ""}`} role="status" aria-live="polite" aria-busy="true">
      <div className="mathpooh-loader-card">
        <div className={`mathpooh-runway is-${audience}`} aria-hidden="true">
          <span className="mathpooh-runner">
            <img
              src={audience === "admin" ? "/characters/mathpooh-director.png" : "/characters/mathpooh-student.png"}
              alt=""
            />
          </span>
          <i className="mathpooh-shadow" />
        </div>
        <small className="mathpooh-kicker">MATHPOOH AI · {kindLabel[kind]}</small>
        <h2>{title}</h2>
        {detail ? <p>{detail}</p> : null}
        {hasProgress ? (
          <>
            <div className="mathpooh-progress-copy">
              <b>{safeCurrent} / {total}</b>
              <span>{percent}% COMPLETE</span>
            </div>
            <div className="mathpooh-progress-track" aria-label={`${percent}% complete`}>
              <i style={{ width: `${percent}%` }} />
            </div>
          </>
        ) : (
          <div className="mathpooh-dots" aria-hidden="true"><i /><i /><i /></div>
        )}
        <strong className="mathpooh-wait">PLEASE WAIT. DO NOT CLOSE THIS WINDOW.</strong>
      </div>
    </div>
  );
}
