-- Purpose: restore class transfers from the guru dashboard with teacher-scoped authorization.
-- Dependencies: 20260624001900_move_santri_to_class_rpc.sql.
-- Safety: gurus can only transfer santri currently assigned to one of their own classes.

create or replace function public.list_guru_transfer_destinations(
  p_santri_id uuid
)
returns table(
  id uuid,
  nama_kelas text,
  id_guru uuid,
  guru_nama text,
  sesi text,
  kategori text,
  sort_order integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_santri_category text;
begin
  if v_actor is null then
    raise exception 'Login diperlukan untuk melihat kelas tujuan.' using errcode = '28000';
  end if;

  if public.current_user_role() is distinct from 'guru'::public.app_role then
    raise exception 'Daftar kelas tujuan hanya tersedia untuk guru.' using errcode = '42501';
  end if;

  if not public.guru_has_santri_access(p_santri_id) then
    raise exception 'Santri ini tidak berada di kelas Anda.' using errcode = '42501';
  end if;

  select s.kategori
  into v_santri_category
  from public.santri s
  where s.id = p_santri_id
    and lower(coalesce(s.status, '')) in ('aktif', 'active');

  if not found then
    raise exception 'Santri aktif tidak ditemukan.' using errcode = 'P0002';
  end if;

  return query
  select
    c.id,
    c.nama_kelas,
    c.id_guru,
    g.nama as guru_nama,
    c.sesi,
    c.kategori,
    c.sort_order
  from public.classes c
  left join public.guru g on g.id = c.id_guru
  where c.is_active is true
    and c.deleted_at is null
    and lower(coalesce(c.kategori, '')) = lower(coalesce(v_santri_category, ''))
  order by c.sort_order asc nulls last, c.nama_kelas asc;
end;
$$;

create or replace function public.move_santri_to_class_by_guru(
  p_santri_id uuid,
  p_to_class_id uuid,
  p_reason text default null
)
returns table(
  santri_id uuid,
  from_class_id uuid,
  to_class_id uuid,
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
  v_santri record;
  v_target_class record;
  v_active_membership record;
  v_order_in_class integer;
  v_mutation_id uuid;
  v_active_count integer;
begin
  if v_actor is null then
    raise exception 'Login diperlukan untuk memindahkan kelas santri.' using errcode = '28000';
  end if;

  if public.current_user_role() is distinct from 'guru'::public.app_role then
    raise exception 'Fitur ini hanya tersedia untuk guru.' using errcode = '42501';
  end if;

  if p_santri_id is null then
    raise exception 'Santri wajib dipilih.' using errcode = '22023';
  end if;

  if p_to_class_id is null then
    raise exception 'Kelas tujuan wajib dipilih.' using errcode = '22023';
  end if;

  select
    s.id,
    s.status,
    s.kategori,
    s.current_class_id,
    s.sesi_mengaji,
    s.order_in_class
  into v_santri
  from public.santri s
  where s.id = p_santri_id
  for update;

  if not found then
    raise exception 'Santri tidak ditemukan.' using errcode = 'P0002';
  end if;

  if lower(coalesce(v_santri.status, '')) not in ('aktif', 'active') then
    raise exception 'Santri tidak aktif sehingga tidak dapat dipindahkan kelas.' using errcode = '22023';
  end if;

  select
    cm.id,
    cm.class_id,
    cm.order_in_class,
    c.id_guru
  into v_active_membership
  from public.class_memberships cm
  join public.classes c on c.id = cm.class_id
  where cm.santri_id = p_santri_id
    and cm.status = 'active'
  order by cm.created_at desc
  limit 1
  for update of cm;

  if v_active_membership.id is null or v_active_membership.id_guru is distinct from v_actor then
    raise exception 'Santri ini tidak berada di kelas Anda.' using errcode = '42501';
  end if;

  select
    c.id,
    c.sesi,
    c.kategori,
    c.is_active,
    c.deleted_at
  into v_target_class
  from public.classes c
  where c.id = p_to_class_id
  for update;

  if not found then
    raise exception 'Kelas tujuan tidak ditemukan.' using errcode = 'P0002';
  end if;

  if v_target_class.is_active is not true or v_target_class.deleted_at is not null then
    raise exception 'Kelas tujuan tidak aktif.' using errcode = '22023';
  end if;

  if lower(coalesce(v_target_class.kategori, '')) is distinct from lower(coalesce(v_santri.kategori, '')) then
    raise exception 'Kelas tujuan harus memiliki kategori yang sama dengan santri.' using errcode = '22023';
  end if;

  if v_active_membership.class_id = p_to_class_id then
    update public.santri s
    set current_class_id = p_to_class_id,
        sesi_mengaji = coalesce(v_target_class.sesi, s.sesi_mengaji),
        order_in_class = coalesce(v_active_membership.order_in_class, s.order_in_class),
        updated_by = v_actor
    where s.id = p_santri_id;

    select count(*)::integer
    into v_active_count
    from public.class_memberships cm
    where cm.santri_id = p_santri_id
      and cm.status = 'active';

    return query select
      p_santri_id,
      v_active_membership.class_id,
      p_to_class_id,
      null::uuid,
      false,
      'Santri sudah berada di kelas tujuan.'::text,
      v_active_count;
    return;
  end if;

  update public.class_memberships cm
  set status = 'moved',
      end_date = current_date,
      updated_by = v_actor
  where cm.id = v_active_membership.id;

  select coalesce(max(cm.order_in_class), 0) + 1
  into v_order_in_class
  from public.class_memberships cm
  where cm.class_id = p_to_class_id
    and cm.status = 'active';

  insert into public.class_memberships (
    santri_id,
    class_id,
    start_date,
    status,
    order_in_class,
    created_by,
    updated_by
  )
  values (
    p_santri_id,
    p_to_class_id,
    current_date,
    'active',
    v_order_in_class,
    v_actor,
    v_actor
  );

  update public.santri s
  set current_class_id = p_to_class_id,
      sesi_mengaji = coalesce(v_target_class.sesi, s.sesi_mengaji),
      order_in_class = v_order_in_class,
      updated_by = v_actor
  where s.id = p_santri_id;

  insert into public.class_mutations (
    santri_id,
    from_class_id,
    to_class_id,
    reason,
    created_by
  )
  values (
    p_santri_id,
    v_active_membership.class_id,
    p_to_class_id,
    coalesce(nullif(btrim(p_reason), ''), 'Mutasi kelas oleh guru'),
    v_actor
  )
  returning id into v_mutation_id;

  select count(*)::integer
  into v_active_count
  from public.class_memberships cm
  where cm.santri_id = p_santri_id
    and cm.status = 'active';

  return query select
    p_santri_id,
    v_active_membership.class_id,
    p_to_class_id,
    v_mutation_id,
    true,
    'Santri berhasil dipindahkan kelas.'::text,
    v_active_count;
exception
  when unique_violation then
    raise exception 'Santri sudah memiliki kelas aktif. Muat ulang data lalu coba lagi.' using errcode = '23505';
end;
$$;

revoke all on function public.list_guru_transfer_destinations(uuid) from public;
revoke all on function public.list_guru_transfer_destinations(uuid) from anon;
revoke all on function public.list_guru_transfer_destinations(uuid) from authenticated;
grant execute on function public.list_guru_transfer_destinations(uuid) to authenticated;

revoke all on function public.move_santri_to_class_by_guru(uuid, uuid, text) from public;
revoke all on function public.move_santri_to_class_by_guru(uuid, uuid, text) from anon;
revoke all on function public.move_santri_to_class_by_guru(uuid, uuid, text) from authenticated;
grant execute on function public.move_santri_to_class_by_guru(uuid, uuid, text) to authenticated;
