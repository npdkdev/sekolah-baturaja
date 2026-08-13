-- Logical migration: 0010_mmq_core
-- Purpose: create MMQ schedule, attendance, and notulensi tables.
-- Dependencies: 20260624000300_guru_santri_and_auth_aliases.sql.
-- Safety: this is the first migration that creates mmq_schedule.

create table if not exists public.mmq_schedule (
  id uuid primary key default gen_random_uuid(),
  day_of_week integer check (day_of_week between 0 and 6),
  start_time time,
  end_time time,
  location text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint mmq_schedule_time_order check (end_time is null or start_time is null or end_time > start_time)
);

create table if not exists public.mmq_attendance (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.mmq_schedule(id) on delete cascade,
  guru_id uuid not null references public.guru(id) on delete cascade,
  attendance_date date not null,
  check_in_timestamp timestamptz,
  status text not null default 'Hadir',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint mmq_attendance_status_not_blank check (length(btrim(status)) > 0)
);

create unique index if not exists mmq_attendance_schedule_guru_date_unique
  on public.mmq_attendance(schedule_id, guru_id, attendance_date);

create table if not exists public.mmq_notulensi (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.mmq_schedule(id) on delete cascade,
  tanggal date not null,
  judul text not null,
  isi text,
  notulen_id uuid references public.guru(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint mmq_notulensi_judul_not_blank check (length(btrim(judul)) > 0)
);

create index if not exists mmq_schedule_active_idx on public.mmq_schedule(is_active);
create index if not exists mmq_attendance_guru_idx on public.mmq_attendance(guru_id);
create index if not exists mmq_attendance_date_idx on public.mmq_attendance(attendance_date);
create index if not exists mmq_notulensi_schedule_idx on public.mmq_notulensi(schedule_id);
create index if not exists mmq_notulensi_tanggal_idx on public.mmq_notulensi(tanggal);
