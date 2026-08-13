-- Migration: 20260725000200_jilid_history_pentashih_rls.sql
-- Description: Allow Pentashih role read access to jilid_history to track evaluation and test duration.

do $$
begin
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'jilid_history'
  ) then
    execute 'drop policy if exists jilid_history_pentashih_select on public.jilid_history';
    execute 'create policy jilid_history_pentashih_select on public.jilid_history for select to authenticated using (public.is_pentashih_user())';
  end if;
end $$;
