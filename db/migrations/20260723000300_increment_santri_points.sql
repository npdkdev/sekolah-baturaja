-- Atomically adjust santri points for the random-name, quiz, and gatcha flows.
-- Only administrators or the santri's assigned guru may make adjustments.

create or replace function public.increment_santri_points(
  p_santri_id uuid,
  p_amount integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_points integer;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if p_santri_id is null then
    raise exception 'SANTRI_ID_REQUIRED' using errcode = '22023';
  end if;

  if p_amount is null or p_amount = 0 or p_amount not between -1000 and 1000 then
    raise exception 'INVALID_POINT_AMOUNT' using errcode = '22023';
  end if;

  if not (
    public.is_admin()
    or (
      public.is_guru()
      and public.guru_has_santri_access(p_santri_id)
    )
  ) then
    raise exception 'POINT_ADJUSTMENT_FORBIDDEN' using errcode = '42501';
  end if;

  update public.santri
  set points = greatest(0, points + p_amount),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_santri_id
    and deleted_at is null
    and lower(coalesce(status, '')) in ('aktif', 'active')
  returning points into v_points;

  if v_points is null then
    raise exception 'ACTIVE_SANTRI_NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_points;
end;
$$;

revoke all on function public.increment_santri_points(uuid, integer) from public;
revoke all on function public.increment_santri_points(uuid, integer) from anon;
grant execute on function public.increment_santri_points(uuid, integer) to authenticated;
