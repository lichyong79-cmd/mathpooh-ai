# SOS24 자동등록 + 검수대기

1. Supabase SQL Editor에서 `supabase-v1.5-auto-review.sql`을 1회 실행합니다.
2. AI 분석 시 신뢰도 95% 이상 문항은 문제은행에 자동등록됩니다.
3. 95% 미만 문항은 `/review` 검수센터에 쌓입니다.
4. 검수센터에서 승인하면 해당 문항만 embedding을 생성해 즉시 등록합니다.
