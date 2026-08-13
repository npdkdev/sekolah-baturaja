-- Logical migration: 0045_forum_topics_and_replies
-- Purpose: create the discussion forum tables backing /forum and /forum/{id}.
-- Dependencies: 20260624000200_user_profiles_and_roles.sql, auth.users,
--               20260624001400_audit_triggers_and_updated_at.sql (set_updated_at).
-- Safety: additive only; no seed data, no credentials, no production data.
--
-- author_id / author_role are written by the API from verified JWT claims, never
-- from the request body. author_name is a denormalised display string captured
-- at post time so a renamed or deleted account does not rewrite history.

create table if not exists public.forum_topics (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  author_role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint forum_topics_title_not_blank check (length(btrim(title)) > 0),
  constraint forum_topics_title_max_len check (length(title) <= 200),
  constraint forum_topics_content_not_blank check (length(btrim(content)) > 0),
  constraint forum_topics_content_max_len check (length(content) <= 10000),
  constraint forum_topics_author_name_not_blank check (length(btrim(author_name)) > 0),
  constraint forum_topics_author_name_max_len check (length(author_name) <= 120),
  constraint forum_topics_author_role_check check (
    author_role in ('admin', 'guru', 'santri', 'pentashih')
  )
);

create table if not exists public.forum_replies (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.forum_topics(id) on delete cascade,
  content text not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  author_role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint forum_replies_content_not_blank check (length(btrim(content)) > 0),
  constraint forum_replies_content_max_len check (length(content) <= 10000),
  constraint forum_replies_author_name_not_blank check (length(btrim(author_name)) > 0),
  constraint forum_replies_author_name_max_len check (length(author_name) <= 120),
  constraint forum_replies_author_role_check check (
    author_role in ('admin', 'guru', 'santri', 'pentashih')
  )
);

-- Topic list orders by created_at DESC over live rows only.
create index if not exists forum_topics_live_created_at_idx
  on public.forum_topics(created_at desc)
  where deleted_at is null;

create index if not exists forum_topics_author_idx
  on public.forum_topics(author_id);

-- Reply fetch and the per-topic reply_count aggregate both filter on
-- (topic_id, deleted_at is null) and order by created_at.
create index if not exists forum_replies_live_topic_created_at_idx
  on public.forum_replies(topic_id, created_at)
  where deleted_at is null;

create index if not exists forum_replies_author_idx
  on public.forum_replies(author_id);

drop trigger if exists set_forum_topics_updated_at on public.forum_topics;
create trigger set_forum_topics_updated_at
  before update on public.forum_topics
  for each row execute function public.set_updated_at();

drop trigger if exists set_forum_replies_updated_at on public.forum_replies;
create trigger set_forum_replies_updated_at
  before update on public.forum_replies
  for each row execute function public.set_updated_at();

alter table public.forum_topics enable row level security;
alter table public.forum_replies enable row level security;

revoke all on table public.forum_topics from anon, authenticated;
revoke all on table public.forum_replies from anon, authenticated;
grant select, insert, update on table public.forum_topics to authenticated;
grant select, insert, update on table public.forum_replies to authenticated;
grant all on table public.forum_topics to service_role;
grant all on table public.forum_replies to service_role;

-- No delete grant: removal is a soft delete (update deleted_at), so the update
-- policies below are the only path that can retire a post.

drop policy if exists "forum_topics_authenticated_select" on public.forum_topics;
drop policy if exists "forum_topics_author_insert" on public.forum_topics;
drop policy if exists "forum_topics_author_or_admin_update" on public.forum_topics;

create policy "forum_topics_authenticated_select"
  on public.forum_topics for select to authenticated
  using (deleted_at is null);

create policy "forum_topics_author_insert"
  on public.forum_topics for insert to authenticated
  with check (author_id = auth.uid());

create policy "forum_topics_author_or_admin_update"
  on public.forum_topics for update to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

drop policy if exists "forum_replies_authenticated_select" on public.forum_replies;
drop policy if exists "forum_replies_author_insert" on public.forum_replies;
drop policy if exists "forum_replies_author_or_admin_update" on public.forum_replies;

create policy "forum_replies_authenticated_select"
  on public.forum_replies for select to authenticated
  using (deleted_at is null);

create policy "forum_replies_author_insert"
  on public.forum_replies for insert to authenticated
  with check (author_id = auth.uid());

create policy "forum_replies_author_or_admin_update"
  on public.forum_replies for update to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());
