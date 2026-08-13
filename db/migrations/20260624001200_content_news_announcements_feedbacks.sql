-- Logical migration: 0012_content_news_announcements_feedbacks
-- Purpose: create public content, news, announcements, and new feedback table.
-- Dependencies: 20260624000200_user_profiles_and_roles.sql.
-- Safety: no legacy feedback migration, no credentials, no seed data.

create table if not exists public.website_content (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  content jsonb not null default '{}'::jsonb,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint website_content_key_not_blank check (length(btrim(key)) > 0)
);

create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text,
  content jsonb,
  cover_image_url text,
  status text not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint news_title_not_blank check (length(btrim(title)) > 0),
  constraint news_slug_not_blank check (length(btrim(slug)) > 0),
  constraint news_status_check check (status in ('draft', 'published', 'archived'))
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text,
  content jsonb,
  cover_image_url text,
  status text not null default 'draft',
  priority text,
  valid_until date,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint announcements_title_not_blank check (length(btrim(title)) > 0),
  constraint announcements_slug_not_blank check (length(btrim(slug)) > 0),
  constraint announcements_status_check check (status in ('draft', 'published', 'archived')),
  constraint announcements_priority_check check (priority is null or priority in ('low', 'normal', 'high'))
);

create table if not exists public.feedbacks (
  id uuid primary key default gen_random_uuid(),
  nama text,
  email text,
  phone text,
  message text not null,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  handled_by uuid references auth.users(id),
  handled_at timestamptz,
  constraint feedbacks_message_not_blank check (length(btrim(message)) > 0),
  constraint feedbacks_status_check check (status in ('new', 'reviewed', 'closed', 'spam'))
);

create index if not exists website_content_public_idx on public.website_content(is_public);
create index if not exists news_status_idx on public.news(status);
create index if not exists news_published_at_idx on public.news(published_at);
create index if not exists announcements_status_idx on public.announcements(status);
create index if not exists announcements_published_at_idx on public.announcements(published_at);
create index if not exists feedbacks_status_idx on public.feedbacks(status);
