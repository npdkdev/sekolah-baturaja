-- Logical migration: 0008_hafalan_and_murojaah
-- Purpose: create hafalan and murojaah learning tables.
-- Dependencies: 20260624000300_guru_santri_and_auth_aliases.sql.
-- Safety: no credentials, no seed data.

create table if not exists public.hafalan_items (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  jilid text,
  item_name text not null,
  item_order integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hafalan_items_category_not_blank check (length(btrim(category)) > 0),
  constraint hafalan_items_name_not_blank check (length(btrim(item_name)) > 0)
);

create table if not exists public.hafalan_progress (
  id uuid primary key default gen_random_uuid(),
  santri_id uuid not null references public.santri(id) on delete cascade,
  item_id uuid references public.hafalan_items(id) on delete set null,
  category text,
  item_name text,
  status text not null default 'belum',
  nilai text,
  catatan text,
  assessed_by uuid references public.guru(id),
  assessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint hafalan_progress_status_check check (status in ('belum', 'proses', 'lulus', 'ulang'))
);

create unique index if not exists hafalan_progress_santri_item_unique
  on public.hafalan_progress(santri_id, item_id)
  where item_id is not null;

create table if not exists public.murojaah_submissions (
  id uuid primary key default gen_random_uuid(),
  santri_id uuid not null references public.santri(id) on delete cascade,
  target_guru_id uuid references public.guru(id),
  type text,
  content text,
  recording_path text,
  status text not null default 'menunggu',
  feedback text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint murojaah_submissions_status_check check (status in ('menunggu', 'direview', 'diterima', 'perlu_perbaikan'))
);

create index if not exists hafalan_items_category_jilid_idx on public.hafalan_items(category, jilid);
create index if not exists hafalan_items_order_idx on public.hafalan_items(item_order);
create index if not exists hafalan_progress_santri_idx on public.hafalan_progress(santri_id);
create index if not exists hafalan_progress_assessed_by_idx on public.hafalan_progress(assessed_by);
create index if not exists murojaah_submissions_santri_idx on public.murojaah_submissions(santri_id);
create index if not exists murojaah_submissions_target_guru_idx on public.murojaah_submissions(target_guru_id);
create index if not exists murojaah_submissions_status_idx on public.murojaah_submissions(status);
