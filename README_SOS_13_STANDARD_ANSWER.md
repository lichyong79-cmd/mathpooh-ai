# SOS 13 표준 정답 PDF + 안전 인쇄

## 변경 사항
- 정답지 생성 PDF에 `SOS_META` 숨김 메타데이터 삽입
- 해설지 자동 추출 시 `SOS_META`를 최우선으로 인식
- 기존 해설지 첫 페이지 정답표(1 ③ 2 ② ... 30 50)도 보조 인식
- 표지/정답지 인쇄를 현재 React 화면과 분리된 임시 iframe에서 실행
- 인쇄 취소·완료 후 현재 시험 등록 화면의 state를 초기화하지 않음

## 사용 순서
1. 답을 입력한다.
2. `정답지 자동 생성`을 눌러 PDF로 저장한다.
3. 이 정답지를 해설지 첫 페이지로 합치거나 해설 PDF로 등록한다.
4. 이후 SOS가 숨김 `SOS_META`를 읽어 정답을 자동 등록한다.

## 배포
```bash
npm install
npm run build
git add .
git commit -m "fix: add SOS answer metadata and safe printing"
git push origin main
```
