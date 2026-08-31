# SOS323 · MOS 안정 자르기 엔진 복귀

- 기준: mos(20260831-160940) `lib/crop/question-anchors.ts`
- SOS의 최근 SOS321/SOS322 단 판정 보정(`sparse 6%`, `pickBetterColumns`, `2% slack`)을 제거하고 MOS 안정판 앵커/단 분리 로직으로 복귀.
- MOS `app/worksheets/crop/page.tsx`의 v60 원본 crop 영역 확대(`sourcePadLeft`, `sourcePadRight`, `sourcePadTop`)는 SOS에 이식하지 않음.
- 즉, 문항 검출 영역 자체를 별/번호 보호 목적으로 좌우/상단 확장하지 않음.
- SOS의 AI/저장/분석 흐름 및 나머지 파일은 유지.
