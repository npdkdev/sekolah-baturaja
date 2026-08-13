-- Logical migration: 0015_rls_helper_functions
-- Purpose: create RLS helper functions and persistent auth rate-limit RPC.
-- Dependencies: all core tables through 0014.
-- Safety: security definer functions set search_path explicitly and do not write except rate limit RPC.

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

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.current_user_role() = 'admin'::public.app_role; $$;

create or replace function public.is_guru()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.current_user_role() = 'guru'::public.app_role; $$;

create or replace function public.is_santri()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.current_user_role() = 'santri'::public.app_role; $$;

create or replace function public.is_pentashih()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.current_user_role() = 'pentashih'::public.app_role; $$;

create or replace function public.guru_has_class_access(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = target_class_id
      and c.id_guru = auth.uid()
      and c.deleted_at is null
  );
$$;

create or replace function public.guru_has_santri_access(target_santri_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_memberships cm
    join public.classes c on c.id = cm.class_id
    where cm.santri_id = target_santri_id
      and cm.status = 'active'
      and c.id_guru = auth.uid()
      and c.deleted_at is null
  );
$$;

create or replace function public.pentashih_has_class_access(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pentashih_class_assignments pca
    where pca.pentashih_id = auth.uid()
      and pca.class_id = target_class_id
      and pca.is_active
      and pca.scope in ('class', 'both')
      and (pca.starts_at is null or pca.starts_at <= current_date)
      and (pca.ends_at is null or pca.ends_at >= current_date)
  );
$$;

create or replace function public.pentashih_has_mmq_access(target_schedule_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pentashih_class_assignments pca
    where pca.pentashih_id = auth.uid()
      and pca.mmq_schedule_id = target_schedule_id
      and pca.is_active
      and pca.scope in ('mmq', 'both')
      and (pca.starts_at is null or pca.starts_at <= current_date)
      and (pca.ends_at is null or pca.ends_at >= current_date)
  );
$$;

create or replace function public.pentashih_has_santri_access(target_santri_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_memberships cm
    where cm.santri_id = target_santri_id
      and cm.status = 'active'
      and public.pentashih_has_class_access(cm.class_id)
  );
$$;

create or replace function public.user_owns_santri_record(target_santri_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select auth.uid() = target_santri_id; $$;

create or replace function public.consume_auth_rate_limit(
  p_purpose text,
  p_ip_hash text,
  p_alias_hash text,
  p_max_attempts integer default 5,
  p_window_seconds integer default 300,
  p_block_seconds integer default 900
)
returns table(allowed boolean, blocked_until timestamptz, attempts integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.auth_rate_limits%rowtype;
begin
  if p_purpose is null or length(btrim(p_purpose)) = 0 then
    raise exception 'purpose is required';
  end if;

  if p_ip_hash is null or length(btrim(p_ip_hash)) = 0 then
    raise exception 'ip hash is required';
  end if;

  if p_alias_hash is null or length(btrim(p_alias_hash)) = 0 then
    raise exception 'alias hash is required';
  end if;

  insert into public.auth_rate_limits(purpose, ip_hash, alias_hash, window_start, attempts, blocked_until)
  values (p_purpose, p_ip_hash, p_alias_hash, v_now, 0, null)
  on conflict (purpose, ip_hash, alias_hash) do nothing;

  select *
  into v_row
  from public.auth_rate_limits arl
  where arl.purpose = p_purpose
    and arl.ip_hash = p_ip_hash
    and arl.alias_hash = p_alias_hash
  for update;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    return query select false, v_row.blocked_until, v_row.attempts;
    return;
  elsif v_row.window_start < v_now - make_interval(secs => p_window_seconds) then
    update public.auth_rate_limits
    set window_start = v_now,
        attempts = 1,
        blocked_until = null,
        updated_at = v_now
    where id = v_row.id
    returning * into v_row;
  else
    update public.auth_rate_limits
    set attempts = v_row.attempts + 1,
        blocked_until = case when v_row.attempts + 1 > p_max_attempts then v_now + make_interval(secs => p_block_seconds) else v_row.blocked_until end,
        updated_at = v_now
    where id = v_row.id
    returning * into v_row;
  end if;

  return query select coalesce(v_row.blocked_until, '-infinity'::timestamptz) <= v_now, v_row.blocked_until, v_row.attempts;
end;
$$;

revoke all on function public.consume_auth_rate_limit(text, text, text, integer, integer, integer) from public;
grant execute on function public.consume_auth_rate_limit(text, text, text, integer, integer, integer) to service_role;
