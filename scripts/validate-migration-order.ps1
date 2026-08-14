$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$migrationDir = Join-Path $root "supabase/migrations"

if (!(Test-Path $migrationDir)) {
  Write-Error "Migration directory not found."
  exit 1
}

$files = Get-ChildItem $migrationDir -File -Filter "*.sql" | Sort-Object Name
$expectedNames = @(
  "20260624000100_extensions_and_types.sql",
  "20260624000200_user_profiles_and_roles.sql",
  "20260624000300_guru_santri_and_auth_aliases.sql",
  "20260624000400_classes_memberships_and_mutations.sql",
  "20260624000500_class_assignments.sql",
  "20260624000600_attendance.sql",
  "20260624000700_payments_expenses_and_payment_status.sql",
  "20260624000800_hafalan_and_murojaah.sql",
  "20260624000900_academic_calendar.sql",
  "20260624001000_mmq_core.sql",
  "20260624001100_mmq_assignments_extension.sql",
  "20260624001200_content_news_announcements_feedbacks.sql",
  "20260624001300_notifications_and_santri_notes.sql",
  "20260624001400_audit_triggers_and_updated_at.sql",
  "20260624001500_rls_helper_functions.sql",
  "20260624001600_rls_policies.sql",
  "20260624001700_storage_buckets_and_policies.sql",
  "20260624001800_indexes_and_final_constraints.sql",
  "20260624001900_move_santri_to_class_rpc.sql",
  "20260624002000_payments_period_uniqueness.sql",
  "20260624002100_santri_legacy_fields_and_media_player.sql",
  "20260629000100_fix_login_logs_rls_admin_read.sql",
  "20260716000100_santri_default_spp_and_hafalan_curriculum.sql",
  "20260716000200_santri_development_scoring.sql",
  "20260716000300_login_activity_logs.sql",
  "20260716000400_jilid_history.sql",
  "20260717000100_change_santri_category_rpc.sql",
  "20260717000200_optional_nomor_induk_for_adult_santri.sql",
  "20260717000300_santri_archive_workflow.sql",
  "20260717000400_ptpt_tahfizh_curriculum.sql",
  "20260721000100_guru_avatar_path.sql",
  "20260721000200_attendance_actual_session.sql",
  "20260721000300_change_santri_category_ptpt.sql",
  "20260721000400_whatsapp_group_links.sql",
  "20260721000500_backend_migration_privileges.sql",
  "20260722000100_restrict_admin_to_official_email.sql",
  "20260722000200_santri_first_attendance_per_day.sql",
  "20260722000300_atomic_guru_account_update.sql",
  "20260723000100_guru_student_class_transfer.sql",
  "20260723000200_enable_guru_admin_roles.sql",
  "20260723000300_increment_santri_points.sql",
  "20260724000100_whatsapp_group_links_guru_read.sql",
  "20260725000100_pentashih_full_read_access_rls.sql",
  "20260725000200_jilid_history_pentashih_rls.sql",
  "20260726000100_forum_topics_and_replies.sql",
  "20260805000100_add_tata_usaha_role.sql",
  "20260806000100_academic_calendar_multi_event.sql",
  "20260806000200_classes_kapasitas.sql",
  "20260806000300_santri_parent_details.sql",
  "20260806000400_santri_school_identity.sql",
  "20260806000500_jadwal_pelajaran.sql",
  "20260806000600_admin_email_domain.sql",
  "20260806000700_superadmin_role.sql",
  "20260807000100_pendaftaran_ppdb.sql",
  "20260807000200_ppdb_terima_jadi_murid.sql",
  "20260808000100_ppdb_wilayah_domisili.sql",
  "20260809000100_academic_calendar_month_settings.sql",
  "20260809000200_academic_calendar_month_settings_read_access.sql",
  "20260809000300_payment_item_settings.sql",
  "20260811000100_news_cms_lifecycle.sql"
)

$actualNames = $files | ForEach-Object { $_.Name }

if ($actualNames.Count -ne $expectedNames.Count) {
  Write-Error "Expected $($expectedNames.Count) migration files, found $($actualNames.Count)."
  exit 1
}

for ($i = 0; $i -lt $expectedNames.Count; $i++) {
  if ($actualNames[$i] -ne $expectedNames[$i]) {
    Write-Error "Migration order/name mismatch at index $i. Expected $($expectedNames[$i]), got $($actualNames[$i])."
    exit 1
  }
}

foreach ($file in $files) {
  if ($file.Name -notmatch "^\d{14}_[a-z0-9_]+\.sql$") {
    Write-Error "Migration does not match Supabase timestamp pattern: $($file.Name)"
    exit 1
  }
  if ($file.Name -match "seed") {
    Write-Error "Seed-like migration is not allowed: $($file.Name)"
    exit 1
  }
}

$beforeMmq = $files | Where-Object { $_.Name -lt "20260624001000_mmq_core.sql" }
foreach ($file in $beforeMmq) {
  $content = Get-Content -Raw $file.FullName
  if ($content -match "mmq_schedule") {
    Write-Error "mmq_schedule referenced before MMQ core migration: $($file.Name)"
    exit 1
  }
}

Write-Host "Migration order and MMQ dependency checks passed."
exit 0
