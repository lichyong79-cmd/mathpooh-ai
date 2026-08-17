# SOS247 — 난이도 max_output_tokens fallback

- SOS246의 바로미터 무한대기 방지 포함.
- SOS245의 실패 원인 진단/정확한 40문항 집계 포함.
- 난이도 검증 AI 호출: 1차 medium/5000 → 2차 low/8000 → 3차 low/12000.
- `max_output_tokens`로 reasoning만 남고 최종 JSON이 나오지 않는 문항을 자동 저추론 재시도.
- 3차까지 실패하면 기존 난이도를 유지하고 검증실패로 남김.
- 표본 검증은 DB 난이도를 변경하지 않음.
