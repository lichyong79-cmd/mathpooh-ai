# SOS263 — AI 유사문항 최종 렌더러 교체

## 핵심
- 수식 예외처리식 자체 변환 중단.
- 신규 AI 유사문항은 `displayLatex`를 완성 문제 원본으로 생성.
- 학생 화면은 MathJax 3(tex-svg)로 `displayLatex`를 그대로 조판.
- 분수/지수/극한/적분/조각함수/행렬/근호 등은 표준 LaTeX 엔진이 처리.
- 기존 renderBlocks 문항은 삭제하지 않고 직접 MathML DOM으로 크게 표시.
- SVG 캡처/Canvas/PNG 변환 없음 → tainted canvas 문제 없음.
- 3제 굳히기 및 2차 AI 유사훈련 모두 같은 렌더러.
- 오답 화면도 동일 렌더러.
- 학습 상태/바로미터/세션 흐름 변경 없음.
- SQL 없음.

## MathJax
- CDN: jsdelivr MathJax 3 tex-svg.
- 로드 실패 시 기존 renderBlocks/문항 내용 보존 경로가 남아 있음.
