-- Logical migration: 0004_classes_memberships_and_mutations
-- Purpose: create class model, active memberships, and class mutation history.
-- Dependencies: 20260624000300_guru_santri_and_auth_aliases.sql.
-- Safety: no credentials, no seed data.

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  nama_kelas text not null,
  id_guru uuid references public.guru(id),
  sesi text,
  kategori text,
  sort_order integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint classes_nama_kelas_not_blank check (length(btrim(nama_kelas)) > 0)
);

alter table public.santri
  add constraint santri_current_class_id_fkey
  foreign key (current_class_id) references public.classes(id);

create table if not exists public.class_memberships (
  id uuid primary key default gen_random_uuid(),
  santri_id uuid not null references public.santri(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  start_date date not null,
  end_date date,
  status text not null default 'active',
  order_in_class integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint class_memberships_status_check check (status in ('active', 'inactive', 'moved', 'graduated')),
  constraint class_memberships_date_order check (end_date is null or end_date >= start_date)
);

create unique index if not exists class_memberships_one_active_per_santri
  on public.class_memberships(santri_id)
  where status = 'active';

create table if not exists public.class_mutations (
  id uuid primary key default gen_random_uuid(),
  santri_id uuid not null references public.santri(id) on delete cascade,
  from_class_id uuid references public.classes(id),
  to_class_id uuid references public.classes(id),
  mutation_date date not null default current_date,
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists classes_id_guru_idx on public.classes(id_guru);
create index if not exists classes_active_idx on public.classes(is_active);
create index if not exists class_memberships_class_id_idx on public.class_memberships(class_id);
create index if not exists class_memberships_santri_id_idx on public.class_memberships(santri_id);
create index if not exists class_memberships_class_status_idx on public.class_memberships(class_id, status);
