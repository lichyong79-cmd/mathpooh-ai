# SOS37 - AI Visual Bounding Box

기준 파일: 사용자가 업로드한 SOS(29).zip

## 변경
- 별표 기반 자르기 제거
- 문항 홀짝/고정 좌우 단폭/다음 별 추정 제거
- AI가 각 문항의 실제 crop_x, crop_y, crop_width, crop_height를 직접 반환
- 문항번호, 본문, 수식, 보기, 선택지, 표, 그래프, 도형을 한 영역으로 판독
- 이전/다음 문항과 큰 빈 여백은 제외하도록 프롬프트 강화
- 저장되는 crop_engine: AI_VISUAL_BOUNDING_BOX_V1

## 테스트
기존 시험지를 삭제한 뒤 다시 등록하여 전체 AI 분석을 실행하세요.

## 빌드 확인
작업 환경의 npm 사설 레지스트리에서 zod-validation-error@4.0.2 패키지를 404로 받지 못해 npm ci/build는 실행 완료하지 못했습니다. 코드 변경 파일은 src/app/api/analysis/start/route.ts 입니다.
