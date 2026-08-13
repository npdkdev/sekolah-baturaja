


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."account_status" AS ENUM (
    'active',
    'inactive',
    'suspended'
);


ALTER TYPE "public"."account_status" OWNER TO "postgres";


CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'guru',
    'santri',
    'pentashih'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."payment_visibility_status" AS ENUM (
    'Lunas',
    'Belum Lunas'
);


ALTER TYPE "public"."payment_visibility_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."change_santri_category"("p_santri_id" "uuid", "p_target_category" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS TABLE("santri_id" "uuid", "from_category" "text", "to_category" "text", "from_class_id" "uuid", "mutation_id" "uuid", "changed" boolean, "message" "text", "active_memberships" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
  v_santri record;
  v_from_class_id uuid;
  v_mutation_id uuid;
  v_active_count integer;
  v_target_category text;
  v_current_category text;
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

  v_target_category := case upper(btrim(coalesce(p_target_category, '')))
    when 'ANAK' then 'Anak'
    when 'TPQ' then 'Anak'
    when 'PTPT' then 'PTPT'
    when 'DEWASA' then 'Dewasa'
    else null
  end;

  if v_target_category is null then
    raise exception 'Kategori tujuan harus TPQ, PTPT, atau Dewasa.' using errcode = '22023';
  end if;

  select s.id, s.nama_lengkap, s.kategori, s.current_class_id
  into v_santri
  from public.santri s
  where s.id = p_santri_id
  for update;

  if not found then
    raise exception 'Santri tidak ditemukan.' using errcode = 'P0002';
  end if;

  v_current_category := case upper(btrim(coalesce(v_santri.kategori, 'ANAK')))
    when 'TPQ' then 'Anak'
    when 'ANAK' then 'Anak'
    when 'PTPT' then 'PTPT'
    when 'DEWASA' then 'Dewasa'
    else v_santri.kategori
  end;

  if v_current_category is not distinct from v_target_category then
    select count(*)::integer
    into v_active_count
    from public.class_memberships cm
    where cm.santri_id = p_santri_id
      and cm.status = 'active';

    return query select
      p_santri_id,
      v_santri.kategori::text,
      v_target_category,
      v_santri.current_class_id,
      null::uuid,
      false,
      format('%s sudah berada pada kategori %s.', v_santri.nama_lengkap, v_target_category),
      v_active_count;
    return;
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
    true,
    format('%s berhasil dipindahkan ke kategori %s.', v_santri.nama_lengkap, v_target_category),
    v_active_count;
end;
$$;


ALTER FUNCTION "public"."change_santri_category"("p_santri_id" "uuid", "p_target_category" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_auth_rate_limit"("p_purpose" "text", "p_ip_hash" "text", "p_alias_hash" "text", "p_max_attempts" integer DEFAULT 5, "p_window_seconds" integer DEFAULT 300, "p_block_seconds" integer DEFAULT 900) RETURNS TABLE("allowed" boolean, "blocked_until" timestamp with time zone, "attempts" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."consume_auth_rate_limit"("p_purpose" "text", "p_ip_hash" "text", "p_alias_hash" "text", "p_max_attempts" integer, "p_window_seconds" integer, "p_block_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_role"() RETURNS "public"."app_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select up.role
  from public.user_profiles up
  where up.id = auth.uid()
    and up.status = 'active'
  limit 1;
$$;


ALTER FUNCTION "public"."current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guru_has_class_access"("target_class_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.classes c
    where c.id = target_class_id
      and c.id_guru = auth.uid()
      and c.deleted_at is null
  );
$$;


ALTER FUNCTION "public"."guru_has_class_access"("target_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guru_has_santri_access"("target_santri_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."guru_has_santri_access"("target_santri_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ select public.current_user_role() = 'admin'::public.app_role; $$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_guru"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ select public.current_user_role() = 'guru'::public.app_role; $$;


ALTER FUNCTION "public"."is_guru"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_pentashih"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ select public.current_user_role() = 'pentashih'::public.app_role; $$;


ALTER FUNCTION "public"."is_pentashih"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_santri"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ select public.current_user_role() = 'santri'::public.app_role; $$;


ALTER FUNCTION "public"."is_santri"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_santri_to_class"("p_santri_id" "uuid", "p_to_class_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS TABLE("santri_id" "uuid", "from_class_id" "uuid", "to_class_id" "uuid", "mutation_id" "uuid", "changed" boolean, "message" "text", "active_memberships" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_role public.app_role;
  v_santri record;
  v_target_class record;
  v_active_membership record;
  v_from_class_id uuid;
  v_order_in_class integer;
  v_mutation_id uuid;
  v_active_count integer;
begin
  if v_actor is null then
    raise exception 'Login diperlukan untuk memindahkan kelas santri.' using errcode = '28000';
  end if;

  select public.current_user_role() into v_role;
  if v_role is distinct from 'admin'::public.app_role then
    raise exception 'Hanya admin yang boleh memindahkan kelas santri.' using errcode = '42501';
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
    c.id,
    c.sesi,
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

  select
    cm.id,
    cm.class_id,
    cm.order_in_class
  into v_active_membership
  from public.class_memberships cm
  where cm.santri_id = p_santri_id
    and cm.status = 'active'
  order by cm.created_at desc
  limit 1
  for update;

  v_from_class_id := coalesce(v_active_membership.class_id, v_santri.current_class_id);

  if v_active_membership.id is not null and v_active_membership.class_id = p_to_class_id then
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
      v_from_class_id,
      p_to_class_id,
      null::uuid,
      (v_santri.current_class_id is distinct from p_to_class_id),
      'Santri sudah berada di kelas tujuan. Data aktif disinkronkan.'::text,
      v_active_count;
    return;
  end if;

  update public.class_memberships cm
  set status = 'moved',
      end_date = current_date,
      updated_by = v_actor
  where cm.santri_id = p_santri_id
    and cm.status = 'active';

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
    v_from_class_id,
    p_to_class_id,
    coalesce(nullif(btrim(p_reason), ''), 'Mutasi kelas oleh admin'),
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
    v_from_class_id,
    p_to_class_id,
    v_mutation_id,
    true,
    'Santri berhasil dipindahkan kelas.'::text,
    v_active_count;
exception
  when unique_violation then
    raise exception 'Santri sudah memiliki membership aktif. Muat ulang data lalu coba lagi.' using errcode = '23505';
end;
$$;


ALTER FUNCTION "public"."move_santri_to_class"("p_santri_id" "uuid", "p_to_class_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pentashih_has_class_access"("target_class_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."pentashih_has_class_access"("target_class_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pentashih_has_mmq_access"("target_schedule_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."pentashih_has_mmq_access"("target_schedule_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pentashih_has_santri_access"("target_santri_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.class_memberships cm
    where cm.santri_id = target_santri_id
      and cm.status = 'active'
      and public.pentashih_has_class_access(cm.class_id)
  );
$$;


ALTER FUNCTION "public"."pentashih_has_santri_access"("target_santri_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_login_attempt"("p_username_attempt" "text", "p_status" "text", "p_role" "text" DEFAULT NULL::"text", "p_device" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_ip text := 'unknown';
  v_ip_hash text;
  v_alias_hash text;
  v_allowed boolean := false;
  v_role text := null;
begin
  if p_username_attempt is null or length(btrim(p_username_attempt)) = 0 then
    raise exception 'username is required';
  end if;

  if p_status not in ('success', 'failed') then
    raise exception 'invalid login status';
  end if;

  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_ip := coalesce(
    nullif(split_part(v_headers ->> 'x-forwarded-for', ',', 1), ''),
    nullif(v_headers ->> 'cf-connecting-ip', ''),
    'unknown'
  );
  v_ip_hash := encode(extensions.digest(v_ip, 'sha256'), 'hex');
  v_alias_hash := encode(extensions.digest(lower(btrim(p_username_attempt)), 'sha256'), 'hex');

  select rate_limit.allowed
  into v_allowed
  from public.consume_auth_rate_limit(
    'login-log',
    v_ip_hash,
    v_alias_hash,
    20,
    300,
    900
  ) rate_limit;

  if not coalesce(v_allowed, false) then
    return false;
  end if;

  if auth.uid() is not null then
    v_role := public.current_user_role()::text;
  elsif p_role in ('admin', 'guru', 'santri', 'pentashih') then
    v_role := p_role;
  end if;

  insert into public.login_logs (
    user_id,
    role,
    username_attempt,
    status,
    device
  ) values (
    case when p_status = 'success' then auth.uid() else null end,
    v_role,
    left(btrim(p_username_attempt), 160),
    p_status,
    case when p_device in ('Desktop', 'Tablet', 'Mobile') then p_device else 'Unknown' end
  );

  return true;
end;
$$;


ALTER FUNCTION "public"."record_login_attempt"("p_username_attempt" "text", "p_status" "text", "p_role" "text", "p_device" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."record_login_attempt"("p_username_attempt" "text", "p_status" "text", "p_role" "text", "p_device" "text") IS 'Records a rate-limited login result without accepting passwords, tokens, or raw user-agent data.';



CREATE OR REPLACE FUNCTION "public"."set_santri_archive_state"("p_santri_id" "uuid", "p_archived" boolean, "p_actor_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS TABLE("santri_id" "uuid", "archived" boolean, "account_status" "text", "current_class_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  v_santri public.santri%rowtype;
begin
  select *
    into v_santri
    from public.santri
   where id = p_santri_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Data santri tidak ditemukan.';
  end if;

  update public.santri
     set status = case when p_archived then 'Nonaktif' else 'Aktif' end,
         deleted_at = case
           when p_archived then coalesce(deleted_at, now())
           else null
         end,
         archive_reason = case when p_archived then nullif(btrim(p_reason), '') else null end,
         archived_by = case when p_archived then p_actor_id else null end,
         updated_by = p_actor_id,
         updated_at = now()
   where id = p_santri_id;

  update public.user_profiles
     set status = case
       when p_archived then 'inactive'::public.account_status
       else 'active'::public.account_status
     end,
         updated_by = p_actor_id,
         updated_at = now()
   where id = p_santri_id;

  update public.auth_login_aliases
     set is_active = not p_archived,
         updated_at = now()
   where auth_user_id = p_santri_id;

  return query
  select s.id, p_archived, s.status, s.current_class_id
    from public.santri s
   where s.id = p_santri_id;
end;
$$;


ALTER FUNCTION "public"."set_santri_archive_state"("p_santri_id" "uuid", "p_archived" boolean, "p_actor_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_santri_archive_state"("p_santri_id" "uuid", "p_archived" boolean, "p_actor_id" "uuid", "p_reason" "text") IS 'Archives or restores a santri account without deleting class, attendance, payment, memorization, character, or mutation history.';



CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."storage_avatar_santri_owner"("name" "text") RETURNS "uuid"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select nullif((public.storage_foldername(name))[2], '')::uuid
  where (public.storage_foldername(name))[1] = 'santri'
    and (public.storage_foldername(name))[3] = 'profile.webp';
$$;


ALTER FUNCTION "public"."storage_avatar_santri_owner"("name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."storage_foldername"("name" "text") RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  select string_to_array(name, '/');
$$;


ALTER FUNCTION "public"."storage_foldername"("name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_hafalan_status_from_score"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.status := case when new.score = 4 then 'lulus' else 'proses' end;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_hafalan_status_from_score"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_owns_santri_record"("target_santri_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ select auth.uid() = target_santri_id; $$;


ALTER FUNCTION "public"."user_owns_santri_record"("target_santri_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."academic_calendar" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "date" "date" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "is_holiday" boolean DEFAULT false NOT NULL,
    "is_public" boolean DEFAULT true NOT NULL,
    "event_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "academic_calendar_title_not_blank" CHECK (("length"("btrim"("title")) > 0))
);


ALTER TABLE "public"."academic_calendar" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."announcements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "excerpt" "text",
    "content" "jsonb",
    "cover_image_url" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "priority" "text",
    "valid_until" "date",
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "announcements_priority_check" CHECK ((("priority" IS NULL) OR ("priority" = ANY (ARRAY['low'::"text", 'normal'::"text", 'high'::"text"])))),
    CONSTRAINT "announcements_slug_not_blank" CHECK (("length"("btrim"("slug")) > 0)),
    CONSTRAINT "announcements_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"]))),
    CONSTRAINT "announcements_title_not_blank" CHECK (("length"("btrim"("title")) > 0))
);


ALTER TABLE "public"."announcements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "attendance_date" "date" NOT NULL,
    "check_in_time" time without time zone,
    "check_in_timestamp" timestamp with time zone,
    "class_id" "uuid",
    "sesi" "text",
    "status" "text" DEFAULT 'Hadir'::"text" NOT NULL,
    "source" "text" DEFAULT 'rfid'::"text" NOT NULL,
    "correction_reason" "text",
    "corrected_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "attended_session" "text",
    CONSTRAINT "attendance_correction_reason_required" CHECK ((("corrected_by" IS NULL) OR ("length"("btrim"(COALESCE("correction_reason", ''::"text"))) > 0))),
    CONSTRAINT "attendance_source_check" CHECK (("source" = ANY (ARRAY['rfid'::"text", 'manual'::"text", 'correction'::"text", 'import'::"text"]))),
    CONSTRAINT "attendance_status_not_blank" CHECK (("length"("btrim"("status")) > 0))
);


ALTER TABLE "public"."attendance" OWNER TO "postgres";


COMMENT ON COLUMN "public"."attendance"."sesi" IS 'Registered session used for the attendance obligation and existing uniqueness rule.';



COMMENT ON COLUMN "public"."attendance"."attended_session" IS 'Actual session window used when the santri checked in; may differ from sesi.';



CREATE TABLE IF NOT EXISTS "public"."auth_login_aliases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "auth_user_id" "uuid" NOT NULL,
    "alias_type" "text" DEFAULT 'nomor_induk_qiroati'::"text" NOT NULL,
    "alias_value" "text" NOT NULL,
    "normalized_alias" "text" NOT NULL,
    "internal_email" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "auth_login_aliases_alias_no_space" CHECK (("alias_value" !~ '\s'::"text")),
    CONSTRAINT "auth_login_aliases_alias_trimmed" CHECK (("alias_value" = "btrim"("alias_value"))),
    CONSTRAINT "auth_login_aliases_alias_type_check" CHECK (("alias_type" = 'nomor_induk_qiroati'::"text")),
    CONSTRAINT "auth_login_aliases_internal_email_not_blank" CHECK (("length"("btrim"("internal_email")) > 0)),
    CONSTRAINT "auth_login_aliases_normalized_not_blank" CHECK (("length"("btrim"("normalized_alias")) > 0))
);


ALTER TABLE "public"."auth_login_aliases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auth_rate_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "purpose" "text" NOT NULL,
    "ip_hash" "text" NOT NULL,
    "alias_hash" "text" NOT NULL,
    "window_start" timestamp with time zone NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "blocked_until" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "auth_rate_limits_attempts_non_negative" CHECK (("attempts" >= 0))
);


ALTER TABLE "public"."auth_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."character_assessment_items" (
    "id" smallint NOT NULL,
    "item_order" smallint NOT NULL,
    "item_name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "character_assessment_items_name_not_blank" CHECK (("length"("btrim"("item_name")) > 0)),
    CONSTRAINT "character_assessment_items_order_positive" CHECK (("item_order" > 0))
);


ALTER TABLE "public"."character_assessment_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "santri_id" "uuid" NOT NULL,
    "class_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "order_in_class" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "class_memberships_date_order" CHECK ((("end_date" IS NULL) OR ("end_date" >= "start_date"))),
    CONSTRAINT "class_memberships_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'moved'::"text", 'graduated'::"text"])))
);


ALTER TABLE "public"."class_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_mutations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "santri_id" "uuid" NOT NULL,
    "from_class_id" "uuid",
    "to_class_id" "uuid",
    "mutation_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."class_mutations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nama_kelas" "text" NOT NULL,
    "id_guru" "uuid",
    "sesi" "text",
    "kategori" "text",
    "sort_order" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "classes_nama_kelas_not_blank" CHECK (("length"("btrim"("nama_kelas")) > 0))
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tanggal_pengeluaran" "date" NOT NULL,
    "kategori" "text",
    "deskripsi" "text",
    "jumlah" numeric(12,2) NOT NULL,
    "bukti_url" "text",
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "expenses_jumlah_check" CHECK (("jumlah" >= (0)::numeric))
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedbacks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nama" "text",
    "email" "text",
    "phone" "text",
    "message" "text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "handled_by" "uuid",
    "handled_at" timestamp with time zone,
    CONSTRAINT "feedbacks_message_not_blank" CHECK (("length"("btrim"("message")) > 0)),
    CONSTRAINT "feedbacks_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'reviewed'::"text", 'closed'::"text", 'spam'::"text"])))
);


ALTER TABLE "public"."feedbacks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guru" (
    "id" "uuid" NOT NULL,
    "nama" "text" NOT NULL,
    "email" "text",
    "no_hp" "text",
    "alamat" "text",
    "foto_url" "text",
    "rfid_tag" "text",
    "jabatan" "text",
    "roles" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_notulen" boolean DEFAULT false NOT NULL,
    "jenis_kelamin" "text",
    "tanggal_lahir" "date",
    "status_guru" "text",
    "status" "public"."account_status" DEFAULT 'active'::"public"."account_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_by" "uuid",
    "avatar_path" "text",
    CONSTRAINT "guru_avatar_path_expected" CHECK ((("avatar_path" IS NULL) OR ("avatar_path" = (('guru/'::"text" || ("id")::"text") || '/profile.webp'::"text")))),
    CONSTRAINT "guru_email_trimmed" CHECK ((("email" IS NULL) OR ("email" = "btrim"("email")))),
    CONSTRAINT "guru_nama_not_blank" CHECK (("length"("btrim"("nama")) > 0))
);


ALTER TABLE "public"."guru" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hafalan_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "jilid" "text",
    "item_name" "text" NOT NULL,
    "item_order" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "program_scope" "text" DEFAULT 'TPQ'::"text" NOT NULL,
    CONSTRAINT "hafalan_items_category_not_blank" CHECK (("length"("btrim"("category")) > 0)),
    CONSTRAINT "hafalan_items_name_not_blank" CHECK (("length"("btrim"("item_name")) > 0)),
    CONSTRAINT "hafalan_items_program_scope_check" CHECK (("program_scope" = ANY (ARRAY['TPQ'::"text", 'PTPT'::"text"])))
);


ALTER TABLE "public"."hafalan_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."hafalan_items"."program_scope" IS 'Separates TPQ memorization content from the PTPT tahfizh curriculum.';



CREATE TABLE IF NOT EXISTS "public"."hafalan_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "santri_id" "uuid" NOT NULL,
    "item_id" "uuid",
    "category" "text",
    "item_name" "text",
    "status" "text" DEFAULT 'belum'::"text" NOT NULL,
    "nilai" "text",
    "catatan" "text",
    "assessed_by" "uuid",
    "assessed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "score" smallint DEFAULT 1 NOT NULL,
    CONSTRAINT "hafalan_progress_score_check" CHECK ((("score" >= 1) AND ("score" <= 4))),
    CONSTRAINT "hafalan_progress_status_check" CHECK (("status" = ANY (ARRAY['belum'::"text", 'proses'::"text", 'lulus'::"text", 'ulang'::"text"])))
);


ALTER TABLE "public"."hafalan_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jilid_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "santri_id" "uuid" NOT NULL,
    "from_jilid" "text",
    "to_jilid" "text" NOT NULL,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "changed_by" "uuid",
    CONSTRAINT "jilid_history_from_jilid_not_blank" CHECK ((("from_jilid" IS NULL) OR ("length"("btrim"("from_jilid")) > 0))),
    CONSTRAINT "jilid_history_to_jilid_not_blank" CHECK (("length"("btrim"("to_jilid")) > 0))
);


ALTER TABLE "public"."jilid_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."jilid_history" IS 'Immutable-by-default history of santri jilid changes; non-admin users may only append within their class scope.';



CREATE TABLE IF NOT EXISTS "public"."login_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "role" "text",
    "username_attempt" "text",
    "status" "text" NOT NULL,
    "ip_address" "text",
    "city" "text",
    "country" "text",
    "device" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "login_logs_role_check" CHECK ((("role" IS NULL) OR ("role" = ANY (ARRAY['admin'::"text", 'guru'::"text", 'santri'::"text", 'pentashih'::"text"])))),
    CONSTRAINT "login_logs_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."login_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media_player_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "playback_position" integer DEFAULT 0 NOT NULL,
    "is_playing" boolean DEFAULT false NOT NULL,
    "shuffle_enabled" boolean DEFAULT false NOT NULL,
    "loop_enabled" boolean DEFAULT false NOT NULL,
    "crossfade_enabled" boolean DEFAULT false NOT NULL,
    "current_track_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "media_player_settings_position_non_negative" CHECK (("playback_position" >= 0))
);


ALTER TABLE "public"."media_player_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mmq_attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "guru_id" "uuid" NOT NULL,
    "attendance_date" "date" NOT NULL,
    "check_in_timestamp" timestamp with time zone,
    "status" "text" DEFAULT 'Hadir'::"text" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "mmq_attendance_status_not_blank" CHECK (("length"("btrim"("status")) > 0))
);


ALTER TABLE "public"."mmq_attendance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mmq_notulensi" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "tanggal" "date" NOT NULL,
    "judul" "text" NOT NULL,
    "isi" "text",
    "notulen_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "mmq_notulensi_judul_not_blank" CHECK (("length"("btrim"("judul")) > 0))
);


ALTER TABLE "public"."mmq_notulensi" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."mmq_schedule" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "day_of_week" integer,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "location" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "mmq_schedule_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "mmq_schedule_time_order" CHECK ((("end_time" IS NULL) OR ("start_time" IS NULL) OR ("end_time" > "start_time")))
);


ALTER TABLE "public"."mmq_schedule" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."murojaah_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "santri_id" "uuid" NOT NULL,
    "target_guru_id" "uuid",
    "type" "text",
    "content" "text",
    "recording_path" "text",
    "status" "text" DEFAULT 'menunggu'::"text" NOT NULL,
    "feedback" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "murojaah_submissions_status_check" CHECK (("status" = ANY (ARRAY['menunggu'::"text", 'direview'::"text", 'diterima'::"text", 'perlu_perbaikan'::"text"])))
);


ALTER TABLE "public"."murojaah_submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."music_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "artist" "text",
    "filename" "text",
    "storage_path" "text",
    "file_url" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "music_files_file_url_not_blank" CHECK (("length"("btrim"("file_url")) > 0)),
    CONSTRAINT "music_files_title_not_blank" CHECK (("length"("btrim"("title")) > 0))
);


ALTER TABLE "public"."music_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."news" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "excerpt" "text",
    "content" "jsonb",
    "cover_image_url" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "news_slug_not_blank" CHECK (("length"("btrim"("slug")) > 0)),
    CONSTRAINT "news_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"]))),
    CONSTRAINT "news_title_not_blank" CHECK (("length"("btrim"("title")) > 0))
);


ALTER TABLE "public"."news" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "type" "text",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notifications_title_not_blank" CHECK (("length"("btrim"("title")) > 0))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "santri_id" "uuid" NOT NULL,
    "bulan" integer,
    "tahun" integer,
    "jumlah" numeric(12,2) NOT NULL,
    "tanggal_pembayaran" "date" NOT NULL,
    "metode_pembayaran" "text",
    "status" "text" DEFAULT 'paid'::"text" NOT NULL,
    "catatan" "text",
    "transaction_id" "text",
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "payments_bulan_check" CHECK ((("bulan" >= 1) AND ("bulan" <= 12))),
    CONSTRAINT "payments_jumlah_check" CHECK (("jumlah" >= (0)::numeric)),
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['paid'::"text", 'unpaid'::"text", 'void'::"text", 'refunded'::"text"]))),
    CONSTRAINT "payments_tahun_check" CHECK ((("tahun" >= 2000) AND ("tahun" <= 2100)))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."santri" (
    "id" "uuid" NOT NULL,
    "nomor_induk_qiroati" "text",
    "nama_lengkap" "text" NOT NULL,
    "nama_panggilan" "text",
    "kategori" "text",
    "jenis_kelamin" "text",
    "tanggal_lahir" "date",
    "tempat_lahir" "text",
    "alamat" "text",
    "no_hp_ortu" "text",
    "email" "text",
    "foto_url" "text",
    "avatar_path" "text",
    "rfid_tag" "text",
    "current_class_id" "uuid",
    "sesi_mengaji" "text",
    "jilid" "text",
    "status" "text" DEFAULT 'Aktif'::"text" NOT NULL,
    "points" integer DEFAULT 0 NOT NULL,
    "order_in_class" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "created_by" "uuid",
    "updated_by" "uuid",
    "nama_ayah" "text",
    "nama_ibu" "text",
    "tanggal_pendaftaran" "date",
    "no_kk" "text",
    "no_nik" "text",
    "berkas_foto" boolean DEFAULT false NOT NULL,
    "berkas_akta" boolean DEFAULT false NOT NULL,
    "berkas_kk" boolean DEFAULT false NOT NULL,
    "berkas_form" boolean DEFAULT false NOT NULL,
    "link_qiroati" "text",
    "default_spp_amount" numeric(12,2),
    "archive_reason" "text",
    "archived_by" "uuid",
    CONSTRAINT "santri_avatar_path_expected" CHECK ((("avatar_path" IS NULL) OR ("avatar_path" = (('santri/'::"text" || ("id")::"text") || '/profile.webp'::"text")))),
    CONSTRAINT "santri_default_spp_amount_valid" CHECK ((("default_spp_amount" IS NULL) OR ("default_spp_amount" >= (10000)::numeric))),
    CONSTRAINT "santri_email_trimmed" CHECK ((("email" IS NULL) OR ("email" = "btrim"("email")))),
    CONSTRAINT "santri_kategori_check" CHECK (("kategori" = ANY (ARRAY['Anak'::"text", 'PTPT'::"text", 'Dewasa'::"text"]))),
    CONSTRAINT "santri_nama_lengkap_not_blank" CHECK (("length"("btrim"("nama_lengkap")) > 0)),
    CONSTRAINT "santri_nomor_induk_no_space" CHECK (("nomor_induk_qiroati" !~ '\s'::"text")),
    CONSTRAINT "santri_nomor_induk_required_for_non_adult" CHECK ((("kategori" = 'Dewasa'::"text") OR ("nomor_induk_qiroati" IS NOT NULL))),
    CONSTRAINT "santri_nomor_induk_trimmed" CHECK (("nomor_induk_qiroati" = "btrim"("nomor_induk_qiroati"))),
    CONSTRAINT "santri_points_non_negative" CHECK (("points" >= 0))
);


ALTER TABLE "public"."santri" OWNER TO "postgres";


COMMENT ON COLUMN "public"."santri"."nomor_induk_qiroati" IS 'Nomor resmi Qiroati; wajib dan unik untuk santri non-Dewasa, opsional untuk santri Dewasa.';



COMMENT ON COLUMN "public"."santri"."kategori" IS 'Program santri: Anak (TPQ), PTPT (tahfizh), or Dewasa.';



CREATE OR REPLACE VIEW "public"."payment_status_summary" AS
 SELECT "santri_id",
    "class_id",
    "bulan",
    "tahun",
    "status"
   FROM ( SELECT "s"."id" AS "santri_id",
            "cm"."class_id",
            "p"."bulan",
            "p"."tahun",
                CASE
                    WHEN (EXISTS ( SELECT 1
                       FROM "public"."payments" "p2"
                      WHERE (("p2"."santri_id" = "s"."id") AND (NOT ("p2"."bulan" IS DISTINCT FROM "p"."bulan")) AND (NOT ("p2"."tahun" IS DISTINCT FROM "p"."tahun")) AND ("p2"."status" = 'paid'::"text") AND ("p2"."deleted_at" IS NULL)))) THEN 'Lunas'::"public"."payment_visibility_status"
                    ELSE 'Belum Lunas'::"public"."payment_visibility_status"
                END AS "status"
           FROM (("public"."santri" "s"
             JOIN "public"."class_memberships" "cm" ON ((("cm"."santri_id" = "s"."id") AND ("cm"."status" = 'active'::"text"))))
             LEFT JOIN "public"."payments" "p" ON ((("p"."santri_id" = "s"."id") AND ("p"."deleted_at" IS NULL))))) "summary"
  WHERE ("public"."is_admin"() OR "public"."user_owns_santri_record"("santri_id") OR "public"."guru_has_class_access"("class_id"));


ALTER VIEW "public"."payment_status_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pentashih_class_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pentashih_id" "uuid" NOT NULL,
    "class_id" "uuid",
    "scope" "text" DEFAULT 'class'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "starts_at" "date",
    "ends_at" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "mmq_schedule_id" "uuid",
    CONSTRAINT "pentashih_assignments_scope_check" CHECK (("scope" = ANY (ARRAY['class'::"text", 'mmq'::"text", 'both'::"text"]))),
    CONSTRAINT "pentashih_assignments_scope_target_check" CHECK (((("scope" = 'class'::"text") AND ("class_id" IS NOT NULL) AND ("mmq_schedule_id" IS NULL)) OR (("scope" = 'mmq'::"text") AND ("class_id" IS NULL) AND ("mmq_schedule_id" IS NOT NULL)) OR (("scope" = 'both'::"text") AND ("class_id" IS NOT NULL) AND ("mmq_schedule_id" IS NOT NULL)))),
    CONSTRAINT "pentashih_class_assignments_date_order" CHECK ((("ends_at" IS NULL) OR ("starts_at" IS NULL) OR ("ends_at" >= "starts_at")))
);


ALTER TABLE "public"."pentashih_class_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."santri_behavior_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "santri_id" "uuid" NOT NULL,
    "guru_id" "uuid",
    "incident_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "level" "text" NOT NULL,
    "behavior" "text" NOT NULL,
    "follow_up" "text" NOT NULL,
    "teacher_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "santri_behavior_records_behavior_not_blank" CHECK (("length"("btrim"("behavior")) > 0)),
    CONSTRAINT "santri_behavior_records_follow_up_not_blank" CHECK (("length"("btrim"("follow_up")) > 0)),
    CONSTRAINT "santri_behavior_records_level_check" CHECK (("level" = ANY (ARRAY['Ringan'::"text", 'Sedang'::"text", 'Berat'::"text"])))
);


ALTER TABLE "public"."santri_behavior_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."santri_character_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "santri_id" "uuid" NOT NULL,
    "item_id" smallint NOT NULL,
    "score" smallint NOT NULL,
    "assessed_by" "uuid",
    "assessed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "santri_character_scores_score_check" CHECK ((("score" >= 1) AND ("score" <= 4)))
);


ALTER TABLE "public"."santri_character_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."santri_character_strengths" (
    "santri_id" "uuid" NOT NULL,
    "strength_key" "text" NOT NULL,
    "selected_by" "uuid",
    "selected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "santri_character_strengths_key_check" CHECK (("strength_key" = ANY (ARRAY['Disiplin'::"text", 'Jujur'::"text", 'Mandiri'::"text", 'Percaya Diri'::"text", 'Bertanggung Jawab'::"text", 'Sopan Santun'::"text", 'Peduli'::"text", 'Rajin Beribadah'::"text", 'Semangat Belajar'::"text", 'Gemar Membaca Al-Qur''an'::"text"])))
);


ALTER TABLE "public"."santri_character_strengths" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."santri_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "santri_id" "uuid" NOT NULL,
    "guru_id" "uuid",
    "note" "text" NOT NULL,
    "visibility" "text" DEFAULT 'internal'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "santri_notes_note_not_blank" CHECK (("length"("btrim"("note")) > 0)),
    CONSTRAINT "santri_notes_visibility_check" CHECK (("visibility" = ANY (ARRAY['internal'::"text", 'admin_only'::"text"])))
);


ALTER TABLE "public"."santri_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "display_name" "text",
    "email" "text",
    "phone" "text",
    "status" "public"."account_status" DEFAULT 'active'::"public"."account_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "user_profiles_display_name_not_blank" CHECK ((("display_name" IS NULL) OR ("length"("btrim"("display_name")) > 0))),
    CONSTRAINT "user_profiles_email_not_blank" CHECK ((("email" IS NULL) OR ("length"("btrim"("email")) > 0)))
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."website_content" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_public" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    CONSTRAINT "website_content_key_not_blank" CHECK (("length"("btrim"("key")) > 0))
);


ALTER TABLE "public"."website_content" OWNER TO "postgres";


ALTER TABLE ONLY "public"."academic_calendar"
    ADD CONSTRAINT "academic_calendar_date_key" UNIQUE ("date");



ALTER TABLE ONLY "public"."academic_calendar"
    ADD CONSTRAINT "academic_calendar_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auth_login_aliases"
    ADD CONSTRAINT "auth_login_aliases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auth_rate_limits"
    ADD CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."character_assessment_items"
    ADD CONSTRAINT "character_assessment_items_item_name_key" UNIQUE ("item_name");



ALTER TABLE ONLY "public"."character_assessment_items"
    ADD CONSTRAINT "character_assessment_items_item_order_key" UNIQUE ("item_order");



ALTER TABLE ONLY "public"."character_assessment_items"
    ADD CONSTRAINT "character_assessment_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_memberships"
    ADD CONSTRAINT "class_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_mutations"
    ADD CONSTRAINT "class_mutations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedbacks"
    ADD CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guru"
    ADD CONSTRAINT "guru_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hafalan_items"
    ADD CONSTRAINT "hafalan_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hafalan_progress"
    ADD CONSTRAINT "hafalan_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jilid_history"
    ADD CONSTRAINT "jilid_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."login_logs"
    ADD CONSTRAINT "login_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media_player_settings"
    ADD CONSTRAINT "media_player_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mmq_attendance"
    ADD CONSTRAINT "mmq_attendance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mmq_notulensi"
    ADD CONSTRAINT "mmq_notulensi_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mmq_schedule"
    ADD CONSTRAINT "mmq_schedule_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."murojaah_submissions"
    ADD CONSTRAINT "murojaah_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."music_files"
    ADD CONSTRAINT "music_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news"
    ADD CONSTRAINT "news_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news"
    ADD CONSTRAINT "news_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pentashih_class_assignments"
    ADD CONSTRAINT "pentashih_class_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."santri_behavior_records"
    ADD CONSTRAINT "santri_behavior_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."santri_character_scores"
    ADD CONSTRAINT "santri_character_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."santri_character_scores"
    ADD CONSTRAINT "santri_character_scores_santri_item_unique" UNIQUE ("santri_id", "item_id");



ALTER TABLE ONLY "public"."santri_character_strengths"
    ADD CONSTRAINT "santri_character_strengths_pkey" PRIMARY KEY ("santri_id", "strength_key");



ALTER TABLE ONLY "public"."santri_notes"
    ADD CONSTRAINT "santri_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."santri"
    ADD CONSTRAINT "santri_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."website_content"
    ADD CONSTRAINT "website_content_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."website_content"
    ADD CONSTRAINT "website_content_pkey" PRIMARY KEY ("id");



CREATE INDEX "academic_calendar_event_type_idx" ON "public"."academic_calendar" USING "btree" ("event_type");



CREATE INDEX "academic_calendar_public_idx" ON "public"."academic_calendar" USING "btree" ("is_public");



CREATE INDEX "announcements_published_at_idx" ON "public"."announcements" USING "btree" ("published_at");



CREATE INDEX "announcements_published_status_idx" ON "public"."announcements" USING "btree" ("status", "published_at");



CREATE INDEX "announcements_status_idx" ON "public"."announcements" USING "btree" ("status");



CREATE INDEX "attendance_attended_session_idx" ON "public"."attendance" USING "btree" ("attended_session") WHERE ("role" = 'santri'::"public"."app_role");



CREATE INDEX "attendance_class_date_idx" ON "public"."attendance" USING "btree" ("class_id", "attendance_date");



CREATE INDEX "attendance_class_id_idx" ON "public"."attendance" USING "btree" ("class_id");



CREATE INDEX "attendance_date_idx" ON "public"."attendance" USING "btree" ("attendance_date");



CREATE INDEX "attendance_role_date_idx" ON "public"."attendance" USING "btree" ("role", "attendance_date");



CREATE UNIQUE INDEX "attendance_user_date_sesi_unique" ON "public"."attendance" USING "btree" ("user_id", "attendance_date", COALESCE("sesi", ''::"text")) WHERE ("source" <> 'import'::"text");



CREATE INDEX "attendance_user_id_idx" ON "public"."attendance" USING "btree" ("user_id");



CREATE INDEX "auth_login_aliases_active_idx" ON "public"."auth_login_aliases" USING "btree" ("is_active");



CREATE UNIQUE INDEX "auth_login_aliases_active_user_unique" ON "public"."auth_login_aliases" USING "btree" ("auth_user_id") WHERE "is_active";



CREATE UNIQUE INDEX "auth_login_aliases_type_normalized_unique" ON "public"."auth_login_aliases" USING "btree" ("alias_type", "normalized_alias");



CREATE INDEX "auth_rate_limits_blocked_until_idx" ON "public"."auth_rate_limits" USING "btree" ("blocked_until");



CREATE UNIQUE INDEX "auth_rate_limits_purpose_ip_alias_unique" ON "public"."auth_rate_limits" USING "btree" ("purpose", "ip_hash", "alias_hash");



CREATE INDEX "class_memberships_class_id_idx" ON "public"."class_memberships" USING "btree" ("class_id");



CREATE INDEX "class_memberships_class_status_idx" ON "public"."class_memberships" USING "btree" ("class_id", "status");



CREATE UNIQUE INDEX "class_memberships_one_active_per_santri" ON "public"."class_memberships" USING "btree" ("santri_id") WHERE ("status" = 'active'::"text");



CREATE INDEX "class_memberships_santri_id_idx" ON "public"."class_memberships" USING "btree" ("santri_id");



CREATE INDEX "classes_active_idx" ON "public"."classes" USING "btree" ("is_active");



CREATE INDEX "classes_id_guru_idx" ON "public"."classes" USING "btree" ("id_guru");



CREATE INDEX "expenses_kategori_idx" ON "public"."expenses" USING "btree" ("kategori");



CREATE INDEX "expenses_tanggal_idx" ON "public"."expenses" USING "btree" ("tanggal_pengeluaran");



CREATE INDEX "feedbacks_status_idx" ON "public"."feedbacks" USING "btree" ("status");



CREATE UNIQUE INDEX "guru_email_unique" ON "public"."guru" USING "btree" ("lower"("email")) WHERE ("email" IS NOT NULL);



CREATE UNIQUE INDEX "guru_rfid_tag_unique" ON "public"."guru" USING "btree" ("rfid_tag") WHERE ("rfid_tag" IS NOT NULL);



CREATE INDEX "guru_roles_gin_idx" ON "public"."guru" USING "gin" ("roles");



CREATE INDEX "guru_status_idx" ON "public"."guru" USING "btree" ("status");



CREATE INDEX "hafalan_items_category_jilid_idx" ON "public"."hafalan_items" USING "btree" ("category", "jilid");



CREATE INDEX "hafalan_items_order_idx" ON "public"."hafalan_items" USING "btree" ("item_order");



CREATE INDEX "hafalan_items_program_scope_category_idx" ON "public"."hafalan_items" USING "btree" ("program_scope", "category", "jilid", "item_order") WHERE "is_active";



CREATE INDEX "hafalan_progress_assessed_by_idx" ON "public"."hafalan_progress" USING "btree" ("assessed_by");



CREATE INDEX "hafalan_progress_santri_idx" ON "public"."hafalan_progress" USING "btree" ("santri_id");



CREATE UNIQUE INDEX "hafalan_progress_santri_item_unique" ON "public"."hafalan_progress" USING "btree" ("santri_id", "item_id") WHERE ("item_id" IS NOT NULL);



CREATE INDEX "hafalan_progress_santri_status_idx" ON "public"."hafalan_progress" USING "btree" ("santri_id", "status");



CREATE INDEX "jilid_history_changed_at_idx" ON "public"."jilid_history" USING "btree" ("changed_at" DESC);



CREATE INDEX "jilid_history_santri_changed_at_idx" ON "public"."jilid_history" USING "btree" ("santri_id", "changed_at" DESC);



CREATE INDEX "login_logs_created_at_idx" ON "public"."login_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "login_logs_status_idx" ON "public"."login_logs" USING "btree" ("status");



CREATE UNIQUE INDEX "media_player_settings_user_unique" ON "public"."media_player_settings" USING "btree" ("user_id");



CREATE INDEX "mmq_attendance_date_idx" ON "public"."mmq_attendance" USING "btree" ("attendance_date");



CREATE INDEX "mmq_attendance_guru_idx" ON "public"."mmq_attendance" USING "btree" ("guru_id");



CREATE UNIQUE INDEX "mmq_attendance_schedule_guru_date_unique" ON "public"."mmq_attendance" USING "btree" ("schedule_id", "guru_id", "attendance_date");



CREATE INDEX "mmq_notulensi_schedule_idx" ON "public"."mmq_notulensi" USING "btree" ("schedule_id");



CREATE INDEX "mmq_notulensi_tanggal_idx" ON "public"."mmq_notulensi" USING "btree" ("tanggal");



CREATE INDEX "mmq_schedule_active_idx" ON "public"."mmq_schedule" USING "btree" ("is_active");



CREATE INDEX "murojaah_submissions_santri_idx" ON "public"."murojaah_submissions" USING "btree" ("santri_id");



CREATE INDEX "murojaah_submissions_santri_status_idx" ON "public"."murojaah_submissions" USING "btree" ("santri_id", "status");



CREATE INDEX "murojaah_submissions_status_idx" ON "public"."murojaah_submissions" USING "btree" ("status");



CREATE INDEX "murojaah_submissions_target_guru_idx" ON "public"."murojaah_submissions" USING "btree" ("target_guru_id");



CREATE INDEX "news_published_at_idx" ON "public"."news" USING "btree" ("published_at");



CREATE INDEX "news_published_status_idx" ON "public"."news" USING "btree" ("status", "published_at");



CREATE INDEX "news_status_idx" ON "public"."news" USING "btree" ("status");



CREATE INDEX "notifications_read_idx" ON "public"."notifications" USING "btree" ("recipient_id", "is_read");



CREATE INDEX "notifications_recipient_idx" ON "public"."notifications" USING "btree" ("recipient_id");



CREATE UNIQUE INDEX "payments_active_santri_bulan_tahun_unique" ON "public"."payments" USING "btree" ("santri_id", "bulan", "tahun") WHERE (("deleted_at" IS NULL) AND ("bulan" IS NOT NULL) AND ("tahun" IS NOT NULL));



CREATE INDEX "payments_santri_id_idx" ON "public"."payments" USING "btree" ("santri_id");



CREATE INDEX "payments_santri_month_year_idx" ON "public"."payments" USING "btree" ("santri_id", "tahun", "bulan");



CREATE INDEX "payments_tanggal_idx" ON "public"."payments" USING "btree" ("tanggal_pembayaran");



CREATE UNIQUE INDEX "payments_transaction_id_unique" ON "public"."payments" USING "btree" ("transaction_id") WHERE ("transaction_id" IS NOT NULL);



CREATE INDEX "payments_year_month_idx" ON "public"."payments" USING "btree" ("tahun", "bulan");



CREATE UNIQUE INDEX "pentashih_assignments_active_scope_unique" ON "public"."pentashih_class_assignments" USING "btree" ("pentashih_id", COALESCE("class_id", '00000000-0000-0000-0000-000000000000'::"uuid"), COALESCE("mmq_schedule_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "scope") WHERE "is_active";



CREATE INDEX "pentashih_assignments_mmq_schedule_idx" ON "public"."pentashih_class_assignments" USING "btree" ("mmq_schedule_id");



CREATE UNIQUE INDEX "pentashih_class_assignments_active_unique" ON "public"."pentashih_class_assignments" USING "btree" ("pentashih_id", "class_id") WHERE "is_active";



CREATE INDEX "pentashih_class_assignments_class_idx" ON "public"."pentashih_class_assignments" USING "btree" ("class_id");



CREATE INDEX "pentashih_class_assignments_pentashih_idx" ON "public"."pentashih_class_assignments" USING "btree" ("pentashih_id");



CREATE INDEX "santri_archive_status_idx" ON "public"."santri" USING "btree" ("deleted_at", "status", "kategori");



CREATE INDEX "santri_behavior_records_santri_date_idx" ON "public"."santri_behavior_records" USING "btree" ("santri_id", "incident_date" DESC);



CREATE INDEX "santri_character_scores_santri_idx" ON "public"."santri_character_scores" USING "btree" ("santri_id");



CREATE INDEX "santri_current_class_id_idx" ON "public"."santri" USING "btree" ("current_class_id");



CREATE INDEX "santri_kategori_idx" ON "public"."santri" USING "btree" ("kategori");



CREATE UNIQUE INDEX "santri_nomor_induk_qiroati_unique" ON "public"."santri" USING "btree" ("nomor_induk_qiroati");



CREATE INDEX "santri_notes_guru_idx" ON "public"."santri_notes" USING "btree" ("guru_id");



CREATE INDEX "santri_notes_santri_idx" ON "public"."santri_notes" USING "btree" ("santri_id");



CREATE UNIQUE INDEX "santri_rfid_tag_unique" ON "public"."santri" USING "btree" ("rfid_tag") WHERE ("rfid_tag" IS NOT NULL);



CREATE INDEX "santri_status_idx" ON "public"."santri" USING "btree" ("status");



CREATE INDEX "santri_tanggal_pendaftaran_idx" ON "public"."santri" USING "btree" ("tanggal_pendaftaran");



CREATE UNIQUE INDEX "user_profiles_email_unique" ON "public"."user_profiles" USING "btree" ("lower"("email")) WHERE ("email" IS NOT NULL);



CREATE INDEX "user_profiles_role_idx" ON "public"."user_profiles" USING "btree" ("role");



CREATE INDEX "user_profiles_status_idx" ON "public"."user_profiles" USING "btree" ("status");



CREATE INDEX "website_content_public_idx" ON "public"."website_content" USING "btree" ("is_public");



CREATE OR REPLACE TRIGGER "set_academic_calendar_updated_at" BEFORE UPDATE ON "public"."academic_calendar" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_announcements_updated_at" BEFORE UPDATE ON "public"."announcements" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_attendance_updated_at" BEFORE UPDATE ON "public"."attendance" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_auth_login_aliases_updated_at" BEFORE UPDATE ON "public"."auth_login_aliases" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_auth_rate_limits_updated_at" BEFORE UPDATE ON "public"."auth_rate_limits" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_character_assessment_items_updated_at" BEFORE UPDATE ON "public"."character_assessment_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_class_memberships_updated_at" BEFORE UPDATE ON "public"."class_memberships" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_classes_updated_at" BEFORE UPDATE ON "public"."classes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_expenses_updated_at" BEFORE UPDATE ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_guru_updated_at" BEFORE UPDATE ON "public"."guru" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_hafalan_items_updated_at" BEFORE UPDATE ON "public"."hafalan_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_hafalan_progress_updated_at" BEFORE UPDATE ON "public"."hafalan_progress" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_mmq_attendance_updated_at" BEFORE UPDATE ON "public"."mmq_attendance" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_mmq_notulensi_updated_at" BEFORE UPDATE ON "public"."mmq_notulensi" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_mmq_schedule_updated_at" BEFORE UPDATE ON "public"."mmq_schedule" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_murojaah_submissions_updated_at" BEFORE UPDATE ON "public"."murojaah_submissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_news_updated_at" BEFORE UPDATE ON "public"."news" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_pentashih_class_assignments_updated_at" BEFORE UPDATE ON "public"."pentashih_class_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_santri_behavior_records_updated_at" BEFORE UPDATE ON "public"."santri_behavior_records" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_santri_character_scores_updated_at" BEFORE UPDATE ON "public"."santri_character_scores" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_santri_notes_updated_at" BEFORE UPDATE ON "public"."santri_notes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_santri_updated_at" BEFORE UPDATE ON "public"."santri" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_user_profiles_updated_at" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_website_content_updated_at" BEFORE UPDATE ON "public"."website_content" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "sync_hafalan_status_from_score" BEFORE INSERT OR UPDATE OF "score", "status" ON "public"."hafalan_progress" FOR EACH ROW EXECUTE FUNCTION "public"."sync_hafalan_status_from_score"();



ALTER TABLE ONLY "public"."academic_calendar"
    ADD CONSTRAINT "academic_calendar_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."academic_calendar"
    ADD CONSTRAINT "academic_calendar_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."announcements"
    ADD CONSTRAINT "announcements_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_corrected_by_fkey" FOREIGN KEY ("corrected_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."attendance"
    ADD CONSTRAINT "attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."auth_login_aliases"
    ADD CONSTRAINT "auth_login_aliases_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_memberships"
    ADD CONSTRAINT "class_memberships_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_memberships"
    ADD CONSTRAINT "class_memberships_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."class_memberships"
    ADD CONSTRAINT "class_memberships_santri_id_fkey" FOREIGN KEY ("santri_id") REFERENCES "public"."santri"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_memberships"
    ADD CONSTRAINT "class_memberships_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."class_mutations"
    ADD CONSTRAINT "class_mutations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."class_mutations"
    ADD CONSTRAINT "class_mutations_from_class_id_fkey" FOREIGN KEY ("from_class_id") REFERENCES "public"."classes"("id");



ALTER TABLE ONLY "public"."class_mutations"
    ADD CONSTRAINT "class_mutations_santri_id_fkey" FOREIGN KEY ("santri_id") REFERENCES "public"."santri"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_mutations"
    ADD CONSTRAINT "class_mutations_to_class_id_fkey" FOREIGN KEY ("to_class_id") REFERENCES "public"."classes"("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_id_guru_fkey" FOREIGN KEY ("id_guru") REFERENCES "public"."guru"("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."feedbacks"
    ADD CONSTRAINT "feedbacks_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."guru"
    ADD CONSTRAINT "guru_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."guru"
    ADD CONSTRAINT "guru_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."guru"
    ADD CONSTRAINT "guru_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."hafalan_progress"
    ADD CONSTRAINT "hafalan_progress_assessed_by_fkey" FOREIGN KEY ("assessed_by") REFERENCES "public"."guru"("id");



ALTER TABLE ONLY "public"."hafalan_progress"
    ADD CONSTRAINT "hafalan_progress_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."hafalan_progress"
    ADD CONSTRAINT "hafalan_progress_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."hafalan_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hafalan_progress"
    ADD CONSTRAINT "hafalan_progress_santri_id_fkey" FOREIGN KEY ("santri_id") REFERENCES "public"."santri"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hafalan_progress"
    ADD CONSTRAINT "hafalan_progress_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."jilid_history"
    ADD CONSTRAINT "jilid_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jilid_history"
    ADD CONSTRAINT "jilid_history_santri_id_fkey" FOREIGN KEY ("santri_id") REFERENCES "public"."santri"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."login_logs"
    ADD CONSTRAINT "login_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."media_player_settings"
    ADD CONSTRAINT "media_player_settings_current_track_id_fkey" FOREIGN KEY ("current_track_id") REFERENCES "public"."music_files"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."media_player_settings"
    ADD CONSTRAINT "media_player_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mmq_attendance"
    ADD CONSTRAINT "mmq_attendance_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."mmq_attendance"
    ADD CONSTRAINT "mmq_attendance_guru_id_fkey" FOREIGN KEY ("guru_id") REFERENCES "public"."guru"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mmq_attendance"
    ADD CONSTRAINT "mmq_attendance_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."mmq_schedule"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mmq_attendance"
    ADD CONSTRAINT "mmq_attendance_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."mmq_notulensi"
    ADD CONSTRAINT "mmq_notulensi_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."mmq_notulensi"
    ADD CONSTRAINT "mmq_notulensi_notulen_id_fkey" FOREIGN KEY ("notulen_id") REFERENCES "public"."guru"("id");



ALTER TABLE ONLY "public"."mmq_notulensi"
    ADD CONSTRAINT "mmq_notulensi_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."mmq_schedule"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mmq_notulensi"
    ADD CONSTRAINT "mmq_notulensi_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."mmq_schedule"
    ADD CONSTRAINT "mmq_schedule_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."mmq_schedule"
    ADD CONSTRAINT "mmq_schedule_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."murojaah_submissions"
    ADD CONSTRAINT "murojaah_submissions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."murojaah_submissions"
    ADD CONSTRAINT "murojaah_submissions_santri_id_fkey" FOREIGN KEY ("santri_id") REFERENCES "public"."santri"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."murojaah_submissions"
    ADD CONSTRAINT "murojaah_submissions_target_guru_id_fkey" FOREIGN KEY ("target_guru_id") REFERENCES "public"."guru"("id");



ALTER TABLE ONLY "public"."murojaah_submissions"
    ADD CONSTRAINT "murojaah_submissions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."music_files"
    ADD CONSTRAINT "music_files_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."music_files"
    ADD CONSTRAINT "music_files_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."news"
    ADD CONSTRAINT "news_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."news"
    ADD CONSTRAINT "news_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_santri_id_fkey" FOREIGN KEY ("santri_id") REFERENCES "public"."santri"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."pentashih_class_assignments"
    ADD CONSTRAINT "pentashih_assignments_mmq_schedule_fkey" FOREIGN KEY ("mmq_schedule_id") REFERENCES "public"."mmq_schedule"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pentashih_class_assignments"
    ADD CONSTRAINT "pentashih_class_assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pentashih_class_assignments"
    ADD CONSTRAINT "pentashih_class_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."pentashih_class_assignments"
    ADD CONSTRAINT "pentashih_class_assignments_pentashih_id_fkey" FOREIGN KEY ("pentashih_id") REFERENCES "public"."guru"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pentashih_class_assignments"
    ADD CONSTRAINT "pentashih_class_assignments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."santri"
    ADD CONSTRAINT "santri_archived_by_fkey" FOREIGN KEY ("archived_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."santri_behavior_records"
    ADD CONSTRAINT "santri_behavior_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."santri_behavior_records"
    ADD CONSTRAINT "santri_behavior_records_guru_id_fkey" FOREIGN KEY ("guru_id") REFERENCES "public"."guru"("id");



ALTER TABLE ONLY "public"."santri_behavior_records"
    ADD CONSTRAINT "santri_behavior_records_santri_id_fkey" FOREIGN KEY ("santri_id") REFERENCES "public"."santri"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."santri_behavior_records"
    ADD CONSTRAINT "santri_behavior_records_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."santri_character_scores"
    ADD CONSTRAINT "santri_character_scores_assessed_by_fkey" FOREIGN KEY ("assessed_by") REFERENCES "public"."guru"("id");



ALTER TABLE ONLY "public"."santri_character_scores"
    ADD CONSTRAINT "santri_character_scores_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."santri_character_scores"
    ADD CONSTRAINT "santri_character_scores_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."character_assessment_items"("id");



ALTER TABLE ONLY "public"."santri_character_scores"
    ADD CONSTRAINT "santri_character_scores_santri_id_fkey" FOREIGN KEY ("santri_id") REFERENCES "public"."santri"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."santri_character_scores"
    ADD CONSTRAINT "santri_character_scores_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."santri_character_strengths"
    ADD CONSTRAINT "santri_character_strengths_santri_id_fkey" FOREIGN KEY ("santri_id") REFERENCES "public"."santri"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."santri_character_strengths"
    ADD CONSTRAINT "santri_character_strengths_selected_by_fkey" FOREIGN KEY ("selected_by") REFERENCES "public"."guru"("id");



ALTER TABLE ONLY "public"."santri"
    ADD CONSTRAINT "santri_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."santri"
    ADD CONSTRAINT "santri_current_class_id_fkey" FOREIGN KEY ("current_class_id") REFERENCES "public"."classes"("id");



ALTER TABLE ONLY "public"."santri"
    ADD CONSTRAINT "santri_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."santri_notes"
    ADD CONSTRAINT "santri_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."santri_notes"
    ADD CONSTRAINT "santri_notes_guru_id_fkey" FOREIGN KEY ("guru_id") REFERENCES "public"."guru"("id");



ALTER TABLE ONLY "public"."santri_notes"
    ADD CONSTRAINT "santri_notes_santri_id_fkey" FOREIGN KEY ("santri_id") REFERENCES "public"."santri"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."santri_notes"
    ADD CONSTRAINT "santri_notes_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."santri"
    ADD CONSTRAINT "santri_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."website_content"
    ADD CONSTRAINT "website_content_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."website_content"
    ADD CONSTRAINT "website_content_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE "public"."academic_calendar" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "academic_calendar_admin_all" ON "public"."academic_calendar" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "academic_calendar_anon_select_public" ON "public"."academic_calendar" FOR SELECT TO "anon" USING ("is_public");



CREATE POLICY "academic_calendar_authenticated_select" ON "public"."academic_calendar" FOR SELECT TO "authenticated" USING (("is_public" OR "public"."is_admin"() OR "public"."is_guru"() OR "public"."is_santri"() OR "public"."is_pentashih"()));



ALTER TABLE "public"."announcements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "announcements_admin_all" ON "public"."announcements" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "announcements_anon_select_published" ON "public"."announcements" FOR SELECT TO "anon" USING ((("status" = 'published'::"text") AND (("valid_until" IS NULL) OR ("valid_until" >= CURRENT_DATE))));



CREATE POLICY "announcements_authenticated_select_published" ON "public"."announcements" FOR SELECT TO "authenticated" USING (((("status" = 'published'::"text") AND (("valid_until" IS NULL) OR ("valid_until" >= CURRENT_DATE))) OR "public"."is_admin"()));



ALTER TABLE "public"."attendance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendance_admin_all" ON "public"."attendance" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "attendance_insert_update_guru_scope" ON "public"."attendance" TO "authenticated" USING (("public"."is_admin"() OR (("class_id" IS NOT NULL) AND "public"."guru_has_class_access"("class_id")))) WITH CHECK (("public"."is_admin"() OR (("class_id" IS NOT NULL) AND "public"."guru_has_class_access"("class_id"))));



CREATE POLICY "attendance_select_scope" ON "public"."attendance" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("user_id" = "auth"."uid"()) OR (("class_id" IS NOT NULL) AND "public"."guru_has_class_access"("class_id")) OR (("class_id" IS NOT NULL) AND "public"."pentashih_has_class_access"("class_id"))));



ALTER TABLE "public"."auth_login_aliases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."auth_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."character_assessment_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "character_assessment_items_admin_all" ON "public"."character_assessment_items" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "character_assessment_items_authenticated_select" ON "public"."character_assessment_items" FOR SELECT TO "authenticated" USING (("is_active" OR "public"."is_admin"()));



ALTER TABLE "public"."class_memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "class_memberships_admin_all" ON "public"."class_memberships" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "class_memberships_select_scope" ON "public"."class_memberships" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("santri_id" = "auth"."uid"()) OR "public"."guru_has_class_access"("class_id") OR "public"."pentashih_has_class_access"("class_id")));



ALTER TABLE "public"."class_mutations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "class_mutations_admin_all" ON "public"."class_mutations" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "class_mutations_select_scope" ON "public"."class_mutations" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("santri_id" = "auth"."uid"()) OR "public"."guru_has_santri_access"("santri_id") OR "public"."pentashih_has_santri_access"("santri_id")));



ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "classes_admin_all" ON "public"."classes" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "classes_select_scope" ON "public"."classes" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("id_guru" = "auth"."uid"()) OR "public"."pentashih_has_class_access"("id") OR (EXISTS ( SELECT 1
   FROM "public"."class_memberships" "cm"
  WHERE (("cm"."class_id" = "classes"."id") AND ("cm"."santri_id" = "auth"."uid"()) AND ("cm"."status" = 'active'::"text"))))));



ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses_admin_all" ON "public"."expenses" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."feedbacks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feedbacks_admin_all" ON "public"."feedbacks" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "feedbacks_anon_insert" ON "public"."feedbacks" FOR INSERT TO "anon" WITH CHECK (true);



ALTER TABLE "public"."guru" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "guru_admin_all" ON "public"."guru" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "guru_select_scope" ON "public"."guru" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."classes" "c"
     JOIN "public"."class_memberships" "cm" ON ((("cm"."class_id" = "c"."id") AND ("cm"."status" = 'active'::"text"))))
  WHERE (("c"."id_guru" = "guru"."id") AND ("cm"."santri_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."classes" "c"
  WHERE (("c"."id_guru" = "guru"."id") AND "public"."pentashih_has_class_access"("c"."id"))))));



ALTER TABLE "public"."hafalan_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hafalan_items_admin_all" ON "public"."hafalan_items" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "hafalan_items_authenticated_select" ON "public"."hafalan_items" FOR SELECT TO "authenticated" USING (("is_active" OR "public"."is_admin"()));



ALTER TABLE "public"."hafalan_progress" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hafalan_progress_admin_all" ON "public"."hafalan_progress" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "hafalan_progress_guru_update_scope" ON "public"."hafalan_progress" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR "public"."guru_has_santri_access"("santri_id"))) WITH CHECK (("public"."is_admin"() OR "public"."guru_has_santri_access"("santri_id")));



CREATE POLICY "hafalan_progress_guru_write_scope" ON "public"."hafalan_progress" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR "public"."guru_has_santri_access"("santri_id")));



CREATE POLICY "hafalan_progress_select_scope" ON "public"."hafalan_progress" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("santri_id" = "auth"."uid"()) OR "public"."guru_has_santri_access"("santri_id") OR "public"."pentashih_has_santri_access"("santri_id")));



ALTER TABLE "public"."jilid_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "jilid_history_admin_delete" ON "public"."jilid_history" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "jilid_history_admin_update" ON "public"."jilid_history" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "jilid_history_scoped_insert" ON "public"."jilid_history" FOR INSERT TO "authenticated" WITH CHECK ((("public"."is_admin"() OR "public"."guru_has_santri_access"("santri_id")) AND ("changed_by" = "auth"."uid"())));



CREATE POLICY "jilid_history_scoped_select" ON "public"."jilid_history" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR "public"."guru_has_santri_access"("santri_id") OR "public"."pentashih_has_santri_access"("santri_id") OR "public"."user_owns_santri_record"("santri_id")));



ALTER TABLE "public"."login_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "login_logs_admin_delete" ON "public"."login_logs" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "login_logs_admin_select" ON "public"."login_logs" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



ALTER TABLE "public"."media_player_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "media_player_settings_admin_select" ON "public"."media_player_settings" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "media_player_settings_owner_all" ON "public"."media_player_settings" TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."mmq_attendance" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mmq_attendance_admin_all" ON "public"."mmq_attendance" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "mmq_attendance_guru_insert_own" ON "public"."mmq_attendance" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR ("guru_id" = "auth"."uid"())));



CREATE POLICY "mmq_attendance_select_scope" ON "public"."mmq_attendance" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("guru_id" = "auth"."uid"()) OR "public"."pentashih_has_mmq_access"("schedule_id")));



ALTER TABLE "public"."mmq_notulensi" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mmq_notulensi_admin_all" ON "public"."mmq_notulensi" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "mmq_notulensi_notulen_insert" ON "public"."mmq_notulensi" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."guru" "g"
  WHERE (("g"."id" = "auth"."uid"()) AND "g"."is_notulen")))));



CREATE POLICY "mmq_notulensi_select_scope" ON "public"."mmq_notulensi" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR "public"."is_guru"() OR "public"."pentashih_has_mmq_access"("schedule_id")));



ALTER TABLE "public"."mmq_schedule" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mmq_schedule_admin_all" ON "public"."mmq_schedule" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "mmq_schedule_select_scope" ON "public"."mmq_schedule" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR "public"."is_guru"() OR "public"."pentashih_has_mmq_access"("id")));



CREATE POLICY "murojaah_admin_all" ON "public"."murojaah_submissions" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "murojaah_guru_update_scope" ON "public"."murojaah_submissions" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR ("target_guru_id" = "auth"."uid"()) OR "public"."guru_has_santri_access"("santri_id"))) WITH CHECK (("public"."is_admin"() OR ("target_guru_id" = "auth"."uid"()) OR "public"."guru_has_santri_access"("santri_id")));



CREATE POLICY "murojaah_santri_insert_own" ON "public"."murojaah_submissions" FOR INSERT TO "authenticated" WITH CHECK ((("santri_id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "murojaah_select_scope" ON "public"."murojaah_submissions" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("santri_id" = "auth"."uid"()) OR ("target_guru_id" = "auth"."uid"()) OR "public"."guru_has_santri_access"("santri_id") OR "public"."pentashih_has_santri_access"("santri_id")));



ALTER TABLE "public"."murojaah_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."music_files" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "music_files_admin_all" ON "public"."music_files" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "music_files_public_read_active" ON "public"."music_files" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



ALTER TABLE "public"."news" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "news_admin_all" ON "public"."news" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "news_anon_select_published" ON "public"."news" FOR SELECT TO "anon" USING (("status" = 'published'::"text"));



CREATE POLICY "news_authenticated_select_published" ON "public"."news" FOR SELECT TO "authenticated" USING ((("status" = 'published'::"text") OR "public"."is_admin"()));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_admin_all" ON "public"."notifications" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "notifications_user_select_update_own" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("recipient_id" = "auth"."uid"()));



CREATE POLICY "notifications_user_update_own" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("recipient_id" = "auth"."uid"())) WITH CHECK (("recipient_id" = "auth"."uid"()));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_admin_all" ON "public"."payments" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "payments_santri_select_own" ON "public"."payments" FOR SELECT TO "authenticated" USING (("santri_id" = "auth"."uid"()));



CREATE POLICY "pentashih_assignments_admin_all" ON "public"."pentashih_class_assignments" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "pentashih_assignments_select_own" ON "public"."pentashih_class_assignments" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("pentashih_id" = "auth"."uid"())));



ALTER TABLE "public"."pentashih_class_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."santri" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "santri_admin_all" ON "public"."santri" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."santri_behavior_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "santri_behavior_records_admin_all" ON "public"."santri_behavior_records" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "santri_behavior_records_guru_insert_scope" ON "public"."santri_behavior_records" FOR INSERT TO "authenticated" WITH CHECK ("public"."guru_has_santri_access"("santri_id"));



CREATE POLICY "santri_behavior_records_guru_select_scope" ON "public"."santri_behavior_records" FOR SELECT TO "authenticated" USING ("public"."guru_has_santri_access"("santri_id"));



CREATE POLICY "santri_behavior_records_guru_update_scope" ON "public"."santri_behavior_records" FOR UPDATE TO "authenticated" USING ("public"."guru_has_santri_access"("santri_id")) WITH CHECK ("public"."guru_has_santri_access"("santri_id"));



ALTER TABLE "public"."santri_character_scores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "santri_character_scores_insert_scope" ON "public"."santri_character_scores" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR "public"."guru_has_santri_access"("santri_id")));



CREATE POLICY "santri_character_scores_select_scope" ON "public"."santri_character_scores" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("santri_id" = "auth"."uid"()) OR "public"."guru_has_santri_access"("santri_id") OR "public"."pentashih_has_santri_access"("santri_id")));



CREATE POLICY "santri_character_scores_update_scope" ON "public"."santri_character_scores" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR "public"."guru_has_santri_access"("santri_id"))) WITH CHECK (("public"."is_admin"() OR "public"."guru_has_santri_access"("santri_id")));



ALTER TABLE "public"."santri_character_strengths" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "santri_character_strengths_delete_scope" ON "public"."santri_character_strengths" FOR DELETE TO "authenticated" USING (("public"."is_admin"() OR "public"."guru_has_santri_access"("santri_id")));



CREATE POLICY "santri_character_strengths_insert_scope" ON "public"."santri_character_strengths" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR "public"."guru_has_santri_access"("santri_id")));



CREATE POLICY "santri_character_strengths_select_scope" ON "public"."santri_character_strengths" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("santri_id" = "auth"."uid"()) OR "public"."guru_has_santri_access"("santri_id") OR "public"."pentashih_has_santri_access"("santri_id")));



CREATE POLICY "santri_character_strengths_update_scope" ON "public"."santri_character_strengths" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR "public"."guru_has_santri_access"("santri_id"))) WITH CHECK (("public"."is_admin"() OR "public"."guru_has_santri_access"("santri_id")));



ALTER TABLE "public"."santri_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "santri_notes_admin_all" ON "public"."santri_notes" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "santri_notes_guru_update_scope" ON "public"."santri_notes" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR "public"."guru_has_santri_access"("santri_id"))) WITH CHECK (("public"."is_admin"() OR "public"."guru_has_santri_access"("santri_id")));



CREATE POLICY "santri_notes_guru_write_scope" ON "public"."santri_notes" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR "public"."guru_has_santri_access"("santri_id")));



CREATE POLICY "santri_notes_select_scope" ON "public"."santri_notes" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR "public"."guru_has_santri_access"("santri_id") OR "public"."pentashih_has_santri_access"("santri_id")));



CREATE POLICY "santri_select_scope" ON "public"."santri" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."guru_has_santri_access"("id") OR "public"."pentashih_has_santri_access"("id") OR "public"."is_admin"()));



ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_profiles_admin_all" ON "public"."user_profiles" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "user_profiles_select_own" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."website_content" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "website_content_admin_all" ON "public"."website_content" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "website_content_anon_select_public" ON "public"."website_content" FOR SELECT TO "anon" USING ("is_public");



CREATE POLICY "website_content_authenticated_select_public" ON "public"."website_content" FOR SELECT TO "authenticated" USING (("is_public" OR "public"."is_admin"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."change_santri_category"("p_santri_id" "uuid", "p_target_category" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."change_santri_category"("p_santri_id" "uuid", "p_target_category" "text", "p_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."change_santri_category"("p_santri_id" "uuid", "p_target_category" "text", "p_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."consume_auth_rate_limit"("p_purpose" "text", "p_ip_hash" "text", "p_alias_hash" "text", "p_max_attempts" integer, "p_window_seconds" integer, "p_block_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_auth_rate_limit"("p_purpose" "text", "p_ip_hash" "text", "p_alias_hash" "text", "p_max_attempts" integer, "p_window_seconds" integer, "p_block_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."consume_auth_rate_limit"("p_purpose" "text", "p_ip_hash" "text", "p_alias_hash" "text", "p_max_attempts" integer, "p_window_seconds" integer, "p_block_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_auth_rate_limit"("p_purpose" "text", "p_ip_hash" "text", "p_alias_hash" "text", "p_max_attempts" integer, "p_window_seconds" integer, "p_block_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guru_has_class_access"("target_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."guru_has_class_access"("target_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."guru_has_class_access"("target_class_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."guru_has_santri_access"("target_santri_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."guru_has_santri_access"("target_santri_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."guru_has_santri_access"("target_santri_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_guru"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_guru"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_guru"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_pentashih"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_pentashih"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_pentashih"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_santri"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_santri"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_santri"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."move_santri_to_class"("p_santri_id" "uuid", "p_to_class_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_santri_to_class"("p_santri_id" "uuid", "p_to_class_id" "uuid", "p_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."move_santri_to_class"("p_santri_id" "uuid", "p_to_class_id" "uuid", "p_reason" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."pentashih_has_class_access"("target_class_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pentashih_has_class_access"("target_class_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pentashih_has_class_access"("target_class_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."pentashih_has_mmq_access"("target_schedule_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pentashih_has_mmq_access"("target_schedule_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pentashih_has_mmq_access"("target_schedule_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."pentashih_has_santri_access"("target_santri_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pentashih_has_santri_access"("target_santri_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pentashih_has_santri_access"("target_santri_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_login_attempt"("p_username_attempt" "text", "p_status" "text", "p_role" "text", "p_device" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_login_attempt"("p_username_attempt" "text", "p_status" "text", "p_role" "text", "p_device" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_login_attempt"("p_username_attempt" "text", "p_status" "text", "p_role" "text", "p_device" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_login_attempt"("p_username_attempt" "text", "p_status" "text", "p_role" "text", "p_device" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_santri_archive_state"("p_santri_id" "uuid", "p_archived" boolean, "p_actor_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_santri_archive_state"("p_santri_id" "uuid", "p_archived" boolean, "p_actor_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."storage_avatar_santri_owner"("name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."storage_avatar_santri_owner"("name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."storage_avatar_santri_owner"("name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."storage_foldername"("name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."storage_foldername"("name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."storage_foldername"("name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_hafalan_status_from_score"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_hafalan_status_from_score"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_hafalan_status_from_score"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_owns_santri_record"("target_santri_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_owns_santri_record"("target_santri_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_owns_santri_record"("target_santri_id" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."academic_calendar" TO "anon";
GRANT ALL ON TABLE "public"."academic_calendar" TO "authenticated";
GRANT ALL ON TABLE "public"."academic_calendar" TO "service_role";



GRANT ALL ON TABLE "public"."announcements" TO "anon";
GRANT ALL ON TABLE "public"."announcements" TO "authenticated";
GRANT ALL ON TABLE "public"."announcements" TO "service_role";



GRANT ALL ON TABLE "public"."attendance" TO "anon";
GRANT ALL ON TABLE "public"."attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."attendance" TO "service_role";



GRANT ALL ON TABLE "public"."auth_login_aliases" TO "service_role";



GRANT ALL ON TABLE "public"."auth_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."character_assessment_items" TO "anon";
GRANT ALL ON TABLE "public"."character_assessment_items" TO "authenticated";
GRANT ALL ON TABLE "public"."character_assessment_items" TO "service_role";



GRANT ALL ON TABLE "public"."class_memberships" TO "anon";
GRANT ALL ON TABLE "public"."class_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."class_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."class_mutations" TO "anon";
GRANT ALL ON TABLE "public"."class_mutations" TO "authenticated";
GRANT ALL ON TABLE "public"."class_mutations" TO "service_role";



GRANT ALL ON TABLE "public"."classes" TO "anon";
GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."expenses" TO "authenticated";



GRANT ALL ON TABLE "public"."feedbacks" TO "anon";
GRANT ALL ON TABLE "public"."feedbacks" TO "authenticated";
GRANT ALL ON TABLE "public"."feedbacks" TO "service_role";



GRANT ALL ON TABLE "public"."guru" TO "anon";
GRANT ALL ON TABLE "public"."guru" TO "authenticated";
GRANT ALL ON TABLE "public"."guru" TO "service_role";



GRANT ALL ON TABLE "public"."hafalan_items" TO "anon";
GRANT ALL ON TABLE "public"."hafalan_items" TO "authenticated";
GRANT ALL ON TABLE "public"."hafalan_items" TO "service_role";



GRANT ALL ON TABLE "public"."hafalan_progress" TO "anon";
GRANT ALL ON TABLE "public"."hafalan_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."hafalan_progress" TO "service_role";



GRANT ALL ON TABLE "public"."jilid_history" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."jilid_history" TO "authenticated";



GRANT ALL ON TABLE "public"."login_logs" TO "service_role";
GRANT SELECT,DELETE ON TABLE "public"."login_logs" TO "authenticated";



GRANT ALL ON TABLE "public"."media_player_settings" TO "anon";
GRANT ALL ON TABLE "public"."media_player_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."media_player_settings" TO "service_role";



GRANT ALL ON TABLE "public"."mmq_attendance" TO "anon";
GRANT ALL ON TABLE "public"."mmq_attendance" TO "authenticated";
GRANT ALL ON TABLE "public"."mmq_attendance" TO "service_role";



GRANT ALL ON TABLE "public"."mmq_notulensi" TO "anon";
GRANT ALL ON TABLE "public"."mmq_notulensi" TO "authenticated";
GRANT ALL ON TABLE "public"."mmq_notulensi" TO "service_role";



GRANT ALL ON TABLE "public"."mmq_schedule" TO "anon";
GRANT ALL ON TABLE "public"."mmq_schedule" TO "authenticated";
GRANT ALL ON TABLE "public"."mmq_schedule" TO "service_role";



GRANT ALL ON TABLE "public"."murojaah_submissions" TO "anon";
GRANT ALL ON TABLE "public"."murojaah_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."murojaah_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."music_files" TO "anon";
GRANT ALL ON TABLE "public"."music_files" TO "authenticated";
GRANT ALL ON TABLE "public"."music_files" TO "service_role";



GRANT ALL ON TABLE "public"."news" TO "anon";
GRANT ALL ON TABLE "public"."news" TO "authenticated";
GRANT ALL ON TABLE "public"."news" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."payments" TO "authenticated";



GRANT ALL ON TABLE "public"."santri" TO "anon";
GRANT ALL ON TABLE "public"."santri" TO "authenticated";
GRANT ALL ON TABLE "public"."santri" TO "service_role";



GRANT ALL ON TABLE "public"."payment_status_summary" TO "anon";
GRANT ALL ON TABLE "public"."payment_status_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_status_summary" TO "service_role";



GRANT ALL ON TABLE "public"."pentashih_class_assignments" TO "anon";
GRANT ALL ON TABLE "public"."pentashih_class_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."pentashih_class_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."santri_behavior_records" TO "anon";
GRANT ALL ON TABLE "public"."santri_behavior_records" TO "authenticated";
GRANT ALL ON TABLE "public"."santri_behavior_records" TO "service_role";



GRANT ALL ON TABLE "public"."santri_character_scores" TO "anon";
GRANT ALL ON TABLE "public"."santri_character_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."santri_character_scores" TO "service_role";



GRANT ALL ON TABLE "public"."santri_character_strengths" TO "anon";
GRANT ALL ON TABLE "public"."santri_character_strengths" TO "authenticated";
GRANT ALL ON TABLE "public"."santri_character_strengths" TO "service_role";



GRANT ALL ON TABLE "public"."santri_notes" TO "anon";
GRANT ALL ON TABLE "public"."santri_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."santri_notes" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."website_content" TO "anon";
GRANT ALL ON TABLE "public"."website_content" TO "authenticated";
GRANT ALL ON TABLE "public"."website_content" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
