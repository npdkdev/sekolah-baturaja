-- Logical migration: 0009_academic_calendar
-- Purpose: create academic calendar events.
-- Dependencies: 20260624000200_user_profiles_and_roles.sql.
-- Safety: no credentials, no seed data.

create table if not exists public.academic_calendar (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  title text not null,
  description text,
  is_holiday boolean not null default false,
  is_public boolean not null default true,
  event_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint academic_calendar_title_not_blank check (length(btrim(title)) > 0)
);

create index if not exists academic_calendar_public_idx on public.academic_calendar(is_public);
create index if not exists academic_calendar_event_type_idx on public.academic_calendar(event_type);
