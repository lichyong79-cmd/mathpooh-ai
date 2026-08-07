SOS 161 - 문제은행 유지보수 패치

적용 파일
- src/app/admin/page.tsx
- src/app/globals.css
- src/app/problem-bank/page.tsx
- src/app/api/source-files/[id]/replace/route.ts
- src/app/api/problem-bank/questions/[id]/replace-image/route.ts

추가 기능
1. 문제등록 > 수정
   - 원본 HWP/HWPX/PDF만 교체
   - 문제 PDF만 교체
   - 해설 PDF만 교체
   - 기존 source_files ID 유지
   - 기존 problem_bank_questions 연결 유지
   - 문제은행 등록 문항이 있는 시험지는 '문항별 교체' 바로가기 표시

2. 문제은행
   - /problem-bank?source=<source_file_id> 로 진입하면 해당 시험지 필터 자동 선택
   - 선택한 문항의 '이 문항만 교체' 기능
   - PNG/JPG/WEBP/PDF 업로드 가능
   - problem_bank_questions.id 유지
   - question_image_path만 교체

주의
- 문항 하나의 '해설 이미지만 교체'는 현재 DB에 독립 solution_image_path 컬럼이 없어 이번 패치에서 억지로 추가하지 않았습니다.
- 해설 PDF 전체 교체는 지원합니다. 문항별 해설 교체는 기존 해설 Crop 저장 구조를 확인한 뒤 다음 패치로 연결하는 것이 안전합니다.
- 추가 SQL 없음.
