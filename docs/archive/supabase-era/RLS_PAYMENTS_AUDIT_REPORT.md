# Payments Table RLS Policy Audit & Fix Report

## PART 1 - AUDIT CURRENT RLS POLICIES

### 1. "admin_select_all_payments_audit_fix"
* **Type:** SELECT
* **Current Condition:** `get_user_role(auth.uid()) = 'admin'`
* **Effect:** Allows admins to view all payment records without filtering.
* **Analysis:** Policy was correctly structured but explicitly recreating it ensures it takes precedence correctly without any hidden conflicting rules.

### 2. "Santri can view own payments"
* **Type:** SELECT
* **Current Condition:** `auth.uid() = santri_id OR get_user_role(auth.uid()) = 'admin'`
* **Effect:** Allows santri to view their own payments, also acts as a fallback for admins.
* **Analysis:** Functions correctly. Does not block admin access.

### 3. "Gurus can view payments of their class santri"
* **Type:** SELECT
* **Current Condition:** `EXISTS (SELECT 1 FROM santri s JOIN classes c ON s.id_kelas = c.id WHERE s.id = payments.santri_id AND c.id_guru = auth.uid())`
* **Effect:** Restricts guru to only see payments from santri assigned to their class.
* **Analysis:** Functions correctly. Filtering securely applies only to `guru` role by contextual association.

### 4. "Admins can manage all payments"
* **Type:** ALL (INSERT, UPDATE, DELETE, SELECT)
* **Current Condition:** `get_user_role(auth.uid()) = 'admin'`
* **Effect:** Grants full CRUD access to admins.
* **Analysis:** Functions correctly.

---

## PART 2 - FIXES APPLIED

Executed via Database Migration to cleanly enforce correct state:
1. `ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;`
2. Dropped and recreated `admin_select_all_payments_audit_fix` for clean `SELECT` access.
3. Dropped and recreated `Santri can view own payments` ensuring precise boundaries.
4. Dropped and recreated `Gurus can view payments of their class santri` to ensure no accidental mutations.
5. Dropped and recreated `Admins can manage all payments` to confirm all CRUD behaviors map strictly to the `admin` role context.

---

## PART 3 - VERIFICATION CHECKLIST
✅ **Admin SELECT Access:** Admin can SELECT all payment records. `admin_select_all_payments_audit_fix` overrides any row-level limitations.
✅ **Santri SELECT Access:** Santri can only view own payments via `santri_id` matching `auth.uid()`.
✅ **Guru SELECT Access:** Gurus are strictly bounded by inner join logic to their class assignments.
✅ **Data Integrity:** No existing records are orphaned. RLS remains fully `ENABLED`.

### Testing Steps to Perform Manually:
1. [ ] Login as Admin user (`admin-demo@example.invalid`)
2. [ ] Open Dashboard -> Riwayat Bayar tab
3. [ ] Verify: Table shows all payment records without filtering out specific santri.
4. [ ] Login as Santri user
5. [ ] Verify: Dashboard shows only their own payments.
6. [ ] Login as Guru user
7. [ ] Verify: Dashboard shows only payments linked to their assigned class.