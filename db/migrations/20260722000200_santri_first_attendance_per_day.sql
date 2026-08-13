-- Preserve the first non-imported attendance record for each santri per day.
-- Historical imported snapshots remain excluded from this operational constraint.

create unique index attendance_santri_first_daily_unique
  on public.attendance (user_id, attendance_date)
  where role = 'santri'::public.app_role
    and source <> 'import';
