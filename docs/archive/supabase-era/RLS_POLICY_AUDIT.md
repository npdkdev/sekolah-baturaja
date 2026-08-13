# RLS Policy Audit Document

This document tracks critical Row Level Security (RLS) policies implemented or fixed across major tables to ensure data isolation, security, and valid access paths for respective user roles.

## 1. Payments Table
**Table Name:** `payments`
**Policy Name:** `Santri can view own payments`
**Policy Type:** `SELECT`
**Condition:** `(auth.uid() = santri_id)`
**Purpose:** Restricts payment record visibility so that Santri users can only fetch and view their own financial records. Protects privacy between students.
**Test Case:**
- Login as Santri A (auth.uid() = 123)
- Query: `supabase.from('payments').select('*')`
- Expected: Returns only rows where `santri_id = 123`. Attempting to fetch another student's ID directly yields no results.

## 2. Attendance Table
**Table Name:** `attendance`
**Policy Name:** `Santri view own attendance`
**Policy Type:** `SELECT`
**Condition:** `(auth.uid() = user_id)`
**Purpose:** Replaces an overly permissive authenticated user read policy. Now strictly isolates attendance viewing to the owning Santri, while separate policies grant Guru and Admin broader visibility.
**Test Case:**
- Login as Santri B (auth.uid() = 456)
- View the "Rekap Absensi" tab.
- Expected: Successfully loads daily attendance summary showing only their check-ins. Other santri's attendance data returns a 0-row array.

## 3. Murojaah Submissions Table
**Table Name:** `murojaah_submissions`
**Policy Name:** `Guru can insert murojaah submissions`
**Policy Type:** `INSERT`
**Condition:** `((target_guru_id = auth.uid()) OR (EXISTS (SELECT 1 FROM santri s JOIN classes c ON s.id_kelas = c.id WHERE s.id = santri_id AND c.id_guru = auth.uid())))`
**Purpose:** Defines authorized insert paths for `murojaah_submissions` preventing unauthorized manipulation while allowing legitimate teachers to enter manual submission records or feedback on behalf of the students they evaluate.
**Test Case:**
- Login as Guru C (auth.uid() = 789)
- Use "Input Setoran Manual" feature from Guru Dashboard. Payload includes `santri_id` (student in Guru C's class), `category`, `item_name`, and `target_guru_id`.
- Expected: RLS evaluates true. Database successfully creates the row without violating `WITH CHECK` conditions.

---
**Maintaining RLS Safety:**
Whenever adding new tables or roles, strictly reference `auth.uid()` mapped against a direct column reference or a minimal JOIN condition. Avoid using raw permissive rules (`USING (true)`) in multi-tenant environments.
