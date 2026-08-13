-- =================================================================================================
-- DIAGNOSTIC QUERY: Inspect mmq_attendance check constraints
-- You can run this in the Supabase SQL Editor to verify the constraint.
-- =================================================================================================

SELECT
    con.conname AS constraint_name,
    pg_get_constraintdef(con.oid) AS check_clause
FROM
    pg_constraint con
JOIN
    pg_class rel ON rel.oid = con.conrelid
JOIN
    pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE
    rel.relname = 'mmq_attendance'
    AND con.contype = 'c';
