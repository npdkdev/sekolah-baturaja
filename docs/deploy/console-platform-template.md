# Menjalankan LPQ sebagai template di console-platform

Repo ini dipakai sebagai *template* (app type) oleh
[console-platform](https://github.com/atkitostudio/console-platform): control
plane meng-clone repo ini, mem-build satu image, lalu menjalankan satu container
per tenant.

## Kontrak yang harus dipenuhi repo ini

Ini bukan pilihan gaya — masing-masing memenuhi satu asumsi keras di sisi
control plane.

| Kontrak | Kenapa |
|---|---|
| `Dockerfile` di root repo | Build dijalankan `docker build -t <app>:<sha> <repoPath>` tanpa `-f`, jadi tidak ada tempat lain yang dilihat |
| Dengar di **8080** | Nilai `app_types.port`; nginx mem-proxy ke port itu |
| Migrasi dari dalam aplikasi | Database dan schema sudah dibuat control plane sebelum container pertama berjalan, dan tidak ada init hook Postgres |
| Semua SQL tanpa kualifikasi schema | Tiap aplikasi memiliki satu schema di dalam database tenant bersama; `search_path` yang mengarahkannya |
| Tidak butuh superuser | Role aplikasi hanya punya `CONNECT` ke database dan hak penuh atas schema-nya sendiri |

## Environment yang disuntikkan control plane

Diberikan otomatis, tidak perlu diatur:

- `DATABASE_URL` — lewat PgBouncer, sudah menunjuk database tenant
- `DB_SCHEMA` — schema milik aplikasi (aplikasi ini tidak perlu membacanya:
  seluruh SQL-nya tak ter-kualifikasi, jadi `search_path` sudah cukup)
- `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` —
  bucket object storage milik aplikasi, bila console dikonfigurasi dengan R2

## Yang MASIH kurang di sisi console-platform

Dua hal berikut tidak bisa diperbaiki dari repo ini. Tanpa keduanya, tenant
akan gagal atau cacat:

1. **Tidak ada passthrough environment per-aplikasi.** `config.Load()` mewajibkan
   `JWT_SECRET` dan `JWT_REFRESH_SECRET` (masing-masing ≥32 karakter dan harus
   berbeda) dan akan menolak start tanpa keduanya. Control plane hanya mengirim
   `DATABASE_URL`, `DB_SCHEMA`, dan `R2_*` — tabel `app_types`/`tenant_apps`
   tidak punya kolom environment sama sekali. `TRUST_PROXY=true` juga perlu
   lewat jalur yang sama, kalau tidak `chimw.RealIP` tidak aktif dan seluruh
   pengunjung berbagi satu bucket rate-limit login (alamat container nginx).
   Pipanya sudah ada — `docker.ContainerSpec.Env` berupa map; yang kurang tempat
   menyimpannya dan mengisinya di dua sisi (provisioning dan redeploy).

2. **`client_max_body_size` tidak disetel di template vhost.** Berlaku default
   nginx 1 MB, sedangkan aplikasi ini mengizinkan 20 MB (`MAX_UPLOAD_MB`), jadi
   unggahan di antara keduanya kena 413.

## Yang masih kurang di repo ini

**Berkas unggahan hilang setiap redeploy.** Storage aplikasi menulis ke disk
lokal (`/app/uploads`). Control plane tidak memasang volume apa pun pada
container tenant, dan redeploy melakukan `docker rm -f` lalu `docker run` baru —
sehingga yang dikira operator sebagai kenaikan versi sebenarnya menghapus
seluruh berkas tenant. Backup control plane hanya `pg_dump`, tidak menyentuh
disk. Kredensial R2 sudah dikirimkan; lapisan storage perlu memakainya.

## Mendaftarkan template

`POST /app-types` dengan `repo_url` repo ini dan `default_branch`. `repo_path`
dan `docker_image` diturunkan control plane. Setel `port` = **8080** dan isi
`default_schema` secara eksplisit.
