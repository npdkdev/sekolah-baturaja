-- Logical migration: 0018_indexes_and_final_constraints
-- Purpose: add final indexes and constraints after schema and RLS are stable.
-- Dependencies: all previous migrations.
-- Safety: no credentials, no seed data.

create index if not exists santri_current_class_id_idx on public.santri(current_class_id);
create index if not exists attendance_class_date_idx on public.attendance(class_id, attendance_date);
create index if not exists payments_santri_month_year_idx on public.payments(santri_id, tahun, bulan);
create index if not exists hafalan_progress_santri_status_idx on public.hafalan_progress(santri_id, status);
create index if not exists murojaah_submissions_santri_status_idx on public.murojaah_submissions(santri_id, status);
create index if not exists news_published_status_idx on public.news(status, published_at);
create index if not exists announcements_published_status_idx on public.announcements(status, published_at);
create index if not exists auth_rate_limits_blocked_until_idx on public.auth_rate_limits(blocked_until);

alter table public.santri
  add constraint santri_avatar_path_expected
  check (
    avatar_path is null
    or avatar_path = 'santri/' || id::text || '/profile.webp'
  );

alter table public.guru
  add constraint guru_email_trimmed
  check (email is null or email = btrim(email));

alter table public.santri
  add constraint santri_email_trimmed
  check (email is null or email = btrim(email));
