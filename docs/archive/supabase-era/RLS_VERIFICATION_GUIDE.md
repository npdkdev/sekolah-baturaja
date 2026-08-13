# Row Level Security (RLS) Verification & Testing Guide

This guide outlines the purpose, expected behaviors, and testing procedures for the Row Level Security (RLS) policies implemented in the LPQ Al-Fath Maulana database.

## 1. Table RLS Overview

| Table | Purpose | RLS Status | Roles Authorized |
|-------|---------|------------|------------------|
| `santri` | Stores student data | Enabled | **Admin**: All. **Guru**: Select, Update own students. **Santri**: Select own. |
| `guru` | Stores teacher data | Enabled | **Admin**: All. **Guru**: Select all, Update own. |
| `classes` | Class assignments | Enabled | **Admin**: All. **Guru**: Select, Update own class. |
| `payments` | Financial records | Enabled | **Admin**: All. **Guru**: Select for own class. **Santri**: Select own. |
| `hafalan_progress` | Progress tracking | Enabled | **Admin**: All. **Guru**: Insert/Update/Select. **Santri**: Select own. |
| `murojaah_submissions`| Voice recordings | Enabled | **Admin**: All. **Guru**: Select/Insert/Update. **Santri**: Insert/Select own. |
| `attendance` | Daily check-ins | Enabled | **Admin**: All. **Guru**: Select/Insert. **Santri**: Select own. |

## 2. Expected Behavior by Role

*   **Admin**: Unrestricted access to manage all operational tables. Can view, insert, update, and delete global records.
*   **Guru (Teacher)**: Scoped access. Can view and modify records belonging to their assigned classes (Santri, Hafalan, Attendance). Cannot view or modify global financials or settings outside their purview.
*   **Santri (Student)**: Highly restricted. Can only view records where `user_id` or `santri_id` strictly matches their own `auth.uid()`. Can insert entries like `murojaah_submissions` mapping to their own ID.
*   **Anonymous**: Only allowed to view generic public tables (`website_content`, `news`, `announcements`, `academic_calendar`).

## 3. Step-by-Step Testing Instructions

### A. Dashboard Access (Role Routing)
1. Log in as an **Admin**, **Guru**, and **Santri** in separate incognito sessions.
2. Verify that upon login, no "Permission Denied" errors appear in the browser console.
3. Verify routing correctly lands on `/dashboard` and loads the respective Role-specific dashboard component.

### B. Payments View
1. **Admin**: Navigate to Admin Dashboard -> Keuangan. Ensure all payments across the institution load successfully.
2. **Guru**: Unrelated sections like Global Finances should not be accessible.
3. **Santri**: Navigate to Santri Dashboard -> Pembayaran. Only the logged-in Santri's payment history should be visible.

### C. Santri Data View & Update
1. **Guru**: In the Guru Dashboard, check the class table. It should load all Santri strictly mapped to the Guru's `class_id`.
2. **Guru**: Attempt to update a Santri's Jilid. The database operation should return `200 OK`.

### D. Murojaah Submissions
1. **Santri**: Go to Dashboard -> Setoran. Upload a mock audio file.
2. *Expected Result*: Successful insert. The file uploads to the `murojaah-recordings` bucket, and the row inserts into `murojaah_submissions`.
3. **Guru**: Go to Dashboard -> Periksa Setoran. The guru should see the pending submission, be able to add feedback, and save it.

### E. Hafalan Progress
1. **Guru**: Open Hafalan modal for a specific student.
2. Click to toggle a Doa/Surat checkmark.
3. *Expected Result*: The database runs an Upsert (`INSERT` or `UPDATE`). A success toast appears. Upon page refresh, the checkmark persists.

## 4. Common RLS Error Messages & Debugging

| Error Message | Meaning | Resolution |
|---------------|---------|------------|
| `permission denied for table X` | The user's role does not satisfy the `USING` clause of the SELECT/UPDATE/DELETE policy. | Check JWT claims and the `get_user_role()` mapping. Ensure the UUID in the JWT matches the target row's owner ID. |
| `new row violates row-level security policy` | The `WITH CHECK` clause failed during an `INSERT` or `UPDATE` operation. | Verify the payload payload includes the correct IDs (e.g., `santri_id = auth.uid()`). |
| `infinite recursion detected in policy` | The policy calls a function that queries the same table, directly or indirectly. | Use `SECURITY DEFINER` and leverage JWT claims (`auth.jwt()`) to check roles instead of performing `SELECT` queries in the policy. |

### How to Inspect JWT Claims during Debugging:
Run the following SQL snippet in the Supabase SQL Editor while impersonating a user to see what RLS is evaluating:
