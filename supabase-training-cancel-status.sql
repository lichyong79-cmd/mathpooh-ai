begin;
alter table public.sos_training_sessions drop constraint if exists sos_training_sessions_status_check;
alter table public.sos_training_sessions add constraint sos_training_sessions_status_check check (status in ('DRAFT','ASSIGNED','IN_PROGRESS','COMPLETED','PASSED','RETRAIN','CANCELLED'));
commit;
