-- Additive only: existing surveys, files, jobs and measured rasters remain unchanged.
alter table public.surveys add column if not exists planning_context jsonb;
alter table public.surveys add column if not exists drone_config jsonb;
alter table public.surveys add constraint survey_planning_context_size check (planning_context is null or (jsonb_typeof(planning_context)='object' and octet_length(planning_context::text)<=50000));
alter table public.surveys add constraint survey_drone_config_size check (drone_config is null or (jsonb_typeof(drone_config)='object' and octet_length(drone_config::text)<=16000));
create table public.user_drone_profiles (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 2 and 100),
 profile jsonb not null check (jsonb_typeof(profile)='object' and jsonb_typeof(profile->'camera')='object' and octet_length(profile::text)<=16000),
 created_at timestamptz not null default now(),
 constraint profile_name_matches check (profile->>'name'=name),
 constraint profile_id_matches check (profile->>'id'=id::text)
);
create unique index user_drone_profiles_owner_name on public.user_drone_profiles (owner_id,lower(btrim(name)));
alter table public.user_drone_profiles enable row level security;
revoke all on table public.user_drone_profiles from anon,authenticated;
grant select,insert on table public.user_drone_profiles to authenticated;
create policy drone_profiles_read_own on public.user_drone_profiles for select to authenticated using (owner_id=(select auth.uid()));
create policy drone_profiles_create_own on public.user_drone_profiles for insert to authenticated with check (owner_id=(select auth.uid()));
comment on column public.surveys.planning_context is 'User-drawn horizontal map context; not processed orthophoto or terrain data.';
comment on column public.surveys.drone_config is 'Camera selection snapshot; never authorizes hardware commands.';
notify pgrst,'reload schema';
