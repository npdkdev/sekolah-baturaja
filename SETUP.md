# Setup LPQ Al-Fath Maulana

Panduan ini untuk menjalankan aplikasi secara lokal atau di VPS.  
Stack: **React + Vite** (frontend) · **Go + chi** (backend) · **Postgres 16** (database) · **Docker Compose** (orkestrasi)

---

## Prasyarat

| Tool | Versi minimal | Catatan |
|---|---|---|
| Docker | 24+ | |
| docker-compose | v2 | `docker-compose` (tanda hubung) |
| Node.js | 22 | Hanya untuk dev frontend |
| npm | bawaan Node 22 | |
| Git | | |

---

## 1 · Clone dan masuk ke folder

```bash
git clone <repo-url> Sekolah-Baturaja
cd Sekolah-Baturaja
```

---

## 2 · Konfigurasi backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` — isi nilai yang ditandai `# wajib diisi`:

```env
PORT=8080

# wajib diisi — generate dengan: openssl rand -hex 32
JWT_SECRET=ganti_dengan_string_acak_32_byte
JWT_REFRESH_SECRET=ganti_dengan_string_acak_lain_32_byte

ACCESS_TOKEN_TTL_MINUTES=60
REFRESH_TOKEN_TTL_DAYS=30

UPLOAD_DIR=/app/uploads
MAX_UPLOAD_MB=20

# Origin frontend untuk CORS (dev: localhost:3000, prod: domain kamu)
CORS_ORIGIN=http://localhost:3000

# Wajib — password postgres container
POSTGRES_PASSWORD=ganti_password_db
```

> `DATABASE_URL` **tidak perlu diisi** — di-set otomatis oleh docker-compose.

---

## 3 · Jalankan backend + database

```bash
# dari folder backend/
docker-compose up -d --build
```

Perintah ini akan:
- Membangun satu image berisi API Go **dan** frontend yang sudah di-build
- Menjalankan Postgres 16
- Menerapkan semua migrasi otomatis (46 file di `db/migrations/`)
- Membuat akun admin awal

Node hanya dipakai di tahap build image; image yang berjalan tidak memuat
Node, npm, maupun web server terpisah — hanya satu binary Go yang menyajikan
API sekaligus berkas frontend.

Cek status:

```bash
docker-compose ps
docker-compose logs -f app   # lihat log
```

Siap saat log menampilkan `server running on :8080` dan
`serving frontend from /app/web`.

**Buka `http://localhost:3000`** — aplikasi dan API berada di origin yang
sama, jadi tidak ada konfigurasi CORS yang perlu dicocokkan.

### Akun admin default

| Field | Nilai |
|---|---|
| Username / email | `admin@lpqalfathmaulana.id` |
| Password | `admin123` |

**Ganti password setelah login pertama.**

---

## 4 · Frontend saat pengembangan (opsional)

Langkah 3 sudah menyajikan frontend. Bagian ini hanya perlu kalau kamu mau
hot-reload saat menggarap UI.

```bash
# dari root repo (bukan backend/)
cd ..
cp .env.example .env.local
npm install
npm run dev -- --port 5173
```

Isi `.env.local`:

```env
VITE_API_URL=http://localhost:3000
```

Karena dev server berada di origin berbeda dari API, tambahkan origin-nya ke
`CORS_ORIGIN` di `backend/.env` lalu `docker-compose up -d app`:

```env
CORS_ORIGIN=http://localhost:5173
```

Untuk deploy, `VITE_API_URL` dibiarkan kosong (sudah diatur di Dockerfile)
karena frontend dan API berbagi satu origin.

---

## 6 · Build frontend (production)

```bash
npm run build
# hasilnya di dist/ — serve dengan nginx / caddy / dll
```

---

## Arsitektur lokal

```
┌─────────────────────────────────────────────┐
│  Browser / Tim                              │
│  localhost:3000  (Vite dev server)          │
└────────────────────┬────────────────────────┘
                     │ HTTP
┌────────────────────▼────────────────────────┐
│  backend-api-1  :8080  (Go + chi)           │
│  backend/                                   │
└────────────────────┬────────────────────────┘
                     │ pgx
┌────────────────────▼────────────────────────┐
│  backend-db-1   :5432  (Postgres 16)        │
│  volume: pgdata                             │
│  volume: uploads  (file avatar & aset)      │
└─────────────────────────────────────────────┘
```

---

## Perintah berguna

```bash
# restart API setelah ubah kode Go
docker-compose up -d --build api

# lihat log real-time
docker-compose logs -f

# masuk ke psql
docker exec -it backend-db-1 psql -U postgres -d lpq_db

# reset database (hapus semua data, init ulang)
docker-compose down -v
docker-compose up -d --build

# stop semua container
docker-compose down
```

---

## Troubleshooting

| Masalah | Kemungkinan penyebab | Solusi |
|---|---|---|
| `server returned error: 401` | Password salah / token expired | Login ulang |
| `dial error: connection refused` | Container API belum siap | Tunggu `server running on :8080` di log |
| `docker-compose: command not found` | Docker Compose v1 | Pastikan `docker-compose` (v1) terinstall, bukan `docker compose` |
| Port 8080 sudah dipakai | Proses lain | `lsof -i :8080` lalu matikan prosesnya |
| Data hilang setelah `down` | Volume terhapus | Jangan pakai `-v` kecuali memang mau reset |
| Image tidak bisa di-pull | Registry diblokir | Build offline tidak didukung; pastikan akses internet |

---

## Variabel environment ringkas

### `backend/.env`

| Key | Wajib | Keterangan |
|---|---|---|
| `POSTGRES_PASSWORD` | ✅ | Password postgres |
| `JWT_SECRET` | ✅ | Min 32 karakter acak |
| `JWT_REFRESH_SECRET` | ✅ | Min 32 karakter acak, berbeda dari JWT_SECRET |
| `CORS_ORIGIN` | ✅ | Origin frontend (tanpa trailing slash) |
| `PORT` | — | Default `8080` |
| `ACCESS_TOKEN_TTL_MINUTES` | — | Default `60` |
| `REFRESH_TOKEN_TTL_DAYS` | — | Default `30` |
| `UPLOAD_DIR` | — | Default `/app/uploads` |
| `MAX_UPLOAD_MB` | — | Default `20` |

### `.env.local` (frontend)

| Key | Wajib | Keterangan |
|---|---|---|
| `VITE_API_URL` | ✅ | URL backend, tanpa trailing slash |
