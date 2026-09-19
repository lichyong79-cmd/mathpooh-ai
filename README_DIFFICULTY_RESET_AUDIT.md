# Difficulty audit — 2026-09-19

The operational grades have not been reset or bulk replaced. 470 queued APPLY jobs were held (SKIPPED with `result_payload.audit_hold= difficulty-reset-20260919`; previous status/attempt count retained). Eight already-running jobs finished before deployment. Admin-fixed grades remain protected.

## Findings
- Blind 16-question comparison: 1 higher, 5 lower, 2 same, 8 review-required. This is not a comparison against actual CSAT reference papers.
- The old solver received existing DNA key insights and representative solutions outside shadow mode.
- Retry logic reduced reasoning effort from medium to low after truncated responses.
- The old result format did not require evidence of student entry barriers, curriculum-valid solutions or difficulty boundary decisions.
- AI-judged/verified helpers accepted `graded` records even when review was required. At audit time 309 records were in this combination.
- A source-title EBS killer cap still existed; zero currently active cap flags were found. It is not established as the cause of the whole bank's downward skew.
- Numeric grades and stored difficulty bands can disagree. Historical high bands are not proof of correct high difficulty; no automatic restoration is justified by the band alone.
- Local/cloud-browser access to stored source images was blocked in this environment. Original-image visual verification is incomplete; no claim that all crops or stars were checked.

## Changes
- Shared student-centered rubric for initial analysis and independent regrading; no previous DNA solution/hints in regrading.
- Explicit subject and target number, observed conditions/options, selected option versus numeric answer, and curriculum-valid proof checks.
- Structured student barriers, estimated time range, lower/higher boundary evidence and independent curriculum verification.
- High reasoning throughout retries; shared request deadline; record requested/resolved model and token usage.
- Grade/band/point, answer and evidence checks; preserve operational grade on review.
- Preserve explicit AI proposals; flag conflicts rather than averaging or source-title caps.
- `DIFFICULTY_AUDIT_HOLD=true`: cron handles SHADOW only; manual regrade is preview-only; preview apply and DNA overwrite are blocked; visible audit notice on difficulty page.
- Protected teacher-fixed grades, optimistic concurrency on writes, and dry-run does not mutate cached star metadata.

## Verification
`node scripts/tests/difficulty-assessment.cjs`, `npx tsc --noEmit`, production build with placeholder public Supabase build variables. Mock checks establish invariants, not mathematical grading accuracy.

## Resume gate
Keep the hold until real image-backed trial results have been inspected for correct question/conditions/answers and defensible student difficulty. Then restore held queued records from their saved status, with the approved judge version. Do not force any target number of killer/semi-killer questions. Do not treat the five-question trial as validation of all 7,587 bank questions.

## Live shadow trial
All five jobs completed on 2026-09-19 after deployment. Server configured model was `gpt-5-mini`; trial responses report `gpt-5.4-2026-03-05`, high reasoning, one solve and one judge request each. This trial changes both model and assessment method, so it does not isolate a single causal factor.

| Paper/question | Saved | Previous blind | New proposal |
|---|---|---|---|
| 청운고 수Ⅰ 12 | 3점 | 쉬4 | 3점 (reading uncertainty: review required) |
| 강서고 기말 수Ⅰ 11 | 적4 | 어3 | 쉬4 |
| 단대부고 수Ⅱ 11 | 쉬4 | 어3 | 쉬4 |
| 은광여고 수Ⅱ 16 | 쉬4 | 3점 | 3점 |
| 보인고 수Ⅰ 13 | 적4 | 3점 | 쉬4 |

No operational grade was changed. This is not successful calibration of the whole bank. The Cheongun question's independently read logarithm expressions differ between the two runs despite both matching the saved choice. The new solver also explicitly reports a small/uncertain symbol. The final guard now sends any unresolved solve issue to review rather than treating an answer match as proof of accurate reading. Cached and fresh star evidence are retained separately; conflicting clear evidence cannot be silently overwritten.
