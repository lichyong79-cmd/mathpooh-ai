# SOS212 AI 진단 추천문항

이번 버전은 최초 진단 후보를 단순 단원/문자열 매칭으로 최대 10개 채우던 방식을 제거하고, 문제은행 후보의 Problem DNA를 OpenAI가 비교해 관련도가 높은 문항만 최대 10개 추천하도록 변경했습니다.

## 관리자 흐름
1. SOS_NO1 타겟문항 확정
2. 화면에 `AI 연결 중 / AI가 추천문항을 생성 중입니다` 대형 로딩 표시
3. 같은 과목 중심으로 문제은행에서 최대 50개 후보를 1차 필터
4. AI가 타겟문항의 대/중/소단원, 세부주제, 문항유형, 문제유형 태그, 난이도와 각 후보의 Problem DNA를 비교
5. 연관도 60 이상인 문항만 추천순으로 최대 10개 표시
6. 각 카드에 AI 연관도 %, 별점(1~5), 추천 이유, 핵심 DNA 표시
7. 관리자가 정확히 3문항을 선택해 진단 확정

관련성이 부족하면 10개를 억지로 채우지 않습니다.

## 추가 변경
학생 성적 분석 데이터에 majorUnit / middleUnit / minorUnit / detailedTopic / questionType / problemTypes를 보존하여 타겟문항을 AI에 더 구체적으로 전달합니다.

## 환경변수
기존 `OPENAI_API_KEY`를 사용합니다. 모델은 `OPENAI_ANALYSIS_MODEL`, 없으면 `OPENAI_MODEL`, 둘 다 없으면 `gpt-5-mini`를 사용합니다.

## 검증
수정한 TypeScript/TSX 3개 파일은 TypeScript transpile syntax 검사를 통과했습니다. 현재 작업 컨테이너의 node_modules 설치가 불완전하여 `next build` 전체 실행은 불가했습니다.
