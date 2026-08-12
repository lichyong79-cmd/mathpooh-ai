# SOS208 · 진단/훈련 매칭 고정

SOS207 누적본.

수정:
1. SOS_NO1 소단원 추출 우선순위를 minorUnit → middleUnit → unit → subject 로 수정.
2. 진단 후보는 같은 과목 + 같은 소단원이면 유형 match 점수가 0이어도 제외하지 않음.
3. 진단 3문항은 학생 미터 기준 -0.9 / 현재 / +0.9에 가장 가까운 문항을 우선 선택.
4. 진단 제출 즉시 훈련 10문항 자동 생성 유지.
5. 훈련 10문항은 안정화2(-0.8) / 적정5(현재) / 상향3(+0.7), 난이도 거리 우선 후 유형 유사도로 동률 결정.
6. Problem DNA 소단원은 basic.minor_unit → taxonomy.minor_unit → middle_unit → unit 순 fallback.

DB는 SOS207과 동일하게 v3.1, v3.2 SQL 적용 필요.
