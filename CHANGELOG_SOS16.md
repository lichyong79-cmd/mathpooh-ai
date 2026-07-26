# SOS16 변경사항

- AI 분석 관리 메뉴를 실제 작업공간으로 구현
- 등록 시험지에서 `AI 분석` 버튼으로 바로 이동
- 시험지/해설지 PDF 비공개 signed URL 미리보기
- 분석 단계, 상태, 진행률, 문항 수 UI
- 분석 Job 생성 API 및 작업 로그 기반 추가
- 작업 상태 수동 저장 및 F5 선택 상태 유지
- `source_analysis`, `analysis_jobs`, `analysis_questions` 마이그레이션 추가

> 이번 버전은 분석 작업공간과 Job 기반을 완성한 버전입니다. 실제 PDF 문항 이미지 분리는 다음 버전에서 연결합니다.
