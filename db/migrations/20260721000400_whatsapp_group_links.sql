-- Purpose: store per-jilid WhatsApp invite links used by the admin mutation flow.
-- Safety: additive only; links remain restricted to authenticated administrators.

create table if not exists public.whatsapp_group_links (
  id uuid primary key default gen_random_uuid(),
  jilid text not null unique,
  group_name text,
  whatsapp_link text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint whatsapp_group_links_jilid_not_blank check (length(btrim(jilid)) > 0),
  constraint whatsapp_group_links_url_check check (
    whatsapp_link ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]+$'
  )
);

create index if not exists whatsapp_group_links_active_idx
  on public.whatsapp_group_links(is_active);

drop trigger if exists set_whatsapp_group_links_updated_at on public.whatsapp_group_links;
create trigger set_whatsapp_group_links_updated_at
  before update on public.whatsapp_group_links
  for each row execute function public.set_updated_at();

alter table public.whatsapp_group_links enable row level security;

revoke all on table public.whatsapp_group_links from anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_group_links to authenticated;
grant all on table public.whatsapp_group_links to service_role;

drop policy if exists "whatsapp_group_links_admin_select" on public.whatsapp_group_links;
drop policy if exists "whatsapp_group_links_admin_insert" on public.whatsapp_group_links;
drop policy if exists "whatsapp_group_links_admin_update" on public.whatsapp_group_links;
drop policy if exists "whatsapp_group_links_admin_delete" on public.whatsapp_group_links;

create policy "whatsapp_group_links_admin_select"
  on public.whatsapp_group_links for select to authenticated
  using (public.is_admin());

create policy "whatsapp_group_links_admin_insert"
  on public.whatsapp_group_links for insert to authenticated
  with check (public.is_admin());

create policy "whatsapp_group_links_admin_update"
  on public.whatsapp_group_links for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "whatsapp_group_links_admin_delete"
  on public.whatsapp_group_links for delete to authenticated
  using (public.is_admin());
