# SOS190 BUILD FIX FINAL
- `canonicalAnalysisStatuses` / `setCanonicalAnalysisStatuses` 선언을 실제 `ProblemsPage` 컴포넌트의 기존 useState 블록 안으로 이동
- 기존 잘못 삽입된 선언은 전부 제거
- 선언은 1개만 존재
- `loadCanonicalAnalysisStatuses()`보다 앞, 같은 `ProblemsPage` 스코프에 위치
