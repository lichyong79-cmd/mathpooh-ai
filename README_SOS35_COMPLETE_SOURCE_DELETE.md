# SOS35 · 시험지 완전 삭제

## 핵심 변경
- 시험지 삭제 전에 해당 시험지의 기존 분석 ID를 조회합니다.
- 문제은행 문항, AI 문항, 분석 작업, 분석 본체를 자식 순서대로 명시 삭제합니다.
- `question-images` 버킷의 문항 크롭 이미지도 삭제합니다.
- `exam-pdf` 버킷의 한글/시험지/해설지 파일도 삭제합니다.
- 마지막에 `source_files`를 삭제합니다.
- 응답과 조회에 `no-store`를 적용해 이전 삭제 결과가 캐시에 남지 않도록 했습니다.
- 과거 DB의 FK 설정을 보강하는 `supabase-v2.1-source-file-cascade-delete.sql`을 추가했습니다.

## 적용 순서
1. 프로젝트 파일을 덮어씁니다.
2. Supabase SQL Editor에서 `supabase-v2.1-source-file-cascade-delete.sql`을 1회 실행합니다.
3. 배포합니다.
4. 기존 시험지를 삭제합니다.
5. 같은 시험지를 별표 PDF로 다시 등록한 뒤 별표 좌표를 확인합니다.
6. 별표 검증 후 AI 끝점 자르기를 다시 확인합니다.
