-- Logical migration: 0005_class_assignments
-- Purpose: create class-based pentashih assignments only.
-- Dependencies: 20260624000400_classes_memberships_and_mutations.sql.
-- Safety: no MMQ table dependency, no credentials, no seed data.

create table if not exists public.pentashih_class_assignments (
  id uuid primary key default gen_random_uuid(),
  pentashih_id uuid not null references public.guru(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  scope text not null default 'class',
  is_active boolean not null default true,
  starts_at date,
  ends_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint pentashih_class_assignments_scope_initial_check check (scope = 'class'),
  constraint pentashih_class_assignments_date_order check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create unique index if not exists pentashih_class_assignments_active_unique
  on public.pentashih_class_assignments(pentashih_id, class_id)
  where is_active;

create index if not exists pentashih_class_assignments_pentashih_idx
  on public.pentashih_class_assignments(pentashih_id);

create index if not exists pentashih_class_assignments_class_idx
  on public.pentashih_class_assignments(class_id);
