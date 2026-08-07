SOS 159 - SOS 학습운영 1차 엔진 패치

이 파일은 전체 프로젝트가 아니라 '실제로 변경되는 파일 3개'만 담은 패치입니다.
기준: SOS_STUDENT_EXPERIENCE_RENEWAL_157_FIX 이후

변경 파일
1) src/app/admin/page.tsx
   - SOS 학습운영 화면
   - 제출 완료 학생만 운영 대상으로 표시
   - 최근 시험/점수/오답+미응답 표시
   - 진단 3문항 / 추가진단 / 훈련 10문항 버튼 유지

2) src/app/api/admin/recommendations/route.ts
   - 최근 실전모의고사 정보와 missedCount 추가
   - 응시 이력이 있는 학생만 반환

3) src/app/exam-updates.css
   - SOS 분석 원본 요약 카드 UI

적용 방법 (권장)
1. 이 ZIP을 임시 폴더에 압축 해제
2. CMD/PowerShell에서 현재 위치를 C:\프로그램_개발\mathpooh-ai 로 이동
3. PowerShell에서 다음 실행:
   powershell -ExecutionPolicy Bypass -File "압축푼폴더\APPLY_159.ps1"
4. 확인:
   git status
5. 변경이 보이면:
   git add .
   git commit -m "159"
   git push

주의
- supabase-v2.9-training-engine.sql 및 training-engine API는 157_FIX 프로젝트에도 이미 존재하므로 이번 패치에서는 중복 복사하지 않습니다.
- git status가 계속 clean이면 APPLY_159.ps1을 프로젝트 루트가 아닌 다른 폴더에서 실행한 것입니다.
