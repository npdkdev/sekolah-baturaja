# 17 - RLS Access Matrix

## Prinsip RLS

RLS harus aktif pada semua tabel operasional. Policy lama tidak dipakai ulang.

Seluruh keputusan RLS Fase 2 pada dokumen ini sudah final.

Larangan:

- Jangan memakai `OR true`.
- Jangan memberi semua authenticated akses penuh.
- Jangan membuka data santri, pembayaran, absensi, catatan, atau pengeluaran ke anon.
- Jangan mengandalkan service-role di frontend.

## Ringkasan Role

| Role | Arti |
|---|---|
| anon | Pengunjung belum login. |
| admin | Pengelola penuh sistem. |
| guru | Pengajar kelas tertentu. |
| santri | Santri/wali yang hanya melihat data sendiri. |
| pentashih | Penguji/penashih dengan assignment tertentu. |

## Matriks Akses Utama

| Tabel | anon | admin | guru | santri | pentashih |
|---|---|---|---|---|---|
| `website_content` | SELECT key publik | ALL | SELECT publik | SELECT publik | SELECT publik |
| `news` | SELECT published | ALL | SELECT published | SELECT published | SELECT published |
| `announcements` | SELECT published | ALL | SELECT published | SELECT published | SELECT published |
| `feedbacks` | INSERT | ALL | tidak | tidak | tidak |
| `user_profiles` | tidak | ALL | SELECT sendiri | SELECT sendiri | SELECT sendiri |
| `santri` | tidak | ALL | SELECT/UPDATE akademik kelasnya | SELECT sendiri | SELECT assignment |
| `guru` | tidak | ALL | SELECT sendiri dan guru kelas terkait | SELECT guru kelasnya | SELECT assignment |
| `classes` | tidak | ALL | SELECT kelasnya | SELECT kelas sendiri | SELECT assignment |
| `class_memberships` | tidak | ALL | SELECT kelasnya | SELECT sendiri | SELECT assignment |
| `attendance` | tidak | ALL | SELECT/INSERT/UPDATE kelasnya | SELECT sendiri | SELECT assignment |
| `payments` | tidak | ALL, DELETE admin saja | tidak untuk detail | SELECT sendiri | tidak |
| `payment_status_summary` | tidak | SELECT | SELECT status kelasnya | SELECT sendiri | tidak |
| `expenses` | tidak | ALL admin saja | tidak | tidak | tidak |
| `hafalan_items` | tidak | ALL | SELECT | SELECT | SELECT |
| `hafalan_progress` | tidak | ALL | SELECT/INSERT/UPDATE kelasnya | SELECT sendiri | SELECT assignment |
| `murojaah_submissions` | tidak | ALL | SELECT/UPDATE kelasnya | SELECT/INSERT sendiri | SELECT assignment |
| `academic_calendar` | SELECT event publik opsional | ALL | SELECT | SELECT | SELECT |
| `mmq_schedule` | tidak | ALL | SELECT aktif | tidak | SELECT assignment |
| `mmq_attendance` | tidak | ALL | SELECT/INSERT sendiri | tidak | SELECT assignment |
| `mmq_notulensi` | tidak | ALL | SELECT/INSERT jika notulen | tidak | SELECT assignment |
| `santri_notes` | tidak | ALL | SELECT/INSERT/UPDATE catatan sendiri untuk kelasnya | tidak | SELECT assignment |
| `notifications` | tidak | ALL | SELECT/UPDATE sendiri | SELECT/UPDATE sendiri | SELECT/UPDATE sendiri |
| `class_mutations` | tidak | ALL | SELECT kelas terkait | SELECT sendiri terbatas | SELECT assignment |
| `jilid_history` | tidak | ALL | SELECT/INSERT kelasnya | SELECT sendiri | SELECT assignment |
| `auth_login_aliases` | tidak | service role only | tidak | tidak | tidak |

## Policy per Modul

### Public Content

Tabel:

- `website_content`
- `news`
- `announcements`

Policy:

- anon SELECT hanya konten yang `is_public = true` atau `status = 'published'`.
- admin ALL.
- authenticated SELECT sama seperti anon untuk konten publik.

### User Profiles

Policy:

- admin SELECT/INSERT/UPDATE/DELETE.
- user SELECT profil sendiri.
- user tidak boleh update role/status sendiri.
- Edge Function `manage-user` memakai service role untuk perubahan akun.

### Santri

Policy:

- admin ALL.
- santri SELECT row sendiri: `santri.id = auth.uid()`.
- santri tidak boleh UPDATE data sensitif sendiri.
- guru SELECT santri yang membership aktifnya berada pada kelas yang `classes.id_guru = auth.uid()`.
- guru UPDATE hanya kolom akademik yang aman, misalnya catatan akademik via tabel terpisah, hafalan, murojaah, absensi.
- pentashih SELECT santri pada kelas yang ada di `pentashih_class_assignments`.

Catatan:

- Untuk update profil santri oleh user sendiri, sebaiknya gunakan whitelist kolom pada Edge Function atau view khusus, bukan UPDATE bebas ke tabel `santri`.

### Guru

Policy:

- admin ALL.
- guru SELECT profil sendiri.
- guru UPDATE profil sendiri hanya kolom aman seperti foto/no_hp/alamat, bila disetujui.
- santri SELECT guru kelasnya.
- pentashih SELECT guru yang terkait assignment.

### Classes dan Memberships

Policy:

- admin ALL.
- guru SELECT kelas yang diampu.
- guru SELECT membership dari kelasnya.
- santri SELECT kelas dan membership sendiri.
- pentashih SELECT kelas/membership assignment.

### Attendance

Policy:

- admin ALL.
- guru SELECT/INSERT/UPDATE absensi santri kelasnya dan absensi dirinya.
- guru tidak boleh DELETE; koreksi absensi dilakukan dengan UPDATE dan `correction_reason`.
- santri SELECT absensi sendiri.
- pentashih SELECT absensi area assignment, terutama MMQ/guru jika diperlukan.

### Payments

Policy:

- admin ALL termasuk DELETE.
- santri SELECT pembayaran sendiri.
- guru tidak boleh SELECT langsung ke detail `payments`.
- guru tidak boleh melihat nominal, metode pembayaran, catatan transaksi, `transaction_id`, atau detail keuangan lain.
- guru hanya boleh membaca status pembayaran santri di kelasnya melalui `payment_status_summary`.
- status yang terlihat guru hanya `Lunas` atau `Belum Lunas`.
- guru tidak boleh DELETE.
- anon tidak boleh SELECT.

### Expenses

Policy:

- admin ALL.
- role lain tidak boleh SELECT/INSERT/UPDATE/DELETE.

### Hafalan dan Murojaah

Policy:

- admin ALL.
- guru SELECT/INSERT/UPDATE progress santri kelasnya.
- guru SELECT/UPDATE murojaah santri kelasnya atau yang ditargetkan ke dirinya.
- santri SELECT progress sendiri.
- santri INSERT murojaah sendiri.
- pentashih SELECT data assignment.

### MMQ

Policy:

- admin ALL.
- guru SELECT jadwal aktif.
- guru INSERT/UPDATE attendance dirinya.
- guru dengan `is_notulen = true` boleh INSERT notulensi.
- pentashih SELECT jadwal/attendance/notulensi assignment.

### Notifications

Policy:

- user SELECT notifikasi sendiri.
- user UPDATE `is_read` notifikasi sendiri.
- admin ALL.
- insert notifikasi sebaiknya lewat Edge Function atau trigger server-side.

## Storage RLS Avatar Santri

Bucket:

- `avatars`

Path foto profil santri:

```text
avatars/santri/<auth.uid()>/profile.webp
```

Policy final:

- santri boleh SELECT/INSERT/UPDATE/DELETE hanya file pada folder `santri/<auth.uid()>/`.
- santri tidak boleh mengubah atau menghapus foto santri lain.
- admin boleh SELECT/INSERT/UPDATE/DELETE semua foto profil.
- guru boleh SELECT/INSERT/UPDATE/DELETE foto profil santri yang berada pada kelas yang diampu.
- guru tidak boleh mengelola foto santri di luar kelasnya.
- upload baru menggantikan file lama agar tidak ada tumpukan file profil.

Validasi:

- format yang diizinkan: JPG, JPEG, PNG, WebP.
- ukuran maksimal disarankan 2 MB.
- validasi dilakukan di frontend dan di backend/Storage policy atau Edge Function signed upload.
- admin tetap boleh menghapus foto yang tidak pantas.

## Helper yang Direkomendasikan

Nanti pada migration:

- `current_user_role()`
- `is_admin()`
- `is_guru_for_class(class_id uuid)`
- `is_guru_for_santri(santri_id uuid)`
- `is_pentashih_for_class(class_id uuid)`
- `is_pentashih_for_santri(santri_id uuid)`

Helper membuat policy lebih rapi dan mudah diuji.

## Testing RLS

Uji dengan akun dummy:

- admin dummy
- guru A
- guru B
- santri kelas guru A
- santri kelas guru B
- pentashih assignment A
- anon

Skenario wajib:

- guru A tidak bisa membaca santri kelas guru B.
- santri A tidak bisa membaca pembayaran santri B.
- pentashih assignment A tidak bisa membaca kelas non-assignment.
- anon hanya bisa membaca konten publik.
- hanya admin bisa membaca `expenses`.
- hanya admin bisa delete `payments`.
- guru hanya melihat `Lunas`/`Belum Lunas` dari `payment_status_summary`, bukan detail `payments`.
- santri tidak bisa upload avatar ke folder `avatars/santri/<uid_santri_lain>/`.
- guru tidak bisa mengelola avatar santri di luar kelasnya.
