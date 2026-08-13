# Satu image berisi API Go sekaligus frontend yang sudah di-build.
#
# Node hanya hadir di tahap build — image akhir tidak memuat Node, npm, maupun
# nginx. Yang berjalan di server cuma satu binary statis plus berkas hasil build.
#
# Konteks build adalah root repo (lihat docker-compose.yml), karena tahap
# frontend butuh sumber di luar direktori backend/.

# ---- Tahap 1: build frontend ---------------------------------------------
FROM node:22-alpine AS web

WORKDIR /web

# npm 11 dipasang eksplisit: package-lock.json dihasilkan npm 11, dan npm 10
# bawaan node:22-alpine menolaknya ("lock file's picomatch@2.3.1 does not
# satisfy picomatch@4.0.5"). Menyamakan versi npm membuat build reproducible
# apa pun npm bawaan base image.
RUN npm i -g npm@11

# Layer dependensi terpisah supaya perubahan kode tidak memicu install ulang.
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js jsconfig.json ./
COPY tailwind.config.js postcss.config.js ./
COPY public ./public
COPY src ./src
COPY tools ./tools
# vite.config.js mengimpor plugin lokal dari sini.
COPY plugins ./plugins

# Kosong = same origin. Frontend dan API dilayani oleh proses yang sama, jadi
# browser tidak pernah melakukan permintaan lintas origin: CORS tidak terpakai
# dan cookie refresh jadi cookie first-party biasa.
ENV VITE_API_URL=""
RUN npm run build

# ---- Tahap 2: build API ---------------------------------------------------
FROM golang:1.24-alpine AS builder

WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o server .

# ---- Tahap 3: runtime -----------------------------------------------------
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata wget

# Jangan jalan sebagai root: kalau ada celah eksekusi, hak aksesnya terbatas.
RUN addgroup -S lpq && adduser -S -G lpq lpq

WORKDIR /app
COPY --from=builder /app/server .
COPY --from=web /web/dist ./web

RUN mkdir -p /app/uploads && chown -R lpq:lpq /app
USER lpq

VOLUME ["/app/uploads"]
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

CMD ["./server"]
