# SOS16 AI 분석 작업공간

## 적용 순서
1. Supabase SQL Editor에서 `supabase-v1.4-ai-analysis-workspace.sql` 실행
2. 프로젝트를 배포
3. `AI 문제등록` 목록에서 `AI 분석` 클릭
4. `AI 분석 시작`으로 작업 생성

## 이번 버전 범위
- 시험지/해설지 PDF 미리보기
- 분석 Job 생성과 진행 상태 관리
- 새로고침 후 선택 시험지 유지
- 문항별 분석 테이블 기반 생성

실제 PDF 문항 분리는 다음 버전에 연결합니다.

## Git
```bash
git add .
git commit -m "feat: add AI analysis workspace"
git push
```
