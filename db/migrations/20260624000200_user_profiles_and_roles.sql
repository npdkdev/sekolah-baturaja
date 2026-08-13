-- Logical migration: 0002_user_profiles_and_roles
-- Purpose: create canonical app profile and role source.
-- Dependencies: 20260624000100_extensions_and_types.sql, auth.users.
-- Safety: no credentials, no seed data, no production data.

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  display_name text,
  email text,
  phone text,
  status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint user_profiles_email_not_blank check (email is null or length(btrim(email)) > 0),
  constraint user_profiles_display_name_not_blank check (display_name is null or length(btrim(display_name)) > 0)
);

create unique index if not exists user_profiles_email_unique
  on public.user_profiles (lower(email))
  where email is not null;

create index if not exists user_profiles_role_idx on public.user_profiles(role);
create index if not exists user_profiles_status_idx on public.user_profiles(status);
