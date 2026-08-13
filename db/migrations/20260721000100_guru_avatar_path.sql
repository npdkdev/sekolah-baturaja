-- Persist deterministic private avatar paths for guru and pentashih profiles.
-- Signed URLs remain presentation-only and must not be stored in public.guru.

alter table public.guru
  add column if not exists avatar_path text;

alter table public.guru
  drop constraint if exists guru_avatar_path_expected;

alter table public.guru
  add constraint guru_avatar_path_expected
  check (
    avatar_path is null
    or avatar_path = 'guru/' || id::text || '/profile.webp'
  );
