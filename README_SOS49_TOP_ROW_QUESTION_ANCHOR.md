# SOS49 - 페이지 최상단 문항번호 앵커 고정

- Crop 엔진 경로는 `resolveQuestionCrop()` 하나만 유지합니다.
- 자동 재자르기는 DB에 후처리된 좌표가 아니라 `ai_result.ai_crop.bounding_box` 원본에서 시작합니다.
- `question_number_y`가 있으면 문항번호 위 0.85%까지만 탐색하여 교재명, 페이지 번호, 머리말, 가로선을 제외합니다.
- 기존 `single-path-v2` 결과는 새 버전(`single-path-v3-top-anchor`)으로 한 번 다시 계산됩니다.
- 수동 저장 문항은 `crop_manual: true`로 고정되어 자동 재자르기에서 흔들리지 않습니다.
