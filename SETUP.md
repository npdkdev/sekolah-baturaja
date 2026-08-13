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
- Membangun image API dari `Dockerfile`
- Menjalankan Postgres 16
- Menerapkan semua migrasi otomatis (45 file di `db/migrations/`)
- Membuat akun admin awal

Cek status:

```bash
docker-compose ps
docker-compose logs -f api   # lihat log API
```

API siap saat log menampilkan `server running on :8080`.

### Akun admin default

| Field | Nilai |
|---|---|
| Username / email | `admin@lpqalfathmaulana.id` |
| Password | `admin123` |

**Ganti password setelah login pertama.**

---

## 4 · Konfigurasi frontend

```bash
# dari root repo (bukan backend/)
cd ..
cp .env.example .env.local
```

`.env.local` sudah benar untuk dev lokal:

```env
VITE_API_URL=http://localhost:8080
```

Untuk production, ubah ke domain/IP VPS:

```env
VITE_API_URL=https://api.domainmu.id
```

---

## 5 · Jalankan frontend (dev)

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

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
