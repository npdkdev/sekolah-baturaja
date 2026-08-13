-- ============================================================================
-- DATABASE INSPECTION SCRIPT
-- ============================================================================
-- This script is designed to be run in the Supabase SQL Editor or a PostgreSQL client.
-- It retrieves detailed metadata about the database schema and structure,
-- as well as sample data from user tables.

-- ============================================================================
-- 1. EXTENSIONS
-- List all installed extensions in the database.
-- ============================================================================
SELECT '--- EXTENSIONS ---' as section_header;
SELECT
    extname as extension_name,
    extversion as version
FROM pg_extension
ORDER BY extname;

-- ============================================================================
-- 2. ROLES
-- List database roles (users) and their attributes.
-- ============================================================================
SELECT '--- ROLES ---' as section_header;
SELECT
    rolname as role_name,
    rolsuper as is_superuser,
    rolinherit as inherits_privileges,
    rolcreaterole as can_create_roles,
    rolcreatedb as can_create_db,
    rolcanlogin as can_login,
    rolreplication as can_replicate,
    rolbypassrls as can_bypass_rls
FROM pg_roles
ORDER BY rolname;

-- ============================================================================
-- 3. TABLES AND COLUMNS
-- List all tables in the 'public' schema with their columns and data types.
-- ============================================================================
SELECT '--- TABLES AND COLUMNS ---' as section_header;
SELECT
    table_name,
    ordinal_position,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- ============================================================================
-- 4. VIEWS
-- List all views in the 'public' schema with their definitions.
-- ============================================================================
SELECT '--- VIEWS ---' as section_header;
SELECT
    table_name as view_name,
    view_definition
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- ============================================================================
-- 5. FUNCTIONS
-- List all user-defined functions in the 'public' schema.
-- ============================================================================
SELECT '--- FUNCTIONS ---' as section_header;
SELECT
    routine_name as function_name,
    routine_type,
    data_type as return_type,
    external_language as language,
    security_type
FROM information_schema.routines
WHERE specific_schema = 'public'
ORDER BY routine_name;

-- ============================================================================
-- 6. TRIGGERS
-- List all triggers on tables in the 'public' schema.
-- ============================================================================
SELECT '--- TRIGGERS ---' as section_header;
SELECT
    event_object_table as table_name,
    trigger_name,
    event_manipulation as event,
    action_statement as action,
    action_timing as timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ============================================================================
-- 7. RLS POLICIES
-- List all Row Level Security (RLS) policies.
-- ============================================================================
SELECT '--- RLS POLICIES ---' as section_header;
SELECT
    tablename,
    policyname,
    permissive,
    roles,
    cmd as command,
    qual as using_expression,
    with_check as with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================================================
-- 8. INDEXES
-- List all indexes on tables in the 'public' schema.
-- ============================================================================
SELECT '--- INDEXES ---' as section_header;
SELECT
    tablename,
    indexname,
    indexdef as definition
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- ============================================================================
-- 9. PUBLICATIONS (REALTIME)
-- List all publications (used for Realtime features).
-- ============================================================================
SELECT '--- PUBLICATIONS ---' as section_header;
SELECT
    pubname as publication_name,
    pubowner,
    puballtables as all_tables,
    pubinsert as insert_event,
    pubupdate as update_event,
    pubdelete as delete_event
FROM pg_publication;

-- ============================================================================
-- 10. SAMPLE DATA (LIMIT 5)
-- Display a sample of data from each user table to verify content.
-- ============================================================================

SELECT '--- SAMPLE: website_content ---' as table_info;
SELECT * FROM public.website_content LIMIT 5;

SELECT '--- SAMPLE: guru ---' as table_info;
SELECT * FROM public.guru LIMIT 5;

SELECT '--- SAMPLE: classes ---' as table_info;
SELECT * FROM public.classes LIMIT 5;

SELECT '--- SAMPLE: santri ---' as table_info;
SELECT * FROM public.santri LIMIT 5;

SELECT '--- SAMPLE: mmq_notulensi ---' as table_info;
SELECT * FROM public.mmq_notulensi LIMIT 5;

SELECT '--- SAMPLE: payments ---' as table_info;
SELECT * FROM public.payments LIMIT 5;

SELECT '--- SAMPLE: feedbacks ---' as table_info;
SELECT * FROM public.feedbacks LIMIT 5;

SELECT '--- SAMPLE: announcements ---' as table_info;
SELECT * FROM public.announcements LIMIT 5;

SELECT '--- SAMPLE: mmq_absensi ---' as table_info;
SELECT * FROM public.mmq_absensi LIMIT 5;

SELECT '--- SAMPLE: news ---' as table_info;
SELECT * FROM public.news LIMIT 5;

SELECT '--- SAMPLE: forum_topics ---' as table_info;
SELECT * FROM public.forum_topics LIMIT 5;

SELECT '--- SAMPLE: forum_replies ---' as table_info;
SELECT * FROM public.forum_replies LIMIT 5;

SELECT '--- SAMPLE: hafalan_items ---' as table_info;
SELECT * FROM public.hafalan_items LIMIT 5;

SELECT '--- SAMPLE: hafalan_progress ---' as table_info;
SELECT * FROM public.hafalan_progress LIMIT 5;

SELECT '--- SAMPLE: murojaah_submissions ---' as table_info;
SELECT * FROM public.murojaah_submissions LIMIT 5;

SELECT '--- SAMPLE: expenses ---' as table_info;
SELECT * FROM public.expenses LIMIT 5;

SELECT '--- SAMPLE: class_mutations ---' as table_info;
SELECT * FROM public.class_mutations LIMIT 5;

SELECT '--- SAMPLE: jilid_history ---' as table_info;
SELECT * FROM public.jilid_history LIMIT 5;

SELECT '--- SAMPLE: attendance ---' as table_info;
SELECT * FROM public.attendance LIMIT 5;

SELECT '--- SAMPLE: login_logs ---' as table_info;
SELECT * FROM public.login_logs LIMIT 5;

SELECT '--- SAMPLE: visitor_stats ---' as table_info;
SELECT * FROM public.visitor_stats LIMIT 5;

SELECT '--- SAMPLE: santri_notes ---' as table_info;
SELECT * FROM public.santri_notes LIMIT 5;

SELECT '--- SAMPLE: notifications ---' as table_info;
SELECT * FROM public.notifications LIMIT 5;
