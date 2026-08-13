-- Restrict the canonical admin role to the single official administrator account.
-- Existing guru records accidentally promoted by legacy role labels are repaired first.

update public.user_profiles up
set role = case
      when exists (
        select 1
        from public.guru g
        cross join lateral unnest(g.roles) guru_role
        where g.id = up.id
          and lower(btrim(guru_role)) = 'pentashih'
      ) then 'pentashih'::public.app_role
      else 'guru'::public.app_role
    end,
    updated_at = now()
where up.role = 'admin'::public.app_role
  and lower(coalesce(up.email, '')) <> 'admin@lpqalfathmaulana.id'
  and exists (select 1 from public.guru g where g.id = up.id);

do $$
begin
  if exists (
    select 1
    from public.user_profiles
    where role = 'admin'::public.app_role
      and lower(coalesce(email, '')) <> 'admin@lpqalfathmaulana.id'
  ) then
    raise exception 'Unauthorized admin profile remains; review the account before applying this migration.';
  end if;
end;
$$;

update public.guru g
set roles = coalesce((
      select array_agg(guru_role order by ordinal)
      from unnest(g.roles) with ordinality as role_item(guru_role, ordinal)
      where lower(btrim(guru_role)) <> 'admin'
    ), '{}'::text[]),
    updated_at = now()
where exists (
  select 1
  from unnest(g.roles) guru_role
  where lower(btrim(guru_role)) = 'admin'
);

alter table public.user_profiles
  add constraint user_profiles_admin_email_check
  check (
    role <> 'admin'::public.app_role
    or lower(coalesce(email, '')) = 'admin@lpqalfathmaulana.id'
  );

create unique index user_profiles_single_admin_idx
  on public.user_profiles ((role))
  where role = 'admin'::public.app_role;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select up.role
  from public.user_profiles up
  join auth.users au on au.id = up.id
  where up.id = auth.uid()
    and up.status = 'active'
    and (
      up.role <> 'admin'::public.app_role
      or (
        lower(coalesce(up.email, '')) = 'admin@lpqalfathmaulana.id'
        and lower(coalesce(au.email, '')) = 'admin@lpqalfathmaulana.id'
      )
    )
  limit 1;
$$;
