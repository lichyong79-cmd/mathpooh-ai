# SOS261 · AI 문항 이미지 렌더링 안정화

- SOS260의 `Tainted canvases may not be exported` 오류 제거.
- 원인: `foreignObject SVG -> Canvas -> canvas.toDataURL()` 재수출.
- 수정: Canvas 경로를 완전히 제거하고 조판된 문제지를 단일 SVG image data URL로 표시.
- 학생 화면에서는 텍스트 DOM이 아니라 `<img>` 한 장으로 표시.
- MathML/renderBlocks 구조는 SOS260 그대로 유지.
- 2차 AI 유사훈련 / 3제 굳히기 / 오답 화면 모두 동일 렌더러 사용.
- SQL 없음.
