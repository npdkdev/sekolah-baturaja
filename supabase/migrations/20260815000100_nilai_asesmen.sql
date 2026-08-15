-- Nilai asesmen mata pelajaran.
--
-- Satu baris = satu skor seorang murid pada satu mata pelajaran, dalam satu
-- periode ajaran, untuk satu jenis asesmen.
--
-- Kepemilikan mengikuti `jadwal_pelajaran`: itulah satu-satunya sumber yang
-- menyatakan guru mana mengajar mata pelajaran apa di kelas mana pada periode
-- berapa. Tabel ini sengaja TIDAK menyimpan aturan hak akses sendiri — kalau
-- disalin ke sini, dua sumber kebenaran akan berselisih begitu admin mengubah
-- jadwal. Penjagaannya ada di Go (`nilai.go`), sesuai pola repositori ini:
-- pool terhubung sebagai superuser, jadi RLS tidak menggawangi permintaan hidup.

CREATE TABLE IF NOT EXISTS nilai (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  santri_id         uuid NOT NULL REFERENCES santri(id) ON DELETE CASCADE,
  class_id          uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  mata_pelajaran_id uuid NOT NULL REFERENCES mata_pelajaran(id) ON DELETE RESTRICT,
  periode_id        uuid NOT NULL REFERENCES periode_ajaran(id) ON DELETE CASCADE,
  guru_id           uuid REFERENCES guru(id) ON DELETE SET NULL,

  jenis_asesmen     text NOT NULL,
  skor              numeric(5,2) NOT NULL,
  catatan           text,
  tanggal_asesmen   date NOT NULL DEFAULT CURRENT_DATE,

  created_at        timestamp with time zone NOT NULL DEFAULT now(),
  updated_at        timestamp with time zone NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_by        uuid,

  CONSTRAINT nilai_skor_chk CHECK (skor >= 0 AND skor <= 100),
  CONSTRAINT nilai_jenis_asesmen_not_blank CHECK (btrim(jenis_asesmen) <> '')
);

-- Penyaring yang paling sering dipakai panel guru: periode + kelas + mapel.
CREATE INDEX IF NOT EXISTS nilai_periode_kelas_mapel_idx
  ON nilai (periode_id, class_id, mata_pelajaran_id);

-- Rapor per murid.
CREATE INDEX IF NOT EXISTS nilai_santri_idx
  ON nilai (santri_id, periode_id);

-- Rekap kinerja per guru.
CREATE INDEX IF NOT EXISTS nilai_guru_idx
  ON nilai (guru_id, periode_id);

DROP TRIGGER IF EXISTS set_nilai_updated_at ON nilai;
CREATE TRIGGER set_nilai_updated_at
  BEFORE UPDATE ON nilai
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Sejalan dengan tabel akademik lain: baca terbuka, tulis dijaga Go.
ALTER TABLE nilai ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nilai_read_all ON nilai;
CREATE POLICY nilai_read_all ON nilai FOR SELECT USING (true);
