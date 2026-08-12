# SOS219 - Student score source-of-truth fix

## Scope
Only score synchronization path was changed. OMR polling/rendering and SOS diagnosis/training logic were not changed.

## Changes
1. `/api/student/portal` is force-dynamic / revalidate=0 and returns no-store headers.
2. On student initial page load/F5 only, `/api/student/scores` is fetched once in parallel with portal data.
3. Submitted exam attempt fields from `/api/student/scores` overwrite the matching `portal.exams[].attempt` by `exam_id`. This makes `exam_attempts` the final source of truth for displayed scores.
4. No interval/focus/tab polling was added.
5. Admin manual result update now re-selects the exact `attemptId + examId` after UPDATE and verifies that the stored DB score equals the requested score before returning success.

## Verification
- Admin: change Batman score and save. The admin API should only report success if DB re-read matches the requested score.
- Student: press F5 once. Recent score and exam result score should reflect the verified `exam_attempts.score`.
