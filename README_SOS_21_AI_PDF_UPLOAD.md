# SOS 21 — AI PDF 등록 화면 정리

## 변경 내용
- 기존 훈련 문제은행 CSV/엑셀 일괄등록 화면 삭제
- 메뉴명을 `AI 문제등록`으로 변경
- 시험지명, 출처, PDF 선택, PDF 등록만 남김
- 등록된 PDF 목록과 처리 상태 표시
- 별도 `/problem-bank/ai-upload` 중복 페이지 삭제
- Supabase 추가 패키지 없이 기존 REST 방식 사용

## 최초 1회
Supabase SQL Editor에서 아래 파일을 실행합니다.

`supabase-v1.1-ai-pdf-upload-storage-policy.sql`

## 배포
```bash
git add .
git commit -m "feat: replace bulk problem entry with AI PDF upload"
git push origin main
```
