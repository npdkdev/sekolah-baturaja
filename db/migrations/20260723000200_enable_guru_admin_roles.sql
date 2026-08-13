-- Allow trusted guru accounts to receive the canonical admin role through
-- the managed account workflow. The official admin account remains protected
-- from edits, but admin access is no longer limited to one email address.

drop index if exists public.user_profiles_single_admin_idx;

alter table public.user_profiles
  drop constraint if exists user_profiles_admin_email_check;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select up.role
  from public.user_profiles up
  where up.id = auth.uid()
    and up.status = 'active'
  limit 1;
$$;

create or replace function public.update_guru_account(
  p_target_id uuid,
  p_role public.app_role,
  p_profile jsonb,
  p_actor_id uuid
)
returns table (
  user_id uuid,
  role public.app_role,
  email text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_email text;
  v_name text;
  v_email text;
  v_status public.account_status;
  v_roles text[];
  v_has_pentashih_role boolean;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_role not in (
    'admin'::public.app_role,
    'guru'::public.app_role,
    'pentashih'::public.app_role
  ) then
    raise exception 'INVALID_GURU_ROLE' using errcode = '22023';
  end if;

  select lower(btrim(up.email))
    into v_current_email
  from public.user_profiles up
  join public.guru g on g.id = up.id
  where up.id = p_target_id
  for update of up, g;

  if not found then
    raise exception 'GURU_ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_current_email = 'admin@lpqalfathmaulana.id' then
    raise exception 'OFFICIAL_ADMIN_PROTECTED' using errcode = '42501';
  end if;

  v_name := nullif(btrim(p_profile ->> 'nama'), '');
  v_email := lower(nullif(btrim(p_profile ->> 'email'), ''));

  if v_name is null then
    raise exception 'GURU_NAME_REQUIRED' using errcode = '23514';
  end if;

  if v_email is null then
    raise exception 'GURU_EMAIL_REQUIRED' using errcode = '23514';
  end if;

  if v_email = 'admin@lpqalfathmaulana.id' then
    raise exception 'OFFICIAL_ADMIN_EMAIL_RESERVED' using errcode = '23505';
  end if;

  begin
    v_status := coalesce(nullif(lower(btrim(p_profile ->> 'status')), ''), 'active')::public.account_status;
  exception
    when invalid_text_representation then
      raise exception 'INVALID_GURU_STATUS' using errcode = '22023';
  end;

  if p_profile ? 'roles' and jsonb_typeof(p_profile -> 'roles') <> 'array' then
    raise exception 'INVALID_GURU_ROLES' using errcode = '22023';
  end if;

  select coalesce(
      array_agg(distinct btrim(item)) filter (
        where btrim(item) <> ''
          and lower(btrim(item)) not in ('admin', 'pentashih')
      ),
      '{}'::text[]
    ),
    coalesce(bool_or(lower(btrim(item)) = 'pentashih'), false)
    into v_roles, v_has_pentashih_role
  from jsonb_array_elements_text(coalesce(p_profile -> 'roles', '[]'::jsonb)) as role_item(item);

  if v_has_pentashih_role or p_role = 'pentashih'::public.app_role then
    v_roles := array_append(v_roles, 'Pentashih');
  end if;

  if p_role = 'admin'::public.app_role then
    v_roles := array_append(v_roles, 'Admin');
  end if;

  update public.user_profiles
  set role = p_role,
      display_name = v_name,
      email = v_email,
      phone = nullif(btrim(p_profile ->> 'no_hp'), ''),
      status = v_status,
      updated_by = p_actor_id,
      updated_at = now()
  where id = p_target_id;

  update public.guru
  set nama = v_name,
      email = v_email,
      no_hp = nullif(btrim(p_profile ->> 'no_hp'), ''),
      alamat = nullif(btrim(p_profile ->> 'alamat'), ''),
      foto_url = nullif(btrim(p_profile ->> 'foto_url'), ''),
      avatar_path = nullif(btrim(p_profile ->> 'avatar_path'), ''),
      rfid_tag = nullif(btrim(p_profile ->> 'rfid_tag'), ''),
      jabatan = nullif(btrim(p_profile ->> 'jabatan'), ''),
      roles = v_roles,
      is_notulen = coalesce((p_profile ->> 'is_notulen')::boolean, false),
      jenis_kelamin = nullif(btrim(p_profile ->> 'jenis_kelamin'), ''),
      tanggal_lahir = nullif(btrim(p_profile ->> 'tanggal_lahir'), '')::date,
      status_guru = nullif(btrim(p_profile ->> 'status_guru'), ''),
      status = v_status,
      updated_by = p_actor_id,
      updated_at = now()
  where id = p_target_id;

  return query
  select p_target_id, p_role, v_email;
end;
$$;

revoke all on function public.update_guru_account(uuid, public.app_role, jsonb, uuid) from public;
revoke all on function public.update_guru_account(uuid, public.app_role, jsonb, uuid) from anon;
revoke all on function public.update_guru_account(uuid, public.app_role, jsonb, uuid) from authenticated;
grant execute on function public.update_guru_account(uuid, public.app_role, jsonb, uuid) to service_role;
