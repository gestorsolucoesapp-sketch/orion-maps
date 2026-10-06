-- Additive telemetry; existing owner RLS remains in force.
-- This field never substitutes the worker heartbeat or overall progress.
set lock_timeout = '5s';
alter table public.processing_jobs add column activity jsonb not null default '{}'::jsonb;
alter table public.processing_jobs add constraint processing_jobs_activity_object check (jsonb_typeof(activity) = 'object');
comment on column public.processing_jobs.activity is 'Observed NodeODM activity v1: sampled time, files, container resources. Not overall progress or certified product completion.';
