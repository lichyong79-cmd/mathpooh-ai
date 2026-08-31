# SOS324 · 녹색 인식박스 전용 수정

기준: SOS323 MOS crop engine restore

## 변경 범위
- `src/app/problem-bank/ai-upload/page.tsx` 의 1단계 문제인식 UI만 수정.
- 실제 자르기 엔진(`src/lib/crop/question-anchors.ts`)은 SOS323 그대로 유지.
- `saveCrop`, `materializeQuestion`, `buildAnchorCrop`, `resolveQuestionCrop` 등 실제 crop 경로는 수정하지 않음.

## 변경 내용
1. 녹색 인식박스와 실제 crop 좌표를 분리.
2. 모든 기존 문항의 녹색 인식영역을 다시 드래그해 수정 가능.
3. 수정값은 `review_result.recognition_rect`에만 저장.
4. 기존 문항 수정 시 `page_no`, `crop_x`, `crop_y`, `crop_width`, `crop_height`, 자른 이미지 파일을 변경하지 않음.
5. 자동 녹색 박스는 PDF 문항번호 anchor 기준으로 표시하고, 수동 수정값이 있으면 이를 최우선 표시.
6. 기존 누락 문항 직접 추가 기능은 유지.

## 안전 원칙
- SOS323에서 정상화된 실제 자르기 결과/엔진은 건드리지 않는다.
