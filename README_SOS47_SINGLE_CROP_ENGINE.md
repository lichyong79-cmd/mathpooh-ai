# SOS47 - SINGLE CROP ENGINE

자동 자르기 경로를 하나로 통합했습니다.

## 단일 엔진
`buildCanonicalCrop(pageCanvas, inputRect)`만 자동 자르기를 계산합니다.

적용 대상:
- 현재 문항 빨간 박스
- 우측 미리보기
- 전체 문항 썸네일
- 문항 이미지 저장
- 자동 분석 전 이미지 생성
- 문제은행 저장 좌표

## 처리 순서
1. AI 원본 좌표를 안전 범위로 확장
2. 2단 중앙선을 넘지 않도록 단 경계 고정
3. 실제 텍스트/수식/도형/선택지 경계 탐지
4. 동일 패딩 적용
5. 최종 좌표와 최종 이미지를 같은 결과로 반환

기존 `refineColumnCrop`, `trimToContentBox` 경로는 제거했습니다.
