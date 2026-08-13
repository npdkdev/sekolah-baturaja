-- Purpose: enable PTPT santri and install a separate scored tahfizh curriculum.
-- Safety: additive schema changes and idempotent official curriculum data only.

alter table public.santri
  drop constraint if exists santri_kategori_check;

alter table public.santri
  add constraint santri_kategori_check
  check (kategori in ('Anak', 'PTPT', 'Dewasa'));

comment on column public.santri.kategori is
  'Program santri: Anak (TPQ), PTPT (tahfizh), or Dewasa.';

alter table public.hafalan_items
  add column if not exists program_scope text;

update public.hafalan_items
set program_scope = 'TPQ'
where program_scope is null;

alter table public.hafalan_items
  alter column program_scope set default 'TPQ',
  alter column program_scope set not null;

alter table public.hafalan_items
  drop constraint if exists hafalan_items_program_scope_check;

alter table public.hafalan_items
  add constraint hafalan_items_program_scope_check
  check (program_scope in ('TPQ', 'PTPT'));

create index if not exists hafalan_items_program_scope_category_idx
  on public.hafalan_items(program_scope, category, jilid, item_order)
  where is_active;

comment on column public.hafalan_items.program_scope is
  'Separates TPQ memorization content from the PTPT tahfizh curriculum.';

with curriculum(program_scope, category, jilid, item_order, item_name) as (
  select 'PTPT', 'Tahfizh', 'Juz 1', page_number, format('Halaman %s', page_number)
  from generate_series(1, 21) as page_number

  union all

  select 'PTPT', 'Tahfizh', 'Juz 2', page_number - 21, format('Halaman %s', page_number)
  from generate_series(22, 41) as page_number

  union all

  select *
  from (values
    ('PTPT', 'Tahfizh', 'Juz 28', 1, 'Al-Mujadilah'),
    ('PTPT', 'Tahfizh', 'Juz 28', 2, 'Al-Hashr'),
    ('PTPT', 'Tahfizh', 'Juz 28', 3, 'Al-Mumtahanah'),
    ('PTPT', 'Tahfizh', 'Juz 28', 4, 'As-Saff'),
    ('PTPT', 'Tahfizh', 'Juz 28', 5, 'Al-Jumu''ah'),
    ('PTPT', 'Tahfizh', 'Juz 28', 6, 'Al-Munafiqun'),
    ('PTPT', 'Tahfizh', 'Juz 28', 7, 'At-Taghabun'),
    ('PTPT', 'Tahfizh', 'Juz 28', 8, 'At-Talaq'),
    ('PTPT', 'Tahfizh', 'Juz 28', 9, 'At-Tahrim'),

    ('PTPT', 'Tahfizh', 'Juz 29', 1, 'Al-Mulk'),
    ('PTPT', 'Tahfizh', 'Juz 29', 2, 'Al-Qalam'),
    ('PTPT', 'Tahfizh', 'Juz 29', 3, 'Al-Haqqah'),
    ('PTPT', 'Tahfizh', 'Juz 29', 4, 'Al-Ma''arij'),
    ('PTPT', 'Tahfizh', 'Juz 29', 5, 'Nuh'),
    ('PTPT', 'Tahfizh', 'Juz 29', 6, 'Al-Jinn'),
    ('PTPT', 'Tahfizh', 'Juz 29', 7, 'Al-Muzzammil'),
    ('PTPT', 'Tahfizh', 'Juz 29', 8, 'Al-Muddaththir'),
    ('PTPT', 'Tahfizh', 'Juz 29', 9, 'Al-Qiyamah'),
    ('PTPT', 'Tahfizh', 'Juz 29', 10, 'Al-Insan'),
    ('PTPT', 'Tahfizh', 'Juz 29', 11, 'Al-Mursalat'),

    ('PTPT', 'Tahfizh', 'Juz 30', 1, 'An-Naba'),
    ('PTPT', 'Tahfizh', 'Juz 30', 2, 'An-Nazi''at'),
    ('PTPT', 'Tahfizh', 'Juz 30', 3, '''Abasa'),
    ('PTPT', 'Tahfizh', 'Juz 30', 4, 'At-Takwir'),
    ('PTPT', 'Tahfizh', 'Juz 30', 5, 'Al-Infitar'),
    ('PTPT', 'Tahfizh', 'Juz 30', 6, 'Al-Mutaffifin'),
    ('PTPT', 'Tahfizh', 'Juz 30', 7, 'Al-Inshiqaq'),
    ('PTPT', 'Tahfizh', 'Juz 30', 8, 'Al-Buruj'),
    ('PTPT', 'Tahfizh', 'Juz 30', 9, 'At-Tariq'),
    ('PTPT', 'Tahfizh', 'Juz 30', 10, 'Al-A''la'),
    ('PTPT', 'Tahfizh', 'Juz 30', 11, 'Al-Ghashiyah'),
    ('PTPT', 'Tahfizh', 'Juz 30', 12, 'Al-Fajr'),
    ('PTPT', 'Tahfizh', 'Juz 30', 13, 'Al-Balad'),
    ('PTPT', 'Tahfizh', 'Juz 30', 14, 'Ash-Shams'),
    ('PTPT', 'Tahfizh', 'Juz 30', 15, 'Al-Lail'),
    ('PTPT', 'Tahfizh', 'Juz 30', 16, 'Ad-Duha'),
    ('PTPT', 'Tahfizh', 'Juz 30', 17, 'Ash-Sharh'),
    ('PTPT', 'Tahfizh', 'Juz 30', 18, 'At-Tin'),
    ('PTPT', 'Tahfizh', 'Juz 30', 19, 'Al-''Alaq'),
    ('PTPT', 'Tahfizh', 'Juz 30', 20, 'Al-Qadr'),
    ('PTPT', 'Tahfizh', 'Juz 30', 21, 'Al-Bayyinah'),
    ('PTPT', 'Tahfizh', 'Juz 30', 22, 'Az-Zalzalah'),
    ('PTPT', 'Tahfizh', 'Juz 30', 23, 'Al-''Adiyat'),
    ('PTPT', 'Tahfizh', 'Juz 30', 24, 'Al-Qari''ah'),
    ('PTPT', 'Tahfizh', 'Juz 30', 25, 'At-Takathur'),
    ('PTPT', 'Tahfizh', 'Juz 30', 26, 'Al-''Asr'),
    ('PTPT', 'Tahfizh', 'Juz 30', 27, 'Al-Humazah'),
    ('PTPT', 'Tahfizh', 'Juz 30', 28, 'Al-Fil'),
    ('PTPT', 'Tahfizh', 'Juz 30', 29, 'Quraysh'),
    ('PTPT', 'Tahfizh', 'Juz 30', 30, 'Al-Ma''un'),
    ('PTPT', 'Tahfizh', 'Juz 30', 31, 'Al-Kawthar'),
    ('PTPT', 'Tahfizh', 'Juz 30', 32, 'Al-Kafirun'),
    ('PTPT', 'Tahfizh', 'Juz 30', 33, 'An-Nasr'),
    ('PTPT', 'Tahfizh', 'Juz 30', 34, 'Al-Masad'),
    ('PTPT', 'Tahfizh', 'Juz 30', 35, 'Al-Ikhlas'),
    ('PTPT', 'Tahfizh', 'Juz 30', 36, 'Al-Falaq'),
    ('PTPT', 'Tahfizh', 'Juz 30', 37, 'An-Nas')
  ) as surah_curriculum(program_scope, category, jilid, item_order, item_name)
)
insert into public.hafalan_items (program_scope, category, jilid, item_order, item_name, is_active)
select c.program_scope, c.category, c.jilid, c.item_order, c.item_name, true
from curriculum c
where not exists (
  select 1
  from public.hafalan_items existing
  where existing.program_scope = c.program_scope
    and existing.category = c.category
    and existing.jilid = c.jilid
    and lower(existing.item_name) = lower(c.item_name)
);

notify pgrst, 'reload schema';
