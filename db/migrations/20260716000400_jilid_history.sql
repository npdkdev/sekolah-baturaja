-- Purpose: persist santri jilid changes used by class performance and santri detail views.
-- Safety: additive only; no existing data is changed or removed.

create table if not exists public.jilid_history (
  id uuid primary key default gen_random_uuid(),
  santri_id uuid not null references public.santri(id) on delete cascade,
  from_jilid text,
  to_jilid text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  constraint jilid_history_to_jilid_not_blank check (length(btrim(to_jilid)) > 0),
  constraint jilid_history_from_jilid_not_blank check (
    from_jilid is null or length(btrim(from_jilid)) > 0
  )
);

create index if not exists jilid_history_santri_changed_at_idx
  on public.jilid_history(santri_id, changed_at desc);

create index if not exists jilid_history_changed_at_idx
  on public.jilid_history(changed_at desc);

alter table public.jilid_history enable row level security;

revoke all on table public.jilid_history from anon, authenticated;
grant select, insert, update, delete on table public.jilid_history to authenticated;

drop policy if exists "jilid_history_scoped_select" on public.jilid_history;
drop policy if exists "jilid_history_scoped_insert" on public.jilid_history;
drop policy if exists "jilid_history_admin_update" on public.jilid_history;
drop policy if exists "jilid_history_admin_delete" on public.jilid_history;

create policy "jilid_history_scoped_select"
  on public.jilid_history
  for select
  to authenticated
  using (
    public.is_admin()
    or public.guru_has_santri_access(santri_id)
    or public.pentashih_has_santri_access(santri_id)
    or public.user_owns_santri_record(santri_id)
  );

create policy "jilid_history_scoped_insert"
  on public.jilid_history
  for insert
  to authenticated
  with check (
    (public.is_admin() or public.guru_has_santri_access(santri_id))
    and changed_by = auth.uid()
  );

create policy "jilid_history_admin_update"
  on public.jilid_history
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "jilid_history_admin_delete"
  on public.jilid_history
  for delete
  to authenticated
  using (public.is_admin());

comment on table public.jilid_history
  is 'Immutable-by-default history of santri jilid changes; non-admin users may only append within their class scope.';
