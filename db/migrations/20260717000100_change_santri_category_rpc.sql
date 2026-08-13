-- Purpose: migrate a santri category and close the active class membership atomically.
-- Safety: admin-only, no auth changes, no data deletion, and no RLS weakening.

create or replace function public.change_santri_category(
  p_santri_id uuid,
  p_target_category text,
  p_reason text default null
)
returns table(
  santri_id uuid,
  from_category text,
  to_category text,
  from_class_id uuid,
  mutation_id uuid,
  changed boolean,
  message text,
  active_memberships integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
  v_santri record;
  v_from_class_id uuid;
  v_mutation_id uuid;
  v_active_count integer;
  v_target_category text := initcap(lower(btrim(coalesce(p_target_category, ''))));
begin
  if v_actor is null then
    raise exception 'Login diperlukan untuk memindahkan kategori santri.' using errcode = '28000';
  end if;

  select public.current_user_role() into v_role;
  if v_role is distinct from 'admin'::public.app_role then
    raise exception 'Hanya admin yang boleh memindahkan kategori santri.' using errcode = '42501';
  end if;

  if p_santri_id is null then
    raise exception 'Santri wajib dipilih.' using errcode = '22023';
  end if;

  if v_target_category not in ('Anak', 'Dewasa') then
    raise exception 'Kategori tujuan harus Anak atau Dewasa.' using errcode = '22023';
  end if;

  select s.id, s.nama_lengkap, s.kategori, s.current_class_id
  into v_santri
  from public.santri s
  where s.id = p_santri_id
  for update;

  if not found then
    raise exception 'Santri tidak ditemukan.' using errcode = 'P0002';
  end if;

  select cm.class_id
  into v_from_class_id
  from public.class_memberships cm
  where cm.santri_id = p_santri_id
    and cm.status = 'active'
  order by cm.created_at desc
  limit 1
  for update;

  v_from_class_id := coalesce(v_from_class_id, v_santri.current_class_id);

  update public.class_memberships cm
  set status = 'moved',
      end_date = current_date,
      updated_by = v_actor
  where cm.santri_id = p_santri_id
    and cm.status = 'active';

  update public.santri s
  set kategori = v_target_category,
      current_class_id = null,
      order_in_class = null,
      updated_by = v_actor
  where s.id = p_santri_id;

  if v_from_class_id is not null then
    insert into public.class_mutations (
      santri_id,
      from_class_id,
      to_class_id,
      reason,
      created_by
    ) values (
      p_santri_id,
      v_from_class_id,
      null,
      coalesce(nullif(btrim(p_reason), ''), 'Migrasi kategori santri'),
      v_actor
    )
    returning id into v_mutation_id;
  end if;

  select count(*)::integer
  into v_active_count
  from public.class_memberships cm
  where cm.santri_id = p_santri_id
    and cm.status = 'active';

  return query select
    p_santri_id,
    v_santri.kategori::text,
    v_target_category,
    v_from_class_id,
    v_mutation_id,
    (v_santri.kategori is distinct from v_target_category or v_from_class_id is not null),
    format('%s berhasil dipindahkan ke kategori %s.', v_santri.nama_lengkap, v_target_category),
    v_active_count;
end;
$$;

revoke all on function public.change_santri_category(uuid, text, text) from public;
revoke all on function public.change_santri_category(uuid, text, text) from anon;
revoke all on function public.change_santri_category(uuid, text, text) from authenticated;
grant execute on function public.change_santri_category(uuid, text, text) to authenticated;
