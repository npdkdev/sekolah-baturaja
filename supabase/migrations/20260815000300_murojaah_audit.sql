-- Pencatatan perubahan setoran murojaah.
--
-- `murojaah_submissions` menyimpan keadaan terakhir saja: siapa yang terakhir
-- menyunting terekam di `updated_by`, tetapi nilai sebelumnya hilang, dan baris
-- yang dihapus tidak meninggalkan jejak apa pun. Padahal setoran adalah catatan
-- penilaian — menghapusnya diam-diam menghilangkan bukti.
--
-- Tabel ini menyimpan riwayatnya secara terpisah, termasuk salinan penuh baris
-- sebelum diubah atau dihapus, sehingga penghapusan tetap dapat dipertanggung-
-- jawabkan.

CREATE TABLE IF NOT EXISTS murojaah_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Sengaja TANPA foreign key ke murojaah_submissions: catatan penghapusan harus
  -- tetap hidup setelah baris aslinya lenyap. FK dengan ON DELETE CASCADE justru
  -- akan ikut menghapus buktinya.
  submission_id uuid NOT NULL,

  aksi          text NOT NULL,
  aktor_id      uuid,
  aktor_role    text,

  status_lama   text,
  status_baru   text,
  -- Salinan baris sebelum perubahan; satu-satunya cara memulihkan setoran yang
  -- terhapus keliru.
  data_lama     jsonb,

  created_at    timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT murojaah_audit_aksi_chk
    CHECK (aksi IN ('buat', 'ubah', 'hapus'))
);

CREATE INDEX IF NOT EXISTS murojaah_audit_submission_idx
  ON murojaah_audit (submission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS murojaah_audit_aktor_idx
  ON murojaah_audit (aktor_id, created_at DESC);

-- Riwayat penilaian bukan konsumsi publik maupun murid; dibaca dari Go oleh peran
-- back-office saja. Tidak ada kebijakan untuk `anon`.
ALTER TABLE murojaah_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS murojaah_audit_read_authenticated ON murojaah_audit;
CREATE POLICY murojaah_audit_read_authenticated ON murojaah_audit
  FOR SELECT TO authenticated USING (true);
