"use client";

import type { ProblemDNA } from "@/lib/problem-dna";

function labels(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => typeof value === "object" && value ? String((value as any).tag ?? "") : String(value ?? "")).map((value) => value.trim()).filter(Boolean);
}

function Line({ label, values }: { label: string; values: unknown }) {
  const items = labels(values);
  if (!items.length) return null;
  return <div className="shared-dna-line"><b>{label}</b><span>{items.join(" · ")}</span></div>;
}

export function ProblemDnaCard({ dna, questionNo }: { dna: ProblemDNA; questionNo?: number }) {
  const process = (dna.thinking?.process ?? []).map((step) => `${step.stage}: ${step.action}`);
  return <section className="shared-dna-card">
    <header><div><small>{dna.schema_version}</small><strong>{questionNo ?? dna.question_no}번 문항 DNA</strong></div><em>{dna.difficulty?.final_grade || "-"}</em></header>
    <details open><summary>문항분류</summary><div className="shared-dna-body"><Line label="분류" values={[dna.basic?.subject, dna.basic?.grade, dna.basic?.curriculum, dna.basic?.major_unit, dna.basic?.middle_unit, dna.basic?.minor_unit, dna.basic?.detailed_topic]} /><Line label="문항유형" values={[dna.basic?.question_format, ...(dna.basic?.problem_types ?? []), ...(dna.basic?.presentation_types ?? [])]} /></div></details>
    <details><summary>개념 DNA</summary><div className="shared-dna-body"><Line label="핵심" values={dna.concept?.core_concepts} /><Line label="보조" values={dna.concept?.supporting_concepts} /><Line label="선수" values={dna.concept?.prerequisite_concepts} /><Line label="연결" values={dna.concept?.linked_concepts} /><Line label="공식·정리" values={[...(dna.concept?.formulas ?? []), ...(dna.concept?.theorems ?? [])]} /><Line label="적용방식" values={dna.concept?.application_methods} /></div></details>
    <details><summary>사고 DNA</summary><div className="shared-dna-body"><Line label="사고과정" values={process} /><Line label="사고유형" values={dna.thinking?.thinking_types} /><Line label="핵심발상" values={[dna.thinking?.key_insight]} /></div></details>
    <details><summary>풀이 DNA</summary><div className="shared-dna-body"><Line label="주요전략" values={dna.solution?.strategies} /><Line label="대표풀이" values={dna.solution?.representative_solution} /><Line label="최단풀이" values={dna.solution?.shortest_solution} /><Line label="대안풀이" values={dna.solution?.alternative_solutions} /></div></details>
    <details><summary>난이도·능력 DNA</summary><div className="shared-dna-body"><div className="shared-dna-scores"><span>최종 <b>{dna.difficulty?.final_grade}</b></span><span>개념 <b>{dna.difficulty?.concept}</b></span><span>해석 <b>{dna.difficulty?.condition_interpretation}</b></span><span>발상 <b>{dna.difficulty?.insight}</b></span><span>계산 <b>{dna.difficulty?.calculation}</b></span><span>시간 <b>{dna.difficulty?.time_burden}</b></span></div><Line label="요구능력" values={dna.abilities} /><Line label="난이도근거" values={dna.difficulty?.reasons} /></div></details>
    <details><summary>오답·함정 DNA</summary><div className="shared-dna-body"><Line label="예상오류" values={dna.errors} /><Line label="함정요소" values={dna.traps} /><Line label="지도포인트" values={[dna.summary?.teaching_point]} /></div></details>
    <details><summary>활용 DNA</summary><div className="shared-dna-body"><Line label="훈련목적" values={dna.educational_value?.training_objectives} /><Line label="추천수준" values={dna.educational_value?.recommended_student_levels} /><Line label="유사문항" values={dna.educational_value?.similar_question_features} /><Line label="변형포인트" values={dna.educational_value?.mutation_points} /></div></details>
    <footer><b>{dna.summary?.one_line}</b><span>진입점: {dna.summary?.first_entry_point}</span><span>막히기 쉬운 지점: {dna.summary?.common_sticking_point}</span><span>풀이 결정점: {dna.summary?.decisive_solving_point}</span></footer>
    <style jsx>{`.shared-dna-card{display:grid;gap:8px}.shared-dna-card header{display:flex;align-items:center;justify-content:space-between;padding:12px;border-radius:12px;background:#eef1ff}.shared-dna-card header>div{display:grid;gap:2px}.shared-dna-card header small{color:#68749a;font-size:10px}.shared-dna-card header strong{color:#263865}.shared-dna-card header em{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:#5368e8;color:#fff;font-size:20px;font-weight:950;font-style:normal}.shared-dna-card details{border:1px solid #dfe4ee;border-radius:9px;background:#fff;overflow:hidden}.shared-dna-card summary{cursor:pointer;padding:10px 11px;color:#303b54;font-size:12px;font-weight:950}.shared-dna-body{display:grid;gap:8px;padding:0 11px 11px}.shared-dna-line{display:grid;gap:3px}.shared-dna-line b{color:#748096;font-size:10px}.shared-dna-line span{color:#303a4e;font-size:12px;line-height:1.5}.shared-dna-scores{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.shared-dna-scores span{display:flex;justify-content:space-between;padding:7px;border-radius:7px;background:#f0f3f8;color:#69748a;font-size:10px}.shared-dna-scores b{color:#273653}.shared-dna-card footer{display:grid;gap:5px;padding:11px;border-radius:10px;background:#eaf8f1;color:#3f6558;font-size:11px;line-height:1.45}.shared-dna-card footer>b{color:#176d4e;font-size:12px}`}</style>
  </section>;
}
