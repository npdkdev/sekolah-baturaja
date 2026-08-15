-- Materi, tugas, dan pengumuman kelas.
--
-- Sengaja TIDAK menumpang tabel `announcements`. Tabel itu memasok situs publik
-- dan punya kebijakan baca anonim (`announcements_anon_select_published`), jadi
-- konten kelas yang dititipkan ke sana akan bocor ke halaman Berita begitu
-- statusnya terbit. Audiensnya berbeda, jadi tabelnya berbeda.
--
-- Kepemilikan mengikuti `jadwal_pelajaran`, sama seperti tabel `nilai`: guru
-- hanya boleh menyentuh kelas yang benar-benar diajarnya, dan kebenaran itu
-- ditanya ulang ke jadwal pada tiap permintaan, tidak disalin ke sini.

CREATE TABLE IF NOT EXISTS kelas_konten (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  jenis             text NOT NULL,
  judul             text NOT NULL,
  isi               text,

  class_id          uuid NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  -- Boleh kosong: pengumuman kelas tidak selalu menempel pada satu mata pelajaran.
  mata_pelajaran_id uuid REFERENCES mata_pelajaran(id) ON DELETE SET NULL,
  periode_id        uuid REFERENCES periode_ajaran(id) ON DELETE CASCADE,
  guru_id           uuid REFERENCES guru(id) ON DELETE SET NULL,

  status            text NOT NULL DEFAULT 'draft',
  tanggal_publikasi timestamp with time zone,
  -- Hanya bermakna untuk jenis 'tugas'.
  batas_pengumpulan timestamp with time zone,

  -- Tautan lampiran, bukan berkas unggahan. Bucket `documents` dijaga
  -- `authorizeFileWrite` pada tingkat CanManage, jadi guru tidak dapat
  -- mengunggah ke sana; melonggarkannya akan mengubah keamanan berkas di luar
  -- lingkup modul ini.
  lampiran_url      text,
  lampiran_nama     text,

  created_at        timestamp with time zone NOT NULL DEFAULT now(),
  updated_at        timestamp with time zone NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_by        uuid,

  CONSTRAINT kelas_konten_jenis_chk
    CHECK (jenis IN ('materi', 'tugas', 'pengumuman')),
  CONSTRAINT kelas_konten_status_chk
    CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT kelas_konten_judul_not_blank
    CHECK (btrim(judul) <> ''),
  -- Batas pengumpulan hanya masuk akal pada tugas.
  CONSTRAINT kelas_konten_batas_hanya_tugas
    CHECK (batas_pengumpulan IS NULL OR jenis = 'tugas')
);

-- Yang paling sering dibaca murid: konten terbit untuk kelasnya.
CREATE INDEX IF NOT EXISTS kelas_konten_kelas_status_idx
  ON kelas_konten (class_id, status, tanggal_publikasi DESC);

CREATE INDEX IF NOT EXISTS kelas_konten_guru_idx
  ON kelas_konten (guru_id, periode_id);

CREATE INDEX IF NOT EXISTS kelas_konten_jenis_idx
  ON kelas_konten (jenis, class_id);

DROP TRIGGER IF EXISTS set_kelas_konten_updated_at ON kelas_konten;
CREATE TRIGGER set_kelas_konten_updated_at
  BEFORE UPDATE ON kelas_konten
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Penjagaan sungguhan ada di Go; RLS di sini pertahanan berlapis, bukan gerbang.
-- Perhatikan: TIDAK ada kebijakan untuk peran `anon` — konten kelas tidak pernah
-- boleh terbaca dari situs publik.
ALTER TABLE kelas_konten ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kelas_konten_read_authenticated ON kelas_konten;
CREATE POLICY kelas_konten_read_authenticated ON kelas_konten
  FOR SELECT TO authenticated USING (true);
