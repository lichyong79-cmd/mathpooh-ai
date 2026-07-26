# SOS v0.8 — 3종 파일 등록 + 정답지 자동 생성

## 적용 전 Supabase
SQL Editor에서 `supabase-v0.8-exam-original-answer-keys.sql`을 1회 실행합니다.

## 이번 버전
- 한글 통합본(HWP/HWPX) + 시험지 PDF + 해설지 PDF 등록
- 세 파일 모두 Supabase Storage `exam-files` 버킷에 저장
- 시험 목록에서 한글/시험지/해설지 등록 여부 확인
- 해설지 PDF 텍스트에서 정답 자동 추출 초안
- 객관식/단답형 정답 수정 및 DB 저장
- SOS 표준 정답지 인쇄/PDF 저장

## 주의
해설지 자동 추출은 PDF 내부 텍스트 구조에 따라 일부 정답이 비거나 잘못 잡힐 수 있습니다. 자동 추출 후 빈칸과 오인식 항목을 확인하세요.
