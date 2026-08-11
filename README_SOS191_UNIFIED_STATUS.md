# SOS191 상태 표시 완전 통일

- AI 분석 드롭다운이 더 이상 source.workflow_label을 사용하지 않음
- 문제등록 상태 배지도 더 이상 자체 count/status 조합을 사용하지 않음
- 두 화면 모두 `/api/source-files/[id]/analysis-status` 결과만 표시
- 상태 예:
  - 문제은행 등록완료 25/35문항
  - 3단계 분석 · 등록대기 35/35
  - 3단계 분석 · 대기 31 · 보류 4
  - 미분석
- 등록/되돌리기/재분석 후 canonical status map 재조회
