# SOS210 · 학생 진단 집중 응시 흐름

## 적용 범위
학생 진단(DIAGNOSIS) 화면만 1문항 집중 방식으로 변경. 훈련(TRAINING) 기존 화면/제출 흐름은 유지.

## 학생 문항 흐름
1. 진단 시작 전 안내: 사진 촬영 기기 준비, 풀이사진 필수, 화면 이탈 기록 안내
2. 각 문항 진입 시 문제를 숨기고 10초 카운트다운
3. 카운트다운 종료 후 문제 공개 및 풀이시간 시작
4. 답 입력 후 `답안 확정` 클릭 시 풀이시간 종료 및 답 수정 잠금
5. 즉시 `풀이 사진을 제출해 주세요` 화면으로 전환
6. 답 확정~사진 업로드 완료까지 별도 초 단위 측정
7. 사진 제출 완료 후 다음 문항의 10초 카운트다운
8. 마지막 문항 사진 제출 완료 시 진단 자동 최종 제출/채점

## 신뢰도 로그
문제가 공개되고 답안을 확정하기 전(실제 풀이 중)에 브라우저가 hidden 상태가 되면 SCREEN_EXIT 저장.
복귀하면 SCREEN_RETURN 및 이탈 지속시간을 저장하고 강한 경고 모달 표시.
사진 업로드 단계는 정상 촬영/파일선택 과정이므로 화면이탈로 기록하지 않음.

## DB/Storage
배포 전 `supabase-v3.3-sos-diagnosis-evidence.sql` 실행 필요.
Private Storage bucket `sos-solution-photos` 생성 포함.

## 주요 파일
- `src/components/sos-diagnosis-runner.tsx`
- `src/app/api/student/sos-training/route.ts`
- `src/app/api/student/sos-training/photo/route.ts`
- `src/app/page.tsx`
- `src/app/student.css`
- `supabase-v3.3-sos-diagnosis-evidence.sql`
