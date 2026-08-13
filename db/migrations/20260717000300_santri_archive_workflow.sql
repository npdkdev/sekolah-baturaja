-- Preserve every santri relation while allowing administrators to archive and restore accounts.
-- This function is intentionally callable only by service_role through the authenticated manage-user Edge Function.

alter table public.santri
  add column if not exists archive_reason text,
  add column if not exists archived_by uuid references auth.users(id);

create index if not exists santri_archive_status_idx
  on public.santri (deleted_at, status, kategori);

create or replace function public.set_santri_archive_state(
  p_santri_id uuid,
  p_archived boolean,
  p_actor_id uuid,
  p_reason text default null
)
returns table (
  santri_id uuid,
  archived boolean,
  account_status text,
  current_class_id uuid
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
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

revoke all on function public.set_santri_archive_state(uuid, boolean, uuid, text) from public;
revoke all on function public.set_santri_archive_state(uuid, boolean, uuid, text) from anon;
revoke all on function public.set_santri_archive_state(uuid, boolean, uuid, text) from authenticated;
grant execute on function public.set_santri_archive_state(uuid, boolean, uuid, text) to service_role;

comment on function public.set_santri_archive_state(uuid, boolean, uuid, text) is
  'Archives or restores a santri account without deleting class, attendance, payment, memorization, character, or mutation history.';
