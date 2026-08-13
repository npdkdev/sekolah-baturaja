# Arsip era Supabase — jangan diikuti

Seluruh berkas di direktori ini menjelaskan arsitektur **sebelum** migrasi ke
Go + Postgres. Disimpan sebagai catatan sejarah dan alasan keputusan, bukan
sebagai panduan.

**Jangan menjalankan perintah apa pun dari berkas di sini.** Beberapa di
antaranya menutup dengan instruksi seperti:

```
supabase db push
supabase functions deploy signin-with-nomor-induk
```

Perintah itu menargetkan project Supabase yang sudah ditinggalkan. Edge
Function yang disebut sudah dihapus dari repo dan digantikan handler Go.

## Yang berlaku sekarang

| Kebutuhan | Rujukan |
|---|---|
| Menjalankan aplikasi | [`SETUP.md`](../../../SETUP.md) |
| Arsitektur & konvensi | [`CLAUDE.md`](../../../CLAUDE.md) |
| Blueprint autentikasi | [`docs/migration/auth-spec.md`](../../migration/auth-spec.md) |
| Pemetaan RLS → authz Go | [`docs/migration/authz-spec.md`](../../migration/authz-spec.md) |
| Skema database | `db/migrations/` (SQL berurutan) |
| Ekstraksi data dari Supabase | [`docs/migration/extract-db.sh`](../../migration/extract-db.sh) |

## Isi arsip

- `00`–`09` — handoff, gambaran proyek, arsitektur frontend/database awal
- `10`–`19` — perencanaan fase 1–2, skema final, desain auth, strategi migrasi data
- `20`–`30` — rencana dan hasil implementasi backend (fase 3)
- `31`–`50` — audit dan hasil integrasi frontend (fase 4), deployment staging

Nomor urutnya mencerminkan kronologi pengerjaan, bukan prioritas baca.
