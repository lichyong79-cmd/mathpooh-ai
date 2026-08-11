# SOS187 공식 해설 연결 판정 정상화

- 실제 `official_solution_image_path`가 있으면 과거 AI의 `connected=false`보다 우선하여 해설 연결됨으로 판정
- 해설 PDF가 첨부된 경우 문항별 해설 이미지/앵커 준비 후 AI 분석 시작
- React stale state 방지를 위해 solution PDF/anchor ref 사용
- 해설지는 있으나 문항별 추출 전이면 `공식 해설 미연결`이 아니라 `공식 해설 추출 확인 필요`
- 실제 해설 이미지가 있는데 과거 verification=missing이면 `연결됨 · 재검증 필요`로 표시
- 기존 문제/해설 파일 재업로드 불필요
