-- Extend news for the Berita CMS lifecycle without replacing legacy content.
-- Existing content JSON objects with body/text remain unchanged and readable.

alter table public.news
  add column if not exists category text not null default 'Pengumuman',
  add column if not exists media jsonb not null default '[]'::jsonb,
  add column if not exists author text not null default 'Sekolah',
  add column if not exists author_role text not null default 'Sekolah',
  add column if not exists is_featured boolean not null default false,
  add column if not exists display_order integer not null default 0,
  add column if not exists is_public boolean not null default true;

update public.news set content = '{}'::jsonb where content is null;

alter table public.news
  alter column content set default '{}'::jsonb,
  alter column content set not null;

alter table public.news
  add constraint news_title_length_check check (length(btrim(title)) between 1 and 200) not valid,
  add constraint news_slug_format_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 120) not valid,
  add constraint news_category_check check (length(btrim(category)) between 1 and 80) not valid,
  add constraint news_content_object_check check (jsonb_typeof(content) = 'object') not valid,
  add constraint news_media_structure_check check (jsonb_typeof(media) in ('array', 'object')) not valid,
  add constraint news_author_check check (length(btrim(author)) between 1 and 160) not valid,
  add constraint news_author_role_check check (length(btrim(author_role)) between 1 and 80) not valid,
  add constraint news_display_order_check check (display_order >= 0) not valid;

create index if not exists news_public_cms_order_idx
  on public.news (is_featured desc, display_order asc, published_at desc nulls last, created_at desc)
  where status = 'published' and is_public;

drop policy if exists news_anon_select_published on public.news;
drop policy if exists news_authenticated_select_published on public.news;
drop policy if exists news_admin_all on public.news;

create policy news_anon_select_published on public.news
  for select to anon
  using (status = 'published' and is_public);

create policy news_authenticated_select_published on public.news
  for select to authenticated
  using (
    (status = 'published' and is_public)
    or public.current_user_role()::text in ('admin', 'tata_usaha', 'superadmin')
  );

create policy news_admin_all on public.news
  for all to authenticated
  using (public.current_user_role()::text in ('admin', 'tata_usaha', 'superadmin'))
  with check (public.current_user_role()::text in ('admin', 'tata_usaha', 'superadmin'));
