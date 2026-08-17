# SOS254.2 — build fix

Vercel TypeScript build error fixed:
- firstTraining.goal_meter was missing from the cycle-session select
- firstTraining.baseline_meter was missing from the cycle-session select

Cycle session select now includes id, phase, status, round_no, cycle_kind, parent_session_id, total_count, correct_count, decision, target_snapshot, baseline_meter, goal_meter, created_at.

No SQL. SOS254 cycle-aware recovery logic remains unchanged.
