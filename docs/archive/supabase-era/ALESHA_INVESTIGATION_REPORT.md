# CRITICAL DEBUG: Santri Data Display Investigation (Alesha Putri Rizaldi)

## Investigation Steps & Findings

### STEP 1 - Find Santri User Details
- **Finding:** The record for "Alesha Putri Rizaldi" successfully exists within the `public.santri` table. Her unique UUID is properly associated with her profile.

### STEP 2 & 3 - Check Attendance & Payment Records
- **Finding:** Records physically **exist** in both `public.attendance` (linked via `user_id`) and `public.payments` (linked via `santri_id`). The data is correctly populated in the database.

### STEP 4 - Check Auth User Mapping
- **Finding:** Many legacy or table-based Santri users (including Alesha) either do not have a mapped record in the `auth.users` schema or utilize a legacy login system that bypasses standard Supabase Auth.

### STEP 5 & 6 - Test RLS Policy & Auth Context (Root Cause Analysis)
- **ROOT CAUSE IDENTIFIED:**
  The queries inside `SantriDashboard.jsx` are correct (`.eq('user_id', santri.id)` and `.eq('santri_id', santri.id)`).

  The failure occurs in the **Authentication Context** (`SupabaseAuthContext.jsx`). For legacy users who log in manually via the `santri` table lookup, the system was generating a **"Mock Session"** (`access_token: 'mock-token-manual-login'`).

  Because this mock token is not a cryptographically valid Supabase JWT, the Supabase PostgreSQL backend treats all outgoing API requests as **Anonymous** requests.

  The Row Level Security (RLS) policies on the `attendance` and `payments` tables strictly enforce identity checks (`user_id = auth.uid()` and `santri_id = auth.uid()`). Since `auth.uid()` resolves to `NULL` for anonymous requests, the database securely blocked the read operation, returning an empty array (`[]`) to the dashboard, resulting in zeroes and missing payment records.

## Applied Fix
I have updated `src/contexts/SupabaseAuthContext.jsx`. The authentication flow now aggressively leverages the custom backend RPC function (`signin_with_username`).

This RPC function validates the credentials and **dynamically generates a true, cryptographically signed JWT** containing the correct `sub` claim (which perfectly maps to `auth.uid()`).

By passing this authentic JWT back to the client via `supabase.auth.setSession()`, all subsequent requests carry the correct identity. The RLS policies now evaluate `auth.uid()` accurately, permitting the santri to securely view their own attendance and payment records.
