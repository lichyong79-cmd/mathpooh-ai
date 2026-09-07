# SOS333 - 신청 API TypeScript 빌드 오류 수정

SOS332 배포 빌드에서 `requested.filter((id: string) => ...)` 부분의 `requested`가 `unknown[]`으로 추론되어 발생한 TypeScript overload 오류를 수정했습니다.

- `selectedCycleIds` 입력을 `(id: unknown) => String(id)`로 명시 변환
- `Set<string>` 및 `requested: string[]` 타입 명시
- 신청/회차/결제 동작 로직은 변경하지 않음
- 자르기 엔진 변경 없음
- 추가 SQL 없음 (SOS332 SQL을 이미 실행했다면 그대로 사용)

Frozen crop SHA256:
`d1647af638899a4c1895c28c7a2e89d03c92d30965a334d8ffb56cdf13718029`

이 소스 묶음에는 `node_modules`가 없어 이 환경에서는 `next build`를 실행할 수 없습니다.
