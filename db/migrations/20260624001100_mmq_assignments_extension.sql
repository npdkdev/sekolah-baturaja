-- Logical migration: 0011_mmq_assignments_extension
-- Purpose: extend pentashih assignments for MMQ after mmq_schedule exists.
-- Dependencies: 20260624000500_class_assignments.sql, 20260624001000_mmq_core.sql.
-- Safety: this is the only assignment migration that may reference mmq_schedule.

alter table public.pentashih_class_assignments
  drop constraint if exists pentashih_class_assignments_scope_initial_check;

alter table public.pentashih_class_assignments
  alter column class_id drop not null;

alter table public.pentashih_class_assignments
  add column if not exists mmq_schedule_id uuid;

alter table public.pentashih_class_assignments
  add constraint pentashih_assignments_mmq_schedule_fkey
  foreign key (mmq_schedule_id) references public.mmq_schedule(id) on delete cascade;

alter table public.pentashih_class_assignments
  add constraint pentashih_assignments_scope_check
  check (scope in ('class', 'mmq', 'both'));

alter table public.pentashih_class_assignments
  add constraint pentashih_assignments_scope_target_check
  check (
    (scope = 'class' and class_id is not null and mmq_schedule_id is null)
    or (scope = 'mmq' and class_id is null and mmq_schedule_id is not null)
    or (scope = 'both' and class_id is not null and mmq_schedule_id is not null)
  );

create unique index if not exists pentashih_assignments_active_scope_unique
  on public.pentashih_class_assignments(
    pentashih_id,
    coalesce(class_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(mmq_schedule_id, '00000000-0000-0000-0000-000000000000'::uuid),
    scope
  )
  where is_active;

create index if not exists pentashih_assignments_mmq_schedule_idx
  on public.pentashih_class_assignments(mmq_schedule_id);
