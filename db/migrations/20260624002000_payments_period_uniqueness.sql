-- Purpose: enforce one active monthly payment per santri, month, and year.
-- Safety: fails before creating the index if duplicate active records already exist.

do $$
begin
  if exists (
    select 1
    from public.payments
    where deleted_at is null
      and bulan is not null
      and tahun is not null
    group by santri_id, bulan, tahun
    having count(*) > 1
  ) then
    raise exception
      'Duplicate active payments found for the same santri, bulan, and tahun. Review payment records manually before applying payments_active_santri_bulan_tahun_unique.';
  end if;
end
$$;

create unique index if not exists payments_active_santri_bulan_tahun_unique
  on public.payments (santri_id, bulan, tahun)
  where deleted_at is null
    and bulan is not null
    and tahun is not null;
