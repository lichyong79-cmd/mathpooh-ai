# SOS23 최종 문항 자르기 수정

- 상단을 문항번호 바로 위로 축소
- 문항분류/단원명이 위에 붙는 현상 방지
- 위쪽 수식 자동 확장 제거(예외는 수동 보정)
- 하단 탐색 최대선을 본문 영역 93.2%로 제한
- 페이지 하단 가로선과 꼬리말을 문항 잉크에서 제외
- PDF 문항번호 좌표를 이용해 full-width 오판정 문항을 좌/우 열로 복구
- 같은 페이지 같은 열의 다음 문항을 절대 침범하지 않도록 제한

Git:

git add .
git commit -m "fix: finalize AI question crop boundaries"
git push origin main
