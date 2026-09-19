-- Orion Maps: levantamentos pessoais e imagens privadas.
begin;
create table public.surveys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  name text not null check (char_length(name) between 2 and 120),
  location text not null default '' check (char_length(location) <= 200),
  drone text not null default '' check (char_length(drone) <= 100),
  flight_date date,
  notes text not null default '' check (char_length(notes) <= 3000),
  created_at timestamptz not null default now()
);
create index surveys_owner_created_idx on public.surveys(owner_id, created_at desc);
alter table public.surveys enable row level security;
revoke all on public.surveys from anon, authenticated;
grant select, insert on public.surveys to authenticated;
grant update (name, location, drone, flight_date, notes) on public.surveys to authenticated;
create policy surveys_read_own on public.surveys for select to authenticated using ((select auth.uid()) = owner_id);
create policy surveys_create_own on public.surveys for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy surveys_edit_own on public.surveys for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('survey-images', 'survey-images', false, 52428800, array['image/jpeg','image/png'])
on conflict (id) do nothing;
create policy survey_images_read_own on storage.objects for select to authenticated
using (bucket_id = 'survey-images' and (storage.foldername(objects.name))[1] = (select auth.uid())::text
and exists (select 1 from public.surveys s where s.id::text = (storage.foldername(objects.name))[2] and s.owner_id = (select auth.uid())));
create policy survey_images_upload_own on storage.objects for insert to authenticated
with check (bucket_id = 'survey-images' and (storage.foldername(objects.name))[1] = (select auth.uid())::text
and exists (select 1 from public.surveys s where s.id::text = (storage.foldername(objects.name))[2] and s.owner_id = (select auth.uid())));
commit;

