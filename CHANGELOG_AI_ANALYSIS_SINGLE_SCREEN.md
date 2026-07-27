# AI 분석관리 단일 화면 통합

- 기존 관리자 내부 `AnalysisPage`와 `/problem-bank/ai-upload` 작업장이 동시에 노출되던 경로 충돌 수정
- 사이드바 `AI 분석 관리` 클릭 시 항상 `/problem-bank/ai-upload`로 이동
- `AI 문제등록` 목록의 `AI 분석` 버튼도 같은 작업장으로 이동
- 과거 localStorage에 `analysis` 탭이 저장돼 있어도 새 작업장으로 자동 이동
- 실전모의고사 화면과 데이터는 변경하지 않음
