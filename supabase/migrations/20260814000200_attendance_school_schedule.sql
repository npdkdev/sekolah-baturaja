-- Logical migration: school teacher attendance schedule identity.
-- Purpose: connect guru attendance to jadwal_pelajaran, not mmq_schedule.
-- Safety: nullable columns preserve imported and legacy attendance records.

alter table public.attendance
  add column if not exists jadwal_pelajaran_id uuid
    references public.jadwal_pelajaran(id) on delete restrict;

alter table public.attendance
  add column if not exists mata_pelajaran_id uuid
    references public.mata_pelajaran(id) on delete restrict;

alter table public.attendance
  drop constraint if exists attendance_school_schedule_role_check;
alter table public.attendance
  add constraint attendance_school_schedule_role_check
  check (jadwal_pelajaran_id is null or role = 'guru'::public.app_role);

create index if not exists attendance_jadwal_pelajaran_idx
  on public.attendance(jadwal_pelajaran_id)
  where jadwal_pelajaran_id is not null;

create index if not exists attendance_mata_pelajaran_idx
  on public.attendance(mata_pelajaran_id)
  where mata_pelajaran_id is not null;

-- A teacher may have more than one lesson in the same named session. Keep the
-- legacy session uniqueness for rows without a school schedule, while making
-- schedule-backed attendance unique by its authoritative lesson identity.
drop index if exists public.attendance_user_date_sesi_unique;

create unique index if not exists attendance_legacy_user_date_sesi_unique
  on public.attendance(user_id, attendance_date, coalesce(sesi, ''))
  where jadwal_pelajaran_id is null
    and source <> 'import';

create unique index if not exists attendance_guru_schedule_unique
  on public.attendance(user_id, attendance_date, jadwal_pelajaran_id)
  where jadwal_pelajaran_id is not null
    and source <> 'import';
