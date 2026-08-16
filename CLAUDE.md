# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

LPQ Al-Fath Maulana — Islamic school (TPQ) management system. React SPA with a self-hosted Go + Postgres backend (`backend/`), running containerized on a single VPS. Indonesian language UI.

Migrated off Supabase — see `docs/migration/` for the auth/authz blueprints and `docs/archive/supabase-era/` for historical investigation reports.

Read `AGENTS.md` for operational rules and `AI_DEVELOPMENT_GUIDE.md` for the full development handbook (read only relevant sections per task).

## Commands

```bash
npm run dev        # Vite dev server on port 3000
npm run build      # Generates LLMS metadata then runs vite build
npm run preview    # Preview production build on port 3000
npm run lint       # ESLint (flat config, --quiet)
npm test           # Vitest (tests/), sekali jalan
npm run test:watch # Vitest mode watch
```

Backend: `cd backend && go test ./...`

Catatan: shim `node_modules/.bin/eslint` dan `.bin/vite` di repo ini bisa gagal
dengan `ERR_MODULE_NOT_FOUND`. Kalau itu terjadi, panggil entrypoint aslinya
(`node node_modules/eslint/bin/eslint.js .`, `node node_modules/vite/bin/vite.js`).

## Architecture

**Stack:** React 18 + Vite 7 + Tailwind CSS + shadcn/ui + React Router 6, talking to a Go backend (chi + pgx v5 + Postgres)

**Path alias:** `@` → `./src`

**Node version:** 22 (see `.nvmrc`)

### Routing & Roles

Single-page app with `react-router-dom`. Four role-based dashboards:
- `AdminDashboard` — full system management
- `GuruDashboard` — teacher view
- `PentashihDashboard` — Quran assessment reviewer
- `SantriDashboard` — student view

Auth flows through `src/contexts/AuthContext.jsx`, which holds the JWT session and loads the user's role. Protected routes gate on role via `src/components/ProtectedRoute.jsx`. Students log in by `nomor_induk`, staff by email.

### Data Layer

- `src/lib/apiClient.js` — fetch wrapper for the Go backend; attaches the access token and handles refresh
- `src/lib/*Adapters.js` — domain-specific data access (finance, attendance, MMQ, storage, etc.). All backend calls go through adapters.
- `src/lib/featureFlags.js` — toggles for deferred features, games, backup/restore

### Backend (`backend/`)

- Go: chi router, pgx v5, golang-jwt/jwt, bcrypt. Domain handlers in `backend/internal/handler/` (auth, santri, guru, classes, attendance, payment, academic, mmq, gamification, content, forum, whatsapp, mediaplayer, loginlogs, file, appconfig).
- Postgres schema lives in `backend/internal/migrate/sql/` and is applied by the
  app itself at startup (`migrate.Run`, embedded via `go:embed`). The app is the
  only thing that migrates: on the platform the database and schema already
  exist before the container runs and there is no Postgres init hook.
- All SQL must be **unqualified** — no `public.`, `auth.`, `storage.`,
  `extensions.`. Each app owns one schema inside a shared tenant database and
  `search_path` resolves the names. A test enforces this.
- The app role is not a superuser: no `CREATE EXTENSION`, no `CREATE ROLE`, no
  new schemas.
- A database built before this (schema in `public`, identity table at
  `auth.users`) is **adopted**, not rebuilt: the baseline is recorded as already
  applied and `0002` moves `auth.users` into the app's schema as `auth_users`.
- `db/migrations/` + `backend/init/` are the historical Supabase-era path, kept
  for the compose stack's first-boot seed. Never edit an applied migration —
  add a new one.
- See `docs/deploy/console-platform-template.md` for the platform contract.
- File uploads go to local disk backed by a named Docker volume.

### UI System

Design system: "LPQ Aurora Neo-Glass" — frosted glass, aurora teal-cyan-blue-violet palette, neumorphic depth, spring animations. Uses shadcn/ui components in `src/components/ui/`, domain components in `src/components/`.

### Key Directories

```
src/components/dashboard/admin/  — 36 admin management panels
src/components/dashboard/shared/ — shared dashboard widgets
src/contexts/                    — Auth + Theme providers
src/hooks/                       — custom hooks (attendance, search, media)
src/lib/                         — API client, adapters, utilities
src/pages/                       — route-level page components
backend/internal/handler/        — Go HTTP handlers per domain
backend/internal/migrate/sql/    — schema the app applies at startup (embedded)
db/migrations/                   — historical Supabase-era migrations
db/seed.sql                      — demo seed data
docs/migration/                  — auth/authz specs, DB extraction script
docs/archive/supabase-era/       — historical reports (read-only)
tools/                           — build scripts (LLMS generator)
```

## Environment

Copy `.env.example` to `.env.local` and set `VITE_API_URL` to the Go backend (default `http://localhost:8080`). See `SETUP.md` for the Docker-based local setup.

## Conventions

- Adapters own all backend calls — components don't call `fetch` or `apiClient` directly
- Implement features end-to-end: migration → authz → handler → adapter → validation → UI
- Partial updates for edit forms (don't send full payload)
- Don't hardcode data that should come from the backend
- Don't disable fields or features just because schema doesn't support them yet — extend the schema
- Conventional commits: `feat:`, `fix:`, `chore:`, `test:`, `docs:`
