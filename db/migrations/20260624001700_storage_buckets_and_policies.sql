-- Logical migration: 0017_storage_buckets_and_policies
-- Purpose: create Storage buckets and ownership policies.
-- Dependencies: 20260624001600_rls_policies.sql.
-- Safety: no credentials, no seed data.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('website-assets', 'website-assets', true, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('murojaah-recordings', 'murojaah-recordings', false, 26214400, array['audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.storage_foldername(name text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select string_to_array(name, '/');
$$;

create or replace function public.storage_avatar_santri_owner(name text)
returns uuid
language sql
immutable
set search_path = public
as $$
  select nullif((public.storage_foldername(name))[2], '')::uuid
  where (public.storage_foldername(name))[1] = 'santri'
    and (public.storage_foldername(name))[3] = 'profile.webp';
$$;

create policy avatars_authenticated_read on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

create policy avatars_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'avatars' and public.is_admin())
  with check (bucket_id = 'avatars' and public.is_admin());

create policy avatars_user_own_profile_write on storage.objects
  for all to authenticated
  using (
    bucket_id = 'avatars'
    and (
      name = 'santri/' || auth.uid()::text || '/profile.webp'
      or name = 'guru/' || auth.uid()::text || '/profile.webp'
    )
  )
  with check (
    bucket_id = 'avatars'
    and (
      name = 'santri/' || auth.uid()::text || '/profile.webp'
      or name = 'guru/' || auth.uid()::text || '/profile.webp'
    )
  );

create policy avatars_guru_manage_class_santri on storage.objects
  for all to authenticated
  using (
    bucket_id = 'avatars'
    and public.guru_has_santri_access(public.storage_avatar_santri_owner(name))
  )
  with check (
    bucket_id = 'avatars'
    and public.guru_has_santri_access(public.storage_avatar_santri_owner(name))
  );

create policy website_assets_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'website-assets');

create policy website_assets_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'website-assets' and public.is_admin())
  with check (bucket_id = 'website-assets' and public.is_admin());

create policy murojaah_recordings_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'murojaah-recordings' and public.is_admin())
  with check (bucket_id = 'murojaah-recordings' and public.is_admin());

create policy murojaah_recordings_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'murojaah-recordings'
    and (public.storage_foldername(name))[1] = auth.uid()::text
  );

create policy murojaah_recordings_scope_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'murojaah-recordings'
    and (
      (public.storage_foldername(name))[1] = auth.uid()::text
      or public.guru_has_santri_access(nullif((public.storage_foldername(name))[1], '')::uuid)
      or public.pentashih_has_santri_access(nullif((public.storage_foldername(name))[1], '')::uuid)
      or public.is_admin()
    )
  );
