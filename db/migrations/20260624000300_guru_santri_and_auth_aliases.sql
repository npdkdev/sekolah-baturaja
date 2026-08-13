-- Logical migration: 0003_guru_santri_and_auth_aliases
-- Purpose: create guru, santri, private login alias mapping, and persistent auth rate limit table.
-- Dependencies: 20260624000200_user_profiles_and_roles.sql.
-- Safety: no credentials, no seed data, no plaintext passwords.

create table if not exists public.guru (
  id uuid primary key references auth.users(id) on delete cascade,
  nama text not null,
  email text,
  no_hp text,
  alamat text,
  foto_url text,
  rfid_tag text,
  jabatan text,
  roles text[] not null default '{}',
  is_notulen boolean not null default false,
  jenis_kelamin text,
  tanggal_lahir date,
  status_guru text,
  status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint guru_nama_not_blank check (length(btrim(nama)) > 0)
);

create unique index if not exists guru_email_unique
  on public.guru (lower(email))
  where email is not null;

create unique index if not exists guru_rfid_tag_unique
  on public.guru (rfid_tag)
  where rfid_tag is not null;

create table if not exists public.santri (
  id uuid primary key references auth.users(id) on delete cascade,
  nomor_induk_qiroati text not null,
  nama_lengkap text not null,
  nama_panggilan text,
  kategori text check (kategori in ('Anak', 'Dewasa')),
  jenis_kelamin text,
  tanggal_lahir date,
  tempat_lahir text,
  alamat text,
  no_hp_ortu text,
  email text,
  foto_url text,
  avatar_path text,
  rfid_tag text,
  current_class_id uuid,
  sesi_mengaji text,
  jilid text,
  status text not null default 'Aktif',
  points integer not null default 0,
  order_in_class integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  constraint santri_nomor_induk_trimmed check (nomor_induk_qiroati = btrim(nomor_induk_qiroati)),
  constraint santri_nomor_induk_no_space check (nomor_induk_qiroati !~ '\s'),
  constraint santri_nama_lengkap_not_blank check (length(btrim(nama_lengkap)) > 0),
  constraint santri_points_non_negative check (points >= 0)
);

create unique index if not exists santri_nomor_induk_qiroati_unique
  on public.santri(nomor_induk_qiroati);

create unique index if not exists santri_rfid_tag_unique
  on public.santri(rfid_tag)
  where rfid_tag is not null;

create index if not exists guru_status_idx on public.guru(status);
create index if not exists guru_roles_gin_idx on public.guru using gin(roles);
create index if not exists santri_status_idx on public.santri(status);
create index if not exists santri_kategori_idx on public.santri(kategori);

create table if not exists public.auth_login_aliases (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  alias_type text not null default 'nomor_induk_qiroati',
  alias_value text not null,
  normalized_alias text not null,
  internal_email text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_login_aliases_alias_type_check check (alias_type = 'nomor_induk_qiroati'),
  constraint auth_login_aliases_alias_trimmed check (alias_value = btrim(alias_value)),
  constraint auth_login_aliases_alias_no_space check (alias_value !~ '\s'),
  constraint auth_login_aliases_normalized_not_blank check (length(btrim(normalized_alias)) > 0),
  constraint auth_login_aliases_internal_email_not_blank check (length(btrim(internal_email)) > 0)
);

create unique index if not exists auth_login_aliases_type_normalized_unique
  on public.auth_login_aliases(alias_type, normalized_alias);

create unique index if not exists auth_login_aliases_active_user_unique
  on public.auth_login_aliases(auth_user_id)
  where is_active;

create index if not exists auth_login_aliases_active_idx on public.auth_login_aliases(is_active);

create table if not exists public.auth_rate_limits (
  id uuid primary key default gen_random_uuid(),
  purpose text not null,
  ip_hash text not null,
  alias_hash text not null,
  window_start timestamptz not null,
  attempts integer not null default 0,
  blocked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_rate_limits_attempts_non_negative check (attempts >= 0)
);

create unique index if not exists auth_rate_limits_purpose_ip_alias_unique
  on public.auth_rate_limits(purpose, ip_hash, alias_hash);
