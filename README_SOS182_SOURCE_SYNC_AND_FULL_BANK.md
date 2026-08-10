# SOS 182 · 문제은행 전체 로딩 + 시험지 정보 강제 동기화

- 문제은행 화면의 PostgREST 1,000행 제한 제거: 1,000행씩 페이지네이션하여 전체 문항 로딩
- 시험지 목록에서 시험지명/출처/학년/과목 수정 시 연결된 problem_bank_questions 전체 즉시 동기화
- 문제은행 과목별 분포와 필터에 쓰이는 grade/subject/source_name을 bulk UPDATE
- 각 문항 title과 problem_dna.basic.grade/subject까지 동기화
- source_analysis에 연결된 analysis_questions ai_result/review_result도 페이지네이션하여 전체 동기화
- 저장 성공 메시지에 문제은행/AI분석 동기화 문항 수 표시
