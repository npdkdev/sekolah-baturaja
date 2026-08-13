-- Logical migration: 0006_attendance
-- Purpose: create RFID attendance and correction records.
-- Dependencies: 20260624000400_classes_memberships_and_mutations.sql.
-- Safety: no credentials, no seed data.

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  attendance_date date not null,
  check_in_time time,
  check_in_timestamp timestamptz,
  class_id uuid references public.classes(id),
  sesi text,
  status text not null default 'Hadir',
  source text not null default 'rfid',
  correction_reason text,
  corrected_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint attendance_status_not_blank check (length(btrim(status)) > 0),
  constraint attendance_source_check check (source in ('rfid', 'manual', 'correction', 'import')),
  constraint attendance_correction_reason_required check (
    corrected_by is null or length(btrim(coalesce(correction_reason, ''))) > 0
  )
);

create unique index if not exists attendance_user_date_sesi_unique
  on public.attendance(user_id, attendance_date, coalesce(sesi, ''))
  where source <> 'import';

create index if not exists attendance_date_idx on public.attendance(attendance_date);
create index if not exists attendance_class_id_idx on public.attendance(class_id);
create index if not exists attendance_user_id_idx on public.attendance(user_id);
create index if not exists attendance_role_date_idx on public.attendance(role, attendance_date);
