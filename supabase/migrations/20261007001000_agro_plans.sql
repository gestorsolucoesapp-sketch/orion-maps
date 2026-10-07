-- Additive, immutable private planning versions. No changes to processing tables.
set lock_timeout = '5s';
create table public.agro_plans (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  survey_id uuid references public.surveys(id),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  plan jsonb not null check (jsonb_typeof(plan) = 'object' and coalesce(plan->>'schema_version' = '1', false) and octet_length(plan::text) <= 700000),
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  created_at timestamptz not null default now()
);
create index agro_plans_owner_created_idx on public.agro_plans(owner_id, created_at desc);
create index agro_plans_survey_idx on public.agro_plans(survey_id);
alter table public.agro_plans enable row level security;
revoke all on table public.agro_plans from anon, authenticated;
grant select, insert on table public.agro_plans to authenticated;
create policy agro_plans_read_own on public.agro_plans for select to authenticated
  using (owner_id = (select auth.uid()));
create policy agro_plans_insert_own on public.agro_plans for insert to authenticated
  with check (owner_id = (select auth.uid()) and
    (survey_id is null or exists (select 1 from public.surveys s where s.id = agro_plans.survey_id and s.owner_id = (select auth.uid()))));
comment on table public.agro_plans is 'Private, immutable geometric planting/spraying planning snapshots. Not executable flight missions or agronomic prescriptions.';
