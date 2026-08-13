-- Migration: 20260725000100_pentashih_full_read_access_rls.sql
-- Description: Allow Pentashih role read access to classes, guru, santri, and class_memberships for institutional class management.

-- Helper function to check if current auth user is a Pentashih
create or replace function public.is_pentashih_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.guru g
    where g.id = auth.uid()
      and (
        'Pentashih' = any(g.roles)
        or lower(coalesce(g.jabatan, '')) like '%pentashih%'
      )
  ) or (
    coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'pentashih'
  );
$$;

-- Allow Pentashih to select classes
drop policy if exists classes_pentashih_select on public.classes;
create policy classes_pentashih_select on public.classes
  for select to authenticated
  using (public.is_pentashih_user());

-- Allow Pentashih to select guru
drop policy if exists guru_pentashih_select on public.guru;
create policy guru_pentashih_select on public.guru
  for select to authenticated
  using (public.is_pentashih_user());

-- Allow Pentashih to select santri
drop policy if exists santri_pentashih_select on public.santri;
create policy santri_pentashih_select on public.santri
  for select to authenticated
  using (public.is_pentashih_user());

-- Dynamically handle class_memberships if present in schema
do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'class_memberships'
  ) then
    execute 'drop policy if exists class_memberships_pentashih_select on public.class_memberships';
    execute 'create policy class_memberships_pentashih_select on public.class_memberships for select to authenticated using (public.is_pentashih_user())';
  end if;
end $$;
