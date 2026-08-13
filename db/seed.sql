-- Phase 3B-1 dummy seed for local/staging only.
-- Do not run this seed in production.
-- All identities below are fictitious Demo/Dummy records.
-- Auth users must be created first by a development bootstrap helper because Supabase Auth users are not reliably created by seed.sql.

insert into public.user_profiles (id, role, display_name, email, status)
values
  ('a1fa7a10-0000-0000-0000-000000000001', 'admin', 'Admin Demo', 'admin-demo@example.invalid', 'active'),
  ('a1fa7a10-0000-0000-0000-000000000002', 'guru', 'Guru Demo A', 'guru-a-demo@example.invalid', 'active'),
  ('a1fa7a10-0000-0000-0000-000000000003', 'guru', 'Guru Demo B', 'guru-b-demo@example.invalid', 'active'),
  ('a1fa7a10-0000-0000-0000-000000000004', 'pentashih', 'Pentashih Demo', 'pentashih-demo@example.invalid', 'active'),
  ('a1fa7a10-0000-0000-0000-000000000101', 'santri', 'Santri Demo A1', null, 'active'),
  ('a1fa7a10-0000-0000-0000-000000000102', 'santri', 'Santri Demo A2', null, 'active'),
  ('a1fa7a10-0000-0000-0000-000000000103', 'santri', 'Santri Demo A3', null, 'active'),
  ('a1fa7a10-0000-0000-0000-000000000201', 'santri', 'Santri Demo B1', null, 'active'),
  ('a1fa7a10-0000-0000-0000-000000000202', 'santri', 'Santri Demo B2', null, 'active'),
  ('a1fa7a10-0000-0000-0000-000000000301', 'santri', 'Santri PTPT Demo 1', null, 'active'),
  ('a1fa7a10-0000-0000-0000-000000000302', 'santri', 'Santri PTPT Demo 2', null, 'active'),
  ('a1fa7a10-0000-0000-0000-000000000303', 'santri', 'Santri PTPT Demo 3', null, 'active')
on conflict (id) do nothing;

insert into public.guru (id, nama, email, jabatan, roles, is_notulen, status)
values
  ('a1fa7a10-0000-0000-0000-000000000002', 'Guru Demo A', 'guru-a-demo@example.invalid', 'Pengajar Demo', '{}', true, 'active'),
  ('a1fa7a10-0000-0000-0000-000000000003', 'Guru Demo B', 'guru-b-demo@example.invalid', 'Pengajar Demo', '{}', false, 'active'),
  ('a1fa7a10-0000-0000-0000-000000000004', 'Pentashih Demo', 'pentashih-demo@example.invalid', 'Pentashih Demo', array['Pentashih'], false, 'active')
on conflict (id) do nothing;

insert into public.santri (id, nomor_induk_qiroati, nama_lengkap, kategori, status, avatar_path)
values
  ('a1fa7a10-0000-0000-0000-000000000101', 'AFMLOCAL-ANAK-A01', 'Santri Demo A1', 'Anak', 'Aktif', 'santri/a1fa7a10-0000-0000-0000-000000000101/profile.webp'),
  ('a1fa7a10-0000-0000-0000-000000000102', 'AFMLOCAL-ANAK-A02', 'Santri Demo A2', 'Anak', 'Aktif', 'santri/a1fa7a10-0000-0000-0000-000000000102/profile.webp'),
  ('a1fa7a10-0000-0000-0000-000000000103', 'AFMLOCAL-ANAK-A03', 'Santri Demo A3', 'Anak', 'Aktif', 'santri/a1fa7a10-0000-0000-0000-000000000103/profile.webp'),
  ('a1fa7a10-0000-0000-0000-000000000201', 'AFMLOCAL-ANAK-B01', 'Santri Demo B1', 'Anak', 'Aktif', 'santri/a1fa7a10-0000-0000-0000-000000000201/profile.webp'),
  ('a1fa7a10-0000-0000-0000-000000000202', 'AFMLOCAL-ANAK-B02', 'Santri Demo B2', 'Anak', 'Aktif', 'santri/a1fa7a10-0000-0000-0000-000000000202/profile.webp'),
  ('a1fa7a10-0000-0000-0000-000000000301', 'AFMLOCAL-PTPT-01', 'Santri PTPT Demo 1', 'PTPT', 'Aktif', null),
  ('a1fa7a10-0000-0000-0000-000000000302', 'AFMLOCAL-PTPT-02', 'Santri PTPT Demo 2', 'PTPT', 'Aktif', null),
  ('a1fa7a10-0000-0000-0000-000000000303', 'AFMLOCAL-PTPT-03', 'Santri PTPT Demo 3', 'PTPT', 'Aktif', null)
on conflict (id) do nothing;

insert into public.auth_login_aliases (auth_user_id, alias_value, normalized_alias, internal_email)
values
  ('a1fa7a10-0000-0000-0000-000000000101', 'AFMLOCAL-ANAK-A01', 'AFMLOCAL-ANAK-A01', 'santri+a1fa7a10-0000-0000-0000-000000000101@auth.lpqalfathmaulana.local'),
  ('a1fa7a10-0000-0000-0000-000000000102', 'AFMLOCAL-ANAK-A02', 'AFMLOCAL-ANAK-A02', 'santri+a1fa7a10-0000-0000-0000-000000000102@auth.lpqalfathmaulana.local'),
  ('a1fa7a10-0000-0000-0000-000000000103', 'AFMLOCAL-ANAK-A03', 'AFMLOCAL-ANAK-A03', 'santri+a1fa7a10-0000-0000-0000-000000000103@auth.lpqalfathmaulana.local'),
  ('a1fa7a10-0000-0000-0000-000000000201', 'AFMLOCAL-ANAK-B01', 'AFMLOCAL-ANAK-B01', 'santri+a1fa7a10-0000-0000-0000-000000000201@auth.lpqalfathmaulana.local'),
  ('a1fa7a10-0000-0000-0000-000000000202', 'AFMLOCAL-ANAK-B02', 'AFMLOCAL-ANAK-B02', 'santri+a1fa7a10-0000-0000-0000-000000000202@auth.lpqalfathmaulana.local'),
  ('a1fa7a10-0000-0000-0000-000000000301', 'AFMLOCAL-PTPT-01', 'AFMLOCAL-PTPT-01', 'santri+a1fa7a10-0000-0000-0000-000000000301@auth.lpqalfathmaulana.local'),
  ('a1fa7a10-0000-0000-0000-000000000302', 'AFMLOCAL-PTPT-02', 'AFMLOCAL-PTPT-02', 'santri+a1fa7a10-0000-0000-0000-000000000302@auth.lpqalfathmaulana.local'),
  ('a1fa7a10-0000-0000-0000-000000000303', 'AFMLOCAL-PTPT-03', 'AFMLOCAL-PTPT-03', 'santri+a1fa7a10-0000-0000-0000-000000000303@auth.lpqalfathmaulana.local')
on conflict (alias_type, normalized_alias) do nothing;

insert into public.classes (id, nama_kelas, id_guru, sesi, kategori, sort_order)
values
  ('b2fa7a20-0000-0000-0000-000000000001', 'Kelas Demo A', 'a1fa7a10-0000-0000-0000-000000000002', 'Sore', 'Anak', 1),
  ('b2fa7a20-0000-0000-0000-000000000002', 'Kelas Demo B', 'a1fa7a10-0000-0000-0000-000000000003', 'Sore', 'Anak', 2),
  ('b2fa7a20-0000-0000-0000-000000000003', 'Kelas Tahfizh PTPT Demo', 'a1fa7a10-0000-0000-0000-000000000002', 'Sore', 'PTPT', 3)
on conflict (id) do nothing;

update public.santri
set current_class_id = case
  when id in ('a1fa7a10-0000-0000-0000-000000000101', 'a1fa7a10-0000-0000-0000-000000000102', 'a1fa7a10-0000-0000-0000-000000000103') then 'b2fa7a20-0000-0000-0000-000000000001'::uuid
  else 'b2fa7a20-0000-0000-0000-000000000002'::uuid
end
where id in (
  'a1fa7a10-0000-0000-0000-000000000101',
  'a1fa7a10-0000-0000-0000-000000000102',
  'a1fa7a10-0000-0000-0000-000000000103',
  'a1fa7a10-0000-0000-0000-000000000201',
  'a1fa7a10-0000-0000-0000-000000000202'
);

update public.santri
set current_class_id = 'b2fa7a20-0000-0000-0000-000000000003'::uuid,
    jilid = case id
      when 'a1fa7a10-0000-0000-0000-000000000301'::uuid then 'Juz 30'
      when 'a1fa7a10-0000-0000-0000-000000000302'::uuid then 'Juz 29'
      else 'Juz 28'
    end,
    sesi_mengaji = '3'
where id in (
  'a1fa7a10-0000-0000-0000-000000000301',
  'a1fa7a10-0000-0000-0000-000000000302',
  'a1fa7a10-0000-0000-0000-000000000303'
);

insert into public.class_memberships (santri_id, class_id, start_date, status, order_in_class)
values
  ('a1fa7a10-0000-0000-0000-000000000101', 'b2fa7a20-0000-0000-0000-000000000001', current_date, 'active', 1),
  ('a1fa7a10-0000-0000-0000-000000000102', 'b2fa7a20-0000-0000-0000-000000000001', current_date, 'active', 2),
  ('a1fa7a10-0000-0000-0000-000000000103', 'b2fa7a20-0000-0000-0000-000000000001', current_date, 'active', 3),
  ('a1fa7a10-0000-0000-0000-000000000201', 'b2fa7a20-0000-0000-0000-000000000002', current_date, 'active', 1),
  ('a1fa7a10-0000-0000-0000-000000000202', 'b2fa7a20-0000-0000-0000-000000000002', current_date, 'active', 2),
  ('a1fa7a10-0000-0000-0000-000000000301', 'b2fa7a20-0000-0000-0000-000000000003', current_date, 'active', 1),
  ('a1fa7a10-0000-0000-0000-000000000302', 'b2fa7a20-0000-0000-0000-000000000003', current_date, 'active', 2),
  ('a1fa7a10-0000-0000-0000-000000000303', 'b2fa7a20-0000-0000-0000-000000000003', current_date, 'active', 3)
on conflict do nothing;

insert into public.pentashih_class_assignments (pentashih_id, class_id, scope, is_active)
values ('a1fa7a10-0000-0000-0000-000000000004', 'b2fa7a20-0000-0000-0000-000000000001', 'class', true)
on conflict do nothing;

insert into public.attendance (user_id, role, attendance_date, class_id, sesi, status, source)
values
  ('a1fa7a10-0000-0000-0000-000000000101', 'santri', current_date, 'b2fa7a20-0000-0000-0000-000000000001', 'Sore', 'Hadir', 'manual'),
  ('a1fa7a10-0000-0000-0000-000000000201', 'santri', current_date, 'b2fa7a20-0000-0000-0000-000000000002', 'Sore', 'Hadir', 'manual')
on conflict do nothing;

insert into public.payments (id, santri_id, bulan, tahun, jumlah, tanggal_pembayaran, metode_pembayaran, status)
values
  ('d4fa7a40-0000-0000-0000-000000000001', 'a1fa7a10-0000-0000-0000-000000000101', 1, 2026, 10000, current_date, 'Demo Manual', 'paid'),
  ('d4fa7a40-0000-0000-0000-000000000002', 'a1fa7a10-0000-0000-0000-000000000201', 1, 2026, 10000, current_date, 'Demo Manual', 'paid')
on conflict (id) do nothing;

insert into public.expenses (id, tanggal_pengeluaran, kategori, deskripsi, jumlah)
values ('d4fa7a40-0000-0000-0000-000000000101', current_date, 'Demo', 'Pengeluaran dummy untuk pengujian lokal', 5000)
on conflict (id) do nothing;

insert into public.hafalan_items (id, category, jilid, item_name, item_order)
values
  ('e5fa7a50-0000-0000-0000-000000000001', 'Doa Demo', 'Pra', 'Item Hafalan Demo 1', 1),
  ('e5fa7a50-0000-0000-0000-000000000002', 'Surat Demo', 'Pra', 'Item Hafalan Demo 2', 2)
on conflict (id) do nothing;

insert into public.hafalan_progress (id, santri_id, item_id, category, item_name, status)
values ('e5fa7a50-0000-0000-0000-000000000101', 'a1fa7a10-0000-0000-0000-000000000101', 'e5fa7a50-0000-0000-0000-000000000001', 'Doa Demo', 'Item Hafalan Demo 1', 'proses')
on conflict (id) do nothing;

insert into public.mmq_schedule (id, day_of_week, start_time, end_time, location)
values ('c3fa7a30-0000-0000-0000-000000000001', 5, '16:00', '17:00', 'Ruang Demo')
on conflict (id) do nothing;

insert into public.mmq_attendance (id, schedule_id, guru_id, attendance_date, status)
values ('c3fa7a30-0000-0000-0000-000000000101', 'c3fa7a30-0000-0000-0000-000000000001', 'a1fa7a10-0000-0000-0000-000000000002', current_date, 'Hadir')
on conflict (id) do nothing;

insert into public.mmq_notulensi (id, schedule_id, tanggal, judul, isi, notulen_id)
values ('c3fa7a30-0000-0000-0000-000000000201', 'c3fa7a30-0000-0000-0000-000000000001', current_date, 'Notulensi Demo', 'Isi notulensi dummy.', 'a1fa7a10-0000-0000-0000-000000000002')
on conflict (id) do nothing;

insert into public.website_content (key, content, is_public)
values
  ('site_name', '{"value":"LPQ Al-Fath Maulana"}', true),
  ('profile', '{"summary":"Konten profil dummy untuk local/staging."}', true)
on conflict (key) do nothing;

insert into public.news (title, slug, excerpt, content, status, published_at)
values ('Berita Demo', 'berita-demo', 'Excerpt berita dummy.', '{"body":"Konten berita dummy."}', 'published', now())
on conflict (slug) do nothing;

insert into public.announcements (title, slug, excerpt, content, status, priority, published_at)
values ('Pengumuman Demo', 'pengumuman-demo', 'Excerpt pengumuman dummy.', '{"body":"Konten pengumuman dummy."}', 'published', 'normal', now())
on conflict (slug) do nothing;
