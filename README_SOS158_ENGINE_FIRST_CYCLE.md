# SOS 158 — SOS 학습운영 1차 엔진

## 반영
- 실전모의고사 제출 이력이 있는 학생만 SOS 운영 대상으로 표시
- 최근 시험 점수, 오답·미응답 수, 취약 단원·유형 표시
- 기존 문제은행 ACTIVE/TRAINING 문항을 사용하여 진단 3문항 생성
- 추가 진단은 기존 진단 문항과 중복 없이 3문항 생성
- 진단 정답 수에 따라 훈련 10문항 난이도 구성 변경
- 세션과 문항을 sos_training_sessions / sos_training_items에 저장

## 배포 전 SQL
Supabase SQL Editor에서 `supabase-v2.9-training-engine.sql`을 1회 실행합니다.

## 문제은행
별도 SOS 전용 저장소를 새로 만들지 않습니다. 기존 문제은행에서 `status=ACTIVE`, `content_role=TRAINING`인 문항을 사용합니다. 매칭 문항이 부족한 취약 단원만 추가 등록하면 됩니다.
