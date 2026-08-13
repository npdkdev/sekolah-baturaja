-- Logical migration: 0013_notifications_and_santri_notes
-- Purpose: create user notifications and internal santri notes.
-- Dependencies: 20260624000300_guru_santri_and_auth_aliases.sql.
-- Safety: no credentials, no seed data.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  type text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint notifications_title_not_blank check (length(btrim(title)) > 0)
);

create table if not exists public.santri_notes (
  id uuid primary key default gen_random_uuid(),
  santri_id uuid not null references public.santri(id) on delete cascade,
  guru_id uuid references public.guru(id),
  note text not null,
  visibility text not null default 'internal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint santri_notes_note_not_blank check (length(btrim(note)) > 0),
  constraint santri_notes_visibility_check check (visibility in ('internal', 'admin_only'))
);

create index if not exists notifications_recipient_idx on public.notifications(recipient_id);
create index if not exists notifications_read_idx on public.notifications(recipient_id, is_read);
create index if not exists santri_notes_santri_idx on public.santri_notes(santri_id);
create index if not exists santri_notes_guru_idx on public.santri_notes(guru_id);
