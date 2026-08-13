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
```

No test framework is configured. Validation is lint + build.

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
- Postgres schema lives in `db/migrations/` (ordered SQL) plus `db/seed.sql`. `backend/docker-compose.yml` mounts both into the Postgres init phase.
- The migrations still carry the original RLS policies; the Go layer enforces authorization in middleware — see `docs/migration/authz-spec.md`.
- Never edit an applied migration — add a new one.
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
db/migrations/                   — ordered SQL migrations
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
