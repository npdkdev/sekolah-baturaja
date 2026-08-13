-- Purpose: restore operational santri profile fields and media player support for staging.
-- Safety: additive only, no data deletion, no production seed data.

alter table public.santri
  add column if not exists nama_ayah text,
  add column if not exists nama_ibu text,
  add column if not exists tanggal_pendaftaran date,
  add column if not exists no_kk text,
  add column if not exists no_nik text,
  add column if not exists berkas_foto boolean not null default false,
  add column if not exists berkas_akta boolean not null default false,
  add column if not exists berkas_kk boolean not null default false,
  add column if not exists berkas_form boolean not null default false,
  add column if not exists link_qiroati text;

update public.santri
set tanggal_pendaftaran = coalesce(tanggal_pendaftaran, created_at::date)
where tanggal_pendaftaran is null;

create index if not exists santri_tanggal_pendaftaran_idx on public.santri(tanggal_pendaftaran);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'music-files',
  'music-files',
  true,
  52428800,
  array['audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav', 'audio/ogg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.music_files (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  filename text,
  storage_path text,
  file_url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint music_files_title_not_blank check (length(btrim(title)) > 0),
  constraint music_files_file_url_not_blank check (length(btrim(file_url)) > 0)
);

create table if not exists public.media_player_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  playback_position integer not null default 0,
  is_playing boolean not null default false,
  shuffle_enabled boolean not null default false,
  loop_enabled boolean not null default false,
  crossfade_enabled boolean not null default false,
  current_track_id uuid references public.music_files(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_player_settings_position_non_negative check (playback_position >= 0)
);

create unique index if not exists media_player_settings_user_unique
  on public.media_player_settings(user_id);

alter table public.music_files enable row level security;
alter table public.media_player_settings enable row level security;

drop policy if exists music_files_public_read_active on public.music_files;
create policy music_files_public_read_active on public.music_files
  for select to anon, authenticated
  using (is_active = true);

drop policy if exists music_files_admin_all on public.music_files;
create policy music_files_admin_all on public.music_files
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists media_player_settings_owner_all on public.media_player_settings;
create policy media_player_settings_owner_all on public.media_player_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists media_player_settings_admin_select on public.media_player_settings;
create policy media_player_settings_admin_select on public.media_player_settings
  for select to authenticated
  using (public.is_admin());

drop policy if exists music_files_public_read on storage.objects;
create policy music_files_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'music-files');

drop policy if exists music_files_admin_write on storage.objects;
create policy music_files_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'music-files' and public.is_admin())
  with check (bucket_id = 'music-files' and public.is_admin());
