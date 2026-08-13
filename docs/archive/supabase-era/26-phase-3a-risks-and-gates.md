# 26 - Phase 3A Risks and Gates

## Status

Dokumen ini merangkum risiko dan gate sebelum implementasi backend dimulai. Belum ada SQL dibuat, belum ada Supabase project dibuat, dan belum ada deploy.

## Risiko Utama

### Salah Menulis ke Production Lama

Risiko:

- Command Supabase atau script memakai URL/key produksi lama.
- Data lama berubah tanpa sengaja.

Dampak:

- Gangguan website produksi lama.
- Data operasional rusak.

Mitigasi:

- Jangan membuat `.env.local` pada fase perencanaan.
- Gunakan environment baru dan jelas pada fase implementasi.
- Script harus menampilkan target project sebelum operasi.
- Production lama tidak boleh dipakai untuk test.

Gate:

- URL/project ref baru harus diverifikasi sebelum migration pertama.

### Service-Role Bocor ke Frontend

Risiko:

- Service-role key masuk `.env` frontend atau repository.

Dampak:

- Semua RLS dapat dilewati.
- Data sensitif terbuka.

Mitigasi:

- Service-role hanya di Edge Function/server.
- Static scan secret sebelum commit/deploy.
- `.env`, `.env.local`, `.env.*` tetap ignored.

Gate:

- Scan repository tidak menemukan service-role key.
- Frontend hanya memakai anon key.

### RLS Terlalu Longgar

Risiko:

- Policy memberi akses `authenticated` terlalu luas.
- Helper salah dan membuka data lintas kelas.

Dampak:

- Guru melihat data santri luar kelas.
- Santri melihat data orang lain.
- Data keuangan terbuka.

Mitigasi:

- Helper diuji sebelum policy.
- Test matrix per role wajib.
- Tidak memakai policy lama.

Gate:

- Semua test RLS pada `docs/23` lulus.
- Anon tidak membaca data sensitif.
- Guru hanya melihat status pembayaran terbatas.

### RLS Terlalu Ketat

Risiko:

- Aplikasi gagal membaca data yang sah.
- Edge Function terlalu banyak mengambil alih operasi biasa.

Dampak:

- Fitur inti tidak berjalan.
- Admin/guru terhambat.

Mitigasi:

- Test positif dan negatif sama-sama dibuat.
- Data dummy mewakili semua role.

Gate:

- Admin/guru/santri/pentashih berhasil menjalankan workflow inti dengan data dummy.

### Recursion pada Helper RLS

Risiko:

- Helper membaca tabel yang policy-nya memanggil helper yang sama.

Dampak:

- Query gagal atau lambat.
- Policy sulit dipahami.

Mitigasi:

- Helper dibuat kecil.
- `search_path` eksplisit.
- Hindari helper yang membaca tabel target policy secara langsung.
- Uji helper sebelum policy aktif luas.

Gate:

- Query helper untuk semua role dummy berhasil tanpa recursion.

### Login Santri Membocorkan Informasi

Risiko:

- Error membedakan nomor induk tidak ada dan password salah.
- Internal email tampil di UI/log.
- Password masuk log.

Dampak:

- Enumeration akun.
- Kebocoran identifier teknis.

Mitigasi:

- Error generik.
- Masking log.
- Password tidak pernah dilog.
- Tidak ada JWT custom.

Gate:

- Test login salah dan nomor induk tidak ada menghasilkan pesan sama.
- Log tidak berisi password.

### Data Dummy Menyerupai Data Asli

Risiko:

- Seed memakai nama, nomor induk, email, RFID, atau asset dari backup.

Dampak:

- Data pribadi bocor ke repository/test.

Mitigasi:

- Semua data dummy fiktif.
- Jangan membaca backup untuk membuat seed.
- Review seed sebelum commit.

Gate:

- Review manual memastikan seed tidak mengandung data asli.

### Avatar Storage Salah Path

Risiko:

- Santri dapat menulis ke folder santri lain.
- Guru dapat mengelola avatar luar kelas.
- File lama menumpuk.

Dampak:

- Penyalahgunaan foto profil.
- Storage berantakan.

Mitigasi:

- Path tetap `santri/<auth.uid()>/profile.webp`.
- Validasi folder ownership di Storage policy dan Edge Function.
- Upload avatar overwrite file lama.

Gate:

- Test Storage avatar pada `docs/23` lulus.

### Guru Melihat Detail Keuangan

Risiko:

- Frontend/backend memakai `payments` langsung untuk guru.
- View status pembayaran memuat kolom sensitif.

Dampak:

- Nominal, metode, atau catatan transaksi terbuka.

Mitigasi:

- Guru tidak diberi SELECT langsung ke `payments`.
- Guru hanya membaca `payment_status_summary`.
- View hanya berisi status `Lunas`/`Belum Lunas`.

Gate:

- Guru gagal SELECT `payments`.
- Guru tidak melihat nominal/metode/catatan/transaction_id.

### Migration Terlalu Besar

Risiko:

- Semua schema, RLS, storage, dan seed digabung.

Dampak:

- Sulit review.
- Sulit rollback.
- Sulit mencari sumber error.

Mitigasi:

- Ikuti `docs/22`.
- Satu migration satu domain.
- Test setelah kelompok penting.

Gate:

- Urutan migration disetujui sebelum SQL dibuat.

## Gate Sebelum Implementasi SQL

SQL baru boleh mulai dibuat hanya jika semua syarat ini terpenuhi:

- [ ] `docs/21-phase-3a-technical-implementation-plan.md` disetujui.
- [ ] `docs/22-migration-file-sequence.md` disetujui.
- [ ] `docs/23-backend-test-matrix.md` disetujui.
- [ ] `docs/24-edge-function-contracts.md` disetujui.
- [ ] `docs/25-local-staging-production-workflow.md` disetujui.
- [ ] Model Auth final tetap disetujui.
- [ ] RLS matrix final tetap disetujui.
- [ ] Kontrak Edge Function final.
- [ ] Rollback strategy tersedia.
- [ ] Tidak ada keputusan produk terbuka.

## Gate Sebelum Staging

Migration dan function boleh diuji di staging hanya jika:

- [ ] Local migration dari database kosong berhasil.
- [ ] Seed dummy lokal berhasil.
- [ ] Tidak ada data asli di seed.
- [ ] Static scan secret bersih.
- [ ] Test helper RLS lokal lulus.
- [ ] Edge Function lokal tidak mencetak password/token.
- [ ] Project staging terverifikasi bukan production lama.

## Gate Sebelum Production Baru

Production baru hanya boleh disentuh jika:

- [ ] Semua migration lolos di staging dari database kosong.
- [ ] Semua test Auth lulus.
- [ ] Semua test RLS lulus.
- [ ] Semua test Storage lulus.
- [ ] Semua Edge Function lulus.
- [ ] Log aman.
- [ ] Rollback/koreksi migration tersedia.
- [ ] User menyetujui langkah production baru.
- [ ] Production lama tetap tidak disentuh.

## Rollback Strategy

Local:

- Reset database lokal.
- Perbaiki migration.
- Jalankan ulang dari awal.

Staging:

- Reset project staging bila belum berisi data asli.
- Jika sudah ada data dummy, hapus data dummy atau reset staging.
- Buat migration koreksi untuk simulasi mendekati production.

Production baru:

- Jangan edit migration lama yang sudah diterapkan.
- Buat migration koreksi.
- Jika sebelum data asli, boleh reset project baru setelah disetujui.
- Jika setelah data asli, rollback harus memakai backup dan migration koreksi terencana.

Production lama:

- Tidak disentuh.
- Tidak menjadi target rollback.

## Kriteria Selesai Fase 3A

Fase 3A dianggap selesai jika:

- Enam dokumen rencana teknis tersedia.
- Tidak ada file migration SQL dibuat.
- Tidak ada Supabase project dibuat.
- Tidak ada SQL dijalankan.
- Tidak ada frontend diubah.
- Tidak ada `.env.local` dibuat.
- Tidak ada backup direstore.
- Tidak ada data asli digunakan.
- Gate sebelum implementasi jelas.
- Risiko utama dan mitigasinya terdokumentasi.
