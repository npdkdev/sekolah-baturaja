-- Logical migration: 0014_audit_triggers_and_updated_at
-- Purpose: add common updated_at trigger to mutable tables.
-- Dependencies: all core tables.
-- Safety: no credentials, no seed data.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_profiles',
    'guru',
    'santri',
    'auth_login_aliases',
    'auth_rate_limits',
    'classes',
    'class_memberships',
    'pentashih_class_assignments',
    'attendance',
    'payments',
    'expenses',
    'hafalan_items',
    'hafalan_progress',
    'murojaah_submissions',
    'academic_calendar',
    'mmq_schedule',
    'mmq_attendance',
    'mmq_notulensi',
    'website_content',
    'news',
    'announcements',
    'santri_notes'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end
$$;
