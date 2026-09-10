// 운영 전 8월 연습시험은 보관하되 신규 배정과 학생 시험/성적 목록에서 제외합니다.
// 날짜와 0회차 제목을 함께 확인해 같은 날짜의 다른 정식 시험은 숨기지 않습니다.
const practiceDates = new Set(["2026-08-05", "2026-08-12", "2026-08-19", "2026-08-26"]);
export function isArchivedPracticeExam(exam: { title?: string | null; exam_date?: string | null; examDate?: string | null }) {
  return practiceDates.has(String(exam.exam_date ?? exam.examDate ?? "").slice(0,10)) &&
    /SOS.*0(?:\([123]\))?회차/i.test(String(exam.title ?? "").replace(/\s/g,""));
}
