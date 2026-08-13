# FINAL ROOT CAUSE & RLS FIX REPORT: `payments` Table

## 1. Investigation Findings: The Root Cause

The investigation into why the Admin could not view `payments` table data despite having a seemingly permissive RLS policy (`USING (get_user_role(auth.uid()) = 'admin')`) revealed a fundamental flaw in the **`get_user_role()`** database function.

### What went wrong:
1. When the user `admin-demo@example.invalid` signs in, their JSON Web Token (JWT) provided by Supabase often lacks the `"role": "admin"` claim inside `user_metadata`.
2. The `get_user_role()` function checked the JWT metadata, then fell back to checking if the `auth.uid()` existed in the `public.guru` or `public.santri` tables.
3. Because the Admin is neither a Guru nor a Santri, and the JWT metadata was missing the role, **`get_user_role()` returned `NULL`**.
4. Since `NULL = 'admin'` evaluates to `FALSE`, the RLS policy `payments_admin_select` blocked the query entirely. No records were returned.

## 2. The Critical Fix Implemented

Instead of just modifying the RLS policies, we implemented an **absolute failsafe** directly into the `get_user_role()` function.

Since `get_user_role()` is executed with `SECURITY DEFINER` (giving it elevated database privileges), it can query the hidden `auth.users` table directly.

### The Patch:
