
# SANTRI DATA SOURCES VERIFICATION REPORT

**Date of Verification:** 2026-06-23
**Target:** `santri` table and Authentication Data Sources

---

## 1. Executive Summary
The `santri` table serves as the primary data source for all student-related operations, including custom authentication. Unlike standard Supabase setups that rely entirely on `auth.users`, Santri login is handled via a custom Remote Procedure Call (RPC) `signin_with_username()`. This RPC validates credentials directly against the `santri` table and returns a custom signed JWT.

The table supports two categories of students with different login mechanisms:
- **Santri Dewasa (Adults):** Uses `email` and `password`.
- **Santri Anak/TPQ (Children):** Uses `nama_panggilan` (as username) and `nomor_induk_qiroati` (as password).

---

## 2. Table Schema & Constraints
**Table Name:** `public.santri`

| Column Name | Data Type | Constraint | Usage / Notes |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | `PRIMARY KEY` | Unique identifier |
| `nama_lengkap` | `text` | `NOT NULL` | Full legal name |
| `nama_panggilan` | `text` | `NULLABLE` | **Used as Username for TPQ Login** |
| `nomor_induk_qiroati` | `text` | `NULLABLE` | **Used as Password for TPQ Login** |
| `email` | `text` | `NULLABLE` | Used as Username for Dewasa Login |
| `password` | `text` | `NULLABLE` | Used as Password for Dewasa Login |
| `id_kelas` | `uuid` | `FOREIGN KEY` | Links to `classes.id` |
| `kategori` | `text` | `NULLABLE` | Determines login flow (e.g., 'Anak', 'Dewasa') |
| `status` | `text` | `NULLABLE` | 'Aktif', 'Lulus', etc. |
| `jilid` | `text` | `NULLABLE` | Current academic level |
| `points` | `integer` | `NULLABLE` | Gamification / Activity points |

---

## 3. Login Mechanism Documentation
The authentication mechanism bypasses the default `auth.users` check for Santri and routes through the `signin_with_username(p_username, p_password)` function.

### Authentication Flow:
1. **Input Submission:** User enters `nama_panggilan` and `nomor_induk_qiroati` in the UI.
2. **RPC Invocation:** The client calls `supabase.rpc('signin_with_username', { p_username, p_password })`.
3. **Database Evaluation (TPQ Fallback):**
