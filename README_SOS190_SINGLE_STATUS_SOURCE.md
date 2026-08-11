# SOS190 상태 단일화
- AI분석의 analysis_questions.status + review_result.bank_status가 유일한 상태 원본
- 문제등록 화면은 자체 판정 금지
- 문제등록 화면은 /api/source-files/[id]/analysis-status 반환값만 표시
- AI분석에서 등록완료→등록대기로 되돌리면 문제등록도 같은 상태를 표시
