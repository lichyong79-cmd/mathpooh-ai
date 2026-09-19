/** Printed school-exam stars are a separate scale from SOS grades. */
export const SOURCE_STAR_POLICY = "school-stars-v1";
export const SOURCE_STAR_GRADES: Record<number, number[]> = {1:[1],2:[2,3,4],3:[4,5,6,7,8],4:[7,8]};
export type SourceStars = { status: "present" | "absent" | "uncertain" | "not_applicable"; count: number | null; confidence: number; evidence: string };
export const sourceStarSchema = {
  type:"object", additionalProperties:false,
  required:["status","count","confidence","evidence"],
  properties:{
    status:{type:"string",enum:["present","absent","uncertain","not_applicable"]},
    count:{anyOf:[{type:"integer",minimum:1,maximum:4},{type:"null"}]},
    confidence:{type:"number",minimum:0,maximum:1}, evidence:{type:"string"}
  }
} as const;
export const SOURCE_STAR_PROMPT = `
[내신 기출 원본 별점: 최우선 난도 기준]
문제번호 바로 위/주변의 인쇄된 별 개수를 읽어 source_stars에 기록한다.
내신 기출의 별1=SOS 1(2점), 별2=SOS 2/3/4(3점/어3/쉬4), 별3=SOS 4/5/6/7/8(쉬4 이상 전부: 쉬4/적4/어4/준킬러/킬러), 별4=SOS 7/8(준킬러/킬러). 별3에는 상한이 없으며 킬러도 포함한다.
별점은 난도 범위를 정하며, 그 범위 안의 세부 등급은 실제 풀이로 판정한다. 별3을 3점으로 낮추거나 별4를 어4 이하로 낮추지 않는다.
시험지의 배점(3점/4점), 문제번호, 해설 기호, 장식, 다른 문항의 별은 세지 않는다. 기존 DNA나 저장 난도로 별 개수를 역추정하지 않는다.
status=present는 이 문항의 내신 별점이 직접 보이는 경우만 사용하고 count=1~4, confidence, 시각적 위치 근거 evidence를 기록한다.
문제번호 위 여백이 잘렸거나 별이 흐리거나 다른 문항의 표식인지 애매하면 uncertain/count=null이다. 상단 여백까지 온전히 보이는데 별이 없으면 absent/count=null이다.
수능/모의고사/EBS 등 내신 별점 체계가 아닌 자료는 not_applicable/count=null. 출처나 체계가 불확실하면 uncertain이다.
`;
export function sourceStarGrades(value: unknown): number[] | null {
  const s=value as SourceStars | undefined;
  return s?.status === "present" && Number.isInteger(s.count) && Number(s.confidence)>=0.9 && s.evidence?.trim()
    ? SOURCE_STAR_GRADES[Number(s.count)] ?? null : null;
}
export function sourceStarReview(value: unknown, grade: unknown): string {
  const s=value as SourceStars | undefined;
  if (!s) return "";
  if (s.status === "uncertain" || (s.status === "present" && !sourceStarGrades(s))) return "원본 별점 판독 불확실 · 문제번호 위 영역 검수 필요";
  const grades=sourceStarGrades(s);
  if (grades && !grades.includes(Number(grade))) return `원본 별${s.count} 허용 난도 불일치 · 재판정 필요`;
  return "";
}
