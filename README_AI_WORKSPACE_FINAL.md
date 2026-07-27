# AI 분석 작업장 통합본

기준: SOS(17).zip

## 구현 기능
- 원본 HWP/HWPX/PDF + 시험지 PDF + 해설지 PDF 업로드
- OpenAI PDF 분석 실행
- 시험지 PDF 위 문항 박스 표시
- 박스 드래그 이동 / 우하단 핸들 크기 조절
- 문항 추가 / 삭제
- 문항번호 / 페이지 / 정답 / 유형 / 난이도 / 단원 / 유형명 수정
- 문항별 검수 완료 / 전체 검수 완료
- 승인(APPROVED) 문항만 문제은행 등록
- 입력 및 박스 변경 500ms 디바운스 자동저장

## 주요 경로
- 통합 작업장: /problem-bank/ai-upload
- 작업장 데이터: /api/analysis/source/[id]
- 문항 추가: POST /api/analysis/questions
- 문항 수정/삭제: PATCH, DELETE /api/analysis/questions/[id]

## 환경변수
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
OPENAI_MODEL (선택)

## 빌드 확인
아래 명령을 실행합니다.

npm ci
npm run build

작성 환경에서는 npm 사설 미러가 `503 Service Temporarily Unavailable`을 반복 반환하여 의존성 설치 자체가 완료되지 않았습니다. 따라서 Next.js 빌드 명령은 실행을 시도했으나 `next: not found` 상태에서 중단되었습니다. 패키지 미러 정상화 후 위 두 명령으로 최종 확인하세요.
