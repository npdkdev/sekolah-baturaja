# FINAL RLS POLICY INVESTIGATION AND FIX REPORT: `payments` Table

## 1. Objective Completed
We systematically evaluated the Row Level Security policies on the `payments` table to identify and override any strict constraints blocking `admin` users from querying the database while retaining restrictions for users with the `santri` and `guru` roles.

## 2. Findings and Logic Applied
In PostgreSQL, `PERMISSIVE` policies implicitly evaluate using `OR`. Therefore, if an admin policy like `payments_admin_select` exists and correctly evaluates to `true`, the query should bypass `payments_santri_select`.

However, to provide a **100% unbreakable failsafe** per your requirements, we directly injected the `get_user_role(auth.uid()) = 'admin'` condition into the potentially problematic role-scoped policies.

## 3. The `ALTER POLICY` Fixes Executed

We directly targeted the policies most likely to cause blockages in edge-case scenarios:

### Fix 1: Santri Select Policy
The policy specifically restricting users to their own `santri_id` was altered.
**Action:**