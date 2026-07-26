# SOS 14 수정사항

## 빠른정답 자동 추출
- 해설지 마지막 페이지부터 역순으로 최대 3페이지만 검사
- `빠른정답`, `빠른 정답`, `정답표` 제목이 있는 페이지만 분석
- 표준 형식 `1. ③` ~ `30. 50` 인식
- SOS 한글 수식 글꼴의 private-use 숫자(22~30번) 변환 추가
- 30개를 완전히 읽지 못하면 기존 수동 입력값을 지우지 않고 빈 칸만 병합
- 해설 본문 숫자는 더 이상 정답으로 읽지 않음

## 표지 미리보기 멈춤 수정
- 숨은 iframe에서 자동으로 `window.print()`를 호출하던 방식 제거
- 현재 등록화면과 독립된 새 탭에 미리보기 표시
- 새 탭 상단의 `인쇄`, `닫기` 버튼으로만 처리
- 인쇄 취소/완료/닫기 후에도 원래 등록화면 state와 버튼 유지

## 적용
```bash
npm install
npm run build
git add .
git commit -m "fix: read last-page quick answers and isolate cover preview"
git push origin main
```
