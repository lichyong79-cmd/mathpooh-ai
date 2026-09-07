# SOS337 - Vercel TypeScript 빌드 수정

- SOS336의 Supabase 조회 결과가 `unknown[]`으로 추론되던 문제 수정
- 회차 ID, 학생 ID, 시험 ID 배열을 모두 `string[]`으로 명시
- `Set` 제네릭을 `Set<string>`으로 고정
- 기능 및 SQL 변경 없음
