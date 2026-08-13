-- Logical migration: 0001_extensions_and_types
-- Purpose: prepare extensions and shared constrained types.
-- Dependencies: none.
-- Safety: no credentials, no seed data, no production data.

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'guru', 'santri', 'pentashih');
  end if;

  if not exists (select 1 from pg_type where typname = 'account_status') then
    create type public.account_status as enum ('active', 'inactive', 'suspended');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_visibility_status') then
    create type public.payment_visibility_status as enum ('Lunas', 'Belum Lunas');
  end if;
end
$$;
