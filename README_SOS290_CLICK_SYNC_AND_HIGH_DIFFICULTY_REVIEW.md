# SOS290
- 문제은행 좌측 문항 클릭 후 우측 이미지가 이전 문항으로 되돌아가는 비동기 race condition 수정
- 선택 변경 시 이전 문제/해설 이미지 요청 AbortController 취소
- 난이도 필터에 `적4 이상 · 검토용` 추가 (적4/어4/준킬러/킬러)
- SOS289 검색 개선 유지

검증 참고: 현재 전달본에는 node_modules가 포함되어 있지 않아 이 실행환경에서 Next build를 직접 수행할 수 없었음(next: not found).
