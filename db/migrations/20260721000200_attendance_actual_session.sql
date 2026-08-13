-- Preserve the registered session while recording the session actually attended.
-- Existing records remain null so legacy status interpretation is unchanged.

alter table public.attendance
  add column if not exists attended_session text;

comment on column public.attendance.sesi is
  'Registered session used for the attendance obligation and existing uniqueness rule.';

comment on column public.attendance.attended_session is
  'Actual session window used when the santri checked in; may differ from sesi.';

create index if not exists attendance_attended_session_idx
  on public.attendance(attended_session)
  where role = 'santri';
