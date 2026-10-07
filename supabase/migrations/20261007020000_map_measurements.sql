create table public.map_measurements (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 survey_id uuid references public.surveys(id) on delete restrict,
 name text not null check (length(btrim(name)) between 1 and 120),
 measurement jsonb not null check (jsonb_typeof(measurement)='object' and octet_length(measurement::text)<=50000),
 metrics jsonb not null check (jsonb_typeof(metrics)='object' and octet_length(metrics::text)<=5000),
 created_at timestamptz not null default now()
);
create index map_measurements_owner_created on public.map_measurements(owner_id,created_at desc);
create index map_measurements_survey on public.map_measurements(survey_id);
alter table public.map_measurements enable row level security;
revoke all on public.map_measurements from anon,authenticated;
grant select,insert on public.map_measurements to authenticated;
create policy map_measurements_read_own on public.map_measurements for select to authenticated using (owner_id=(select auth.uid()));
create policy map_measurements_create_own on public.map_measurements for insert to authenticated with check (owner_id=(select auth.uid()) and (survey_id is null or exists(select 1 from public.surveys s where s.id=map_measurements.survey_id and s.owner_id=(select auth.uid()))));
comment on table public.map_measurements is 'Private immutable horizontal map measurements. Client metrics are informational, not a survey certificate. New saves create new versions.';
