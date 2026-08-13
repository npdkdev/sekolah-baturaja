-- Purpose: add an optional per-santri SPP default and install the official
-- Qiroati Jilid 1-6 memorization curriculum supplied by the institution.
-- Safety: additive schema change and idempotent master-data insert only.

alter table public.santri
  add column if not exists default_spp_amount numeric(12,2);

alter table public.santri
  add constraint santri_default_spp_amount_valid
  check (default_spp_amount is null or default_spp_amount >= 10000);

with curriculum(category, jilid, item_order, item_name) as (
  values
    ('Doa', '1', 1, 'Ta’awwudz / Isti’adzah'),
    ('Doa', '1', 2, 'Basmalah'),
    ('Doa', '1', 3, 'Tahmid'),
    ('Doa', '1', 4, 'Doa kebaikan dunia dan akhirat'),
    ('Doa', '1', 5, 'Kalimat penyerahan diri kepada Allah'),
    ('Sholat', '1', 1, 'Doa masuk masjid'),
    ('Sholat', '1', 2, 'Doa keluar masjid'),
    ('Sholat', '1', 3, 'Lafaz azan'),
    ('Sholat', '1', 4, 'Lafaz iqamah'),
    ('Sholat', '1', 5, 'Doa setelah azan'),
    ('Sholat', '1', 6, 'Niat berwudu'),
    ('Sholat', '1', 7, 'Doa setelah berwudu'),
    ('Surat', '1', 1, 'Al-Fatihah'),
    ('Surat', '1', 2, 'An-Nas'),
    ('Surat', '1', 3, 'Al-Falaq'),
    ('Surat', '1', 4, 'Al-Ikhlas'),
    ('Surat', '1', 5, 'Al-‘Ashr'),
    ('Surat', '1', 6, 'Al-Lahab / Al-Masad'),
    ('Surat', '1', 7, 'An-Nashr'),
    ('Doa', '2', 1, 'Tasbih'),
    ('Doa', '2', 2, 'Tahlil'),
    ('Doa', '2', 3, 'Takbir'),
    ('Doa', '2', 4, 'Hauqalah'),
    ('Doa', '2', 5, 'Kalimat syahadat'),
    ('Doa', '2', 6, 'Doa memohon ampun untuk kedua orang tua'),
    ('Doa', '2', 7, 'Doa sebelum makan'),
    ('Doa', '2', 8, 'Doa sesudah makan'),
    ('Sholat', '2', 1, 'Niat salat Subuh'),
    ('Sholat', '2', 2, 'Niat salat Zuhur'),
    ('Sholat', '2', 3, 'Niat salat Asar'),
    ('Sholat', '2', 4, 'Niat salat Magrib'),
    ('Sholat', '2', 5, 'Niat salat Isya'),
    ('Sholat', '2', 6, 'Niat salat Jumat'),
    ('Surat', '2', 1, 'Al-Kafirun'),
    ('Surat', '2', 2, 'Al-Kautsar'),
    ('Surat', '2', 3, 'Al-Ma’un'),
    ('Surat', '2', 4, 'Quraisy'),
    ('Surat', '2', 5, 'Al-Fil'),
    ('Doa', '3', 1, 'Doa keluar rumah / akan bepergian'),
    ('Doa', '3', 2, 'Doa ketika kembali / sudah berada di rumah'),
    ('Doa', '3', 3, 'Doa sebelum tidur'),
    ('Doa', '3', 4, 'Doa bangun tidur'),
    ('Doa', '3', 5, 'Ucapan salam'),
    ('Doa', '3', 6, 'Jawaban salam'),
    ('Doa', '3', 7, 'Ucapan ketika berjanji: Insyaallah'),
    ('Doa', '3', 8, 'Ucapan orang yang bersin'),
    ('Doa', '3', 9, 'Jawaban bagi orang yang mendengar bersin'),
    ('Doa', '3', 10, 'Balasan dari orang yang bersin'),
    ('Sholat', '3', 1, 'Takbiratul ihram'),
    ('Sholat', '3', 2, 'Doa iftitah'),
    ('Sholat', '3', 3, 'Bacaan Al-Fatihah'),
    ('Sholat', '3', 4, 'Bacaan rukuk'),
    ('Sholat', '3', 5, 'Bacaan i‘tidal'),
    ('Surat', '3', 1, 'Al-Humazah'),
    ('Surat', '3', 2, 'Al-‘Ashr'),
    ('Surat', '3', 3, 'At-Takatsur'),
    ('Surat', '3', 4, 'Al-Qari‘ah'),
    ('Doa', '4', 1, 'Ucapan ketika merasa takjub / kagum'),
    ('Doa', '4', 2, 'Doa ketika mengalami, melihat, atau mendengar musibah'),
    ('Doa', '4', 3, 'Doa masuk kamar kecil / WC'),
    ('Doa', '4', 4, 'Doa keluar kamar kecil / WC'),
    ('Doa', '4', 5, 'Doa masuk kamar mandi'),
    ('Doa', '4', 6, 'Doa keluar kamar mandi'),
    ('Doa', '4', 7, 'Doa memakai pakaian'),
    ('Doa', '4', 8, 'Doa melepas pakaian'),
    ('Doa', '4', 9, 'Doa ketika bercermin'),
    ('Sholat', '4', 1, 'Bacaan sujud'),
    ('Sholat', '4', 2, 'Bacaan duduk di antara dua sujud'),
    ('Sholat', '4', 3, 'Bacaan tahiyat awal'),
    ('Sholat', '4', 4, 'Salawat Nabi'),
    ('Sholat', '4', 5, 'Doa setelah tasyahud'),
    ('Surat', '4', 1, 'Al-‘Adiyat'),
    ('Surat', '4', 2, 'Az-Zalzalah'),
    ('Surat', '4', 3, 'Al-Bayyinah'),
    ('Doa', '5', 1, 'Doa naik kendaraan'),
    ('Doa', '5', 2, 'Doa naik perahu / kendaraan laut'),
    ('Doa', '5', 3, 'Doa panjang umur'),
    ('Doa', '5', 4, 'Doa lapang dada'),
    ('Doa', '5', 5, 'Doa ketika mengalami kesulitan / hasbalah'),
    ('Doa', '5', 6, 'Doa menghilangkan kesedihan dan kegundahan'),
    ('Doa', '5', 7, 'Doa ketika sakit'),
    ('Sholat', '5', 1, 'Doa qunut'),
    ('Sholat', '5', 2, 'Zikir setelah salat'),
    ('Sholat', '5', 3, 'Doa setelah salat'),
    ('Sholat', '5', 4, 'Bacaan sujud tilawah'),
    ('Surat', '5', 1, 'Al-Qadr'),
    ('Surat', '5', 2, 'Al-‘Alaq'),
    ('Surat', '5', 3, 'At-Tin'),
    ('Surat', '5', 4, 'Al-Insyirah / Asy-Syarh'),
    ('Doa', '6', 1, 'Doa akan belajar / menuntut ilmu'),
    ('Doa', '6', 2, 'Doa memohon kecerdasan'),
    ('Doa', '6', 3, 'Doa agar tetap istiqamah dalam agama dan kebenaran'),
    ('Doa', '6', 4, 'Istighfar / doa memohon ampun'),
    ('Doa', '6', 5, 'Doa memohon kesembuhan'),
    ('Sholat', '6', 1, 'Doa salat Dhuha'),
    ('Sholat', '6', 2, 'Niat salat sunah Tahiyatul Masjid'),
    ('Sholat', '6', 3, 'Niat salat sunah Tarawih'),
    ('Sholat', '6', 4, 'Niat salat sunah Witir'),
    ('Sholat', '6', 5, 'Niat salat sunah Idulfitri'),
    ('Sholat', '6', 6, 'Niat salat sunah Iduladha'),
    ('Surat', '6', 1, 'Ad-Duha'),
    ('Surat', '6', 2, 'Al-Lail'),
    ('Surat', '6', 3, 'Asy-Syams')
)
insert into public.hafalan_items (category, jilid, item_order, item_name, is_active)
select category, jilid, item_order, item_name, true
from curriculum source
where not exists (
  select 1
  from public.hafalan_items existing
  where lower(existing.category) = lower(source.category)
    and existing.jilid is not distinct from source.jilid
    and lower(existing.item_name) = lower(source.item_name)
);

notify pgrst, 'reload schema';
