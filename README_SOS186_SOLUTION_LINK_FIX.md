# SOS186 공식 해설 연결 타이밍 수정

- 공식 해설 PDF가 첨부된 경우, 해설 PDF/문항번호 앵커 준비가 끝난 뒤 AI 문항분석 시작
- React state stale closure 방지를 위해 solutionPdfDoc/solutionAnchors ref 사용
- 개별 재분석도 해설 준비를 기다린 뒤 문항별 공식 해설 이미지 materialize
- 해설지가 첨부되어 있는데 문항별 이미지가 아직 없는 경우 '해설 없음' 대신 '공식 해설 추출 확인 필요'로 표시
- 기존 문제/해설 데이터는 삭제하거나 재업로드하지 않음
