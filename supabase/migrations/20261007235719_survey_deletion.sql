-- Resumable survey deletion. Physical files are removed through the Storage API
-- before the owning survey is deleted; no Storage metadata is deleted by SQL.
alter table public.surveys
  add column deletion_requested_at timestamptz;

grant update (deletion_requested_at), delete on public.surveys to authenticated;
grant delete on public.agro_plans, public.map_measurements to authenticated;

create policy surveys_delete_pending_own
  on public.surveys for delete to authenticated
  using (owner_id = (select auth.uid()) and deletion_requested_at is not null);

create policy survey_images_delete_pending_own
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'survey-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.surveys s
      where s.id::text = (storage.foldername(objects.name))[2]
        and s.owner_id = (select auth.uid())
        and s.deletion_requested_at is not null
    )
  );

create policy agro_plans_delete_with_survey
  on public.agro_plans for delete to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.surveys s
      where s.id = agro_plans.survey_id and s.owner_id = (select auth.uid())
        and s.deletion_requested_at is not null
    )
  );

create policy map_measurements_delete_with_survey
  on public.map_measurements for delete to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.surveys s
      where s.id = map_measurements.survey_id and s.owner_id = (select auth.uid())
        and s.deletion_requested_at is not null
    )
  );

create function public.guard_survey_deletion()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.deletion_requested_at is not null and new is distinct from old then
      raise exception 'A exclusão deste levantamento já foi iniciada. Conclua a exclusão no painel.';
    end if;
    if new.deletion_requested_at is null then return new; end if;
  elsif old.deletion_requested_at is null then
    raise exception 'Confirme a exclusão do levantamento no painel.';
  end if;

  if exists (
    select 1 from public.processing_jobs j
    where j.survey_id = old.id
      and j.status not in ('completed', 'error', 'cancelled')
  ) then
    raise exception 'Aguarde o processamento terminar antes de apagar este levantamento.';
  end if;

  if tg_op = 'DELETE' then
    if exists (
      select 1 from storage.objects o
      where (o.bucket_id = 'survey-images'
          and o.name like old.owner_id::text || '/' || old.id::text || '/%')
        or (o.bucket_id = 'processing-results' and exists (
          select 1 from public.processing_jobs j
          where j.survey_id = old.id
            and o.name like old.owner_id::text || '/' || j.id::text || '/%'
        ))
    ) then
      raise exception 'Ainda há arquivos neste levantamento. Use Concluir exclusão para tentar novamente.';
    end if;
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_survey_deletion() from public, anon, authenticated;
create trigger guard_survey_deletion
  before update or delete on public.surveys
  for each row execute function public.guard_survey_deletion();

-- Serialize new content with the parent deletion lock, including jobs that start
-- after the delete dialog was opened. Freeze job paths until cleanup completes.
create function public.guard_survey_content_change()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  v_owner uuid;
  v_deletion timestamptz;
begin
  if tg_op = 'DELETE' then
    select s.deletion_requested_at into v_deletion
    from public.surveys s where s.id = old.survey_id for share;
    if found and v_deletion is not null then
      raise exception 'Conclua a exclusão do levantamento antes de alterar suas tarefas.';
    end if;
    -- A missing parent is expected during ON DELETE CASCADE.
    return old;
  end if;

  if tg_op = 'UPDATE' and
    (new.survey_id is distinct from old.survey_id or new.owner_id is distinct from old.owner_id) then
    raise exception 'O levantamento e o proprietário deste registro não podem ser alterados.';
  end if;
  if new.survey_id is null then return new; end if;

  select s.owner_id, s.deletion_requested_at into v_owner, v_deletion
  from public.surveys s where s.id = new.survey_id for share;
  if not found or v_owner is distinct from new.owner_id then
    raise exception 'Levantamento não encontrado ou sem acesso.';
  end if;
  if v_deletion is not null then
    raise exception 'Este levantamento está sendo apagado e não pode receber alterações.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_survey_content_change() from public, anon, authenticated;
create trigger guard_processing_job_survey
  before insert or update or delete on public.processing_jobs
  for each row execute function public.guard_survey_content_change();
create trigger guard_processing_result_survey
  before insert or update of survey_id, owner_id, job_id on public.processing_results
  for each row execute function public.guard_survey_content_change();
create trigger guard_agro_plan_survey
  before insert on public.agro_plans
  for each row execute function public.guard_survey_content_change();
create trigger guard_map_measurement_survey
  before insert on public.map_measurements
  for each row execute function public.guard_survey_content_change();

-- Storage completes signed uploads with an elevated role after checking RLS.
-- This narrow invariant also rejects an upload signed before deletion. It only
-- reads/locks application rows: all actual file operations remain in Storage API.
-- The private definer is needed because Storage's role cannot read survey rows.
create schema if not exists orion_private;
revoke all on schema orion_private from public, anon, authenticated;

create function orion_private.guard_survey_storage_write()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_parts text[];
  v_owner uuid;
  v_reference uuid;
  v_deletion timestamptz;
begin
  if new.bucket_id not in ('survey-images', 'processing-results') then return new; end if;
  v_parts := string_to_array(new.name, '/');
  if array_length(v_parts, 1) < 3
    or v_parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or v_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Caminho de arquivo de levantamento inválido.' using errcode = '23514';
  end if;
  v_owner := v_parts[1]::uuid;
  v_reference := v_parts[2]::uuid;
  if auth.uid() is not null and auth.uid() is distinct from v_owner then
    raise exception 'Arquivo fora do levantamento autorizado.' using errcode = '23514';
  end if;

  if new.bucket_id = 'survey-images' then
    select s.deletion_requested_at into v_deletion
    from public.surveys s where s.id = v_reference and s.owner_id = v_owner
    for share;
  else
    select s.deletion_requested_at into v_deletion
    from public.processing_jobs j
    join public.surveys s on s.id = j.survey_id and s.owner_id = j.owner_id
    where j.id = v_reference and j.owner_id = v_owner
    for share of s, j;
  end if;
  if not found or v_deletion is not null then
    raise exception 'Levantamento indisponível para receber arquivos.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function orion_private.guard_survey_storage_write() from public, anon, authenticated;
create trigger orion_guard_survey_storage_write
  before insert or update of bucket_id, name, version, owner, owner_id on storage.objects
  for each row execute function orion_private.guard_survey_storage_write();

create function public.begin_survey_deletion(p_survey_id uuid, p_name text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_survey public.surveys%rowtype;
  v_jobs jsonb;
begin
  if auth.uid() is null then raise exception 'Sua sessão expirou. Entre novamente.'; end if;
  select * into v_survey from public.surveys s
  where s.id = p_survey_id and s.owner_id = (select auth.uid()) for update;
  if not found then raise exception 'Levantamento não encontrado ou sem acesso.'; end if;
  if v_survey.name is distinct from p_name then
    raise exception 'O nome do levantamento mudou. Atualize o painel e confirme novamente.';
  end if;
  if exists (
    select 1 from public.processing_jobs j
    where j.survey_id = p_survey_id and j.status not in ('completed', 'error', 'cancelled')
  ) then
    raise exception 'Aguarde o processamento terminar antes de apagar este levantamento.';
  end if;
  update public.surveys
  set deletion_requested_at = coalesce(deletion_requested_at, now())
  where id = p_survey_id;
  select coalesce(jsonb_agg(j.id order by j.created_at), '[]'::jsonb) into v_jobs
  from public.processing_jobs j where j.survey_id = p_survey_id;
  return jsonb_build_object('survey_id', p_survey_id, 'job_ids', v_jobs);
end;
$$;

create function public.finish_survey_deletion(p_survey_id uuid)
returns boolean language plpgsql security invoker set search_path = ''
as $$
declare
  v_survey public.surveys%rowtype;
begin
  if auth.uid() is null then raise exception 'Sua sessão expirou. Entre novamente.'; end if;
  select * into v_survey from public.surveys s
  where s.id = p_survey_id and s.owner_id = (select auth.uid()) for update;
  if not found then raise exception 'Levantamento não encontrado ou sem acesso.'; end if;
  if v_survey.deletion_requested_at is null then
    raise exception 'Confirme a exclusão do levantamento no painel.';
  end if;

  -- These version tables deliberately use RESTRICT/NO ACTION. Remove only
  -- versions linked to this owned survey, within the same transaction.
  delete from public.map_measurements where survey_id = p_survey_id and owner_id = (select auth.uid());
  delete from public.agro_plans where survey_id = p_survey_id and owner_id = (select auth.uid());
  -- The parent trigger verifies active jobs and remaining files before cascading.
  delete from public.surveys where id = p_survey_id and owner_id = (select auth.uid());
  return true;
end;
$$;

revoke all on function public.begin_survey_deletion(uuid, text) from public, anon, authenticated;
revoke all on function public.finish_survey_deletion(uuid) from public, anon, authenticated;
grant execute on function public.begin_survey_deletion(uuid, text) to authenticated;
grant execute on function public.finish_survey_deletion(uuid) to authenticated;
