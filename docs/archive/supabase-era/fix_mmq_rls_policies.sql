-- =================================================================================================
-- FIX MMQ RLS POLICIES MIGRATION
-- Explaining Syntax Requirements:
-- 1. SELECT uses USING (evaluates existing rows)
-- 2. INSERT uses WITH CHECK (evaluates new rows being added)
-- 3. UPDATE uses USING (for rows to modify) AND WITH CHECK (for the new data state)
-- 4. DELETE uses USING (evaluates existing rows to delete)
-- =================================================================================================

-- 1. DROP EXISTING POLICIES FOR mmq_schedule
DROP POLICY IF EXISTS "Public read mmq_schedule" ON mmq_schedule;
DROP POLICY IF EXISTS "Guru read mmq_schedule" ON mmq_schedule;
DROP POLICY IF EXISTS "Admin full access to mmq_schedule" ON mmq_schedule;
DROP POLICY IF EXISTS "Admin insert mmq_schedule" ON mmq_schedule;
DROP POLICY IF EXISTS "Admin update mmq_schedule" ON mmq_schedule;
DROP POLICY IF EXISTS "Admin delete mmq_schedule" ON mmq_schedule;

-- 2. CREATE NEW POLICIES FOR mmq_schedule
-- SELECT: Public can read
CREATE POLICY "Public read mmq_schedule" ON mmq_schedule FOR SELECT USING (true);
-- INSERT: Admins only (WITH CHECK)
CREATE POLICY "Admin insert mmq_schedule" ON mmq_schedule FOR INSERT WITH CHECK (get_user_role(auth.uid()) = 'admin');
-- UPDATE: Admins only (USING and WITH CHECK)
CREATE POLICY "Admin update mmq_schedule" ON mmq_schedule FOR UPDATE USING (get_user_role(auth.uid()) = 'admin') WITH CHECK (get_user_role(auth.uid()) = 'admin');
-- DELETE: Admins only (USING)
CREATE POLICY "Admin delete mmq_schedule" ON mmq_schedule FOR DELETE USING (get_user_role(auth.uid()) = 'admin');

-- 3. DROP EXISTING POLICIES FOR mmq_attendance
DROP POLICY IF EXISTS "Admin full access to mmq_attendance" ON mmq_attendance;
DROP POLICY IF EXISTS "Admin full access mmq_attendance" ON mmq_attendance;
DROP POLICY IF EXISTS "Guru update own mmq_attendance" ON mmq_attendance;
DROP POLICY IF EXISTS "Guru insert own mmq_attendance" ON mmq_attendance;
DROP POLICY IF EXISTS "Guru read own mmq_attendance" ON mmq_attendance;

-- 4. CREATE NEW POLICIES FOR mmq_attendance
-- Admin: Full Access
CREATE POLICY "Admin full access mmq_attendance" ON mmq_attendance FOR ALL USING (get_user_role(auth.uid()) = 'admin') WITH CHECK (get_user_role(auth.uid()) = 'admin');
-- Guru: Read Own (USING)
CREATE POLICY "Guru read own mmq_attendance" ON mmq_attendance FOR SELECT USING (guru_id = auth.uid());
-- Guru: Insert Own (WITH CHECK)
CREATE POLICY "Guru insert own mmq_attendance" ON mmq_attendance FOR INSERT WITH CHECK (guru_id = auth.uid());
-- Guru: Update Own (USING and WITH CHECK)
CREATE POLICY "Guru update own mmq_attendance" ON mmq_attendance FOR UPDATE USING (guru_id = auth.uid()) WITH CHECK (guru_id = auth.uid());

-- 5. DEFAULT MMQ SCHEDULE ENTRY
-- Insert default Friday 10:00 AM schedule if none exists for Friday (5)
INSERT INTO mmq_schedule (day_of_week, start_time, location, is_active)
SELECT 5, '10:00:00', 'LPQ Al-Fath Maulana', true
WHERE NOT EXISTS (SELECT 1 FROM mmq_schedule WHERE day_of_week = 5);

-- 6. VERIFICATION QUERIES (To be run by Admin in SQL Editor)
-- Check the new policies
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('mmq_schedule', 'mmq_attendance')
ORDER BY tablename, policyname;
