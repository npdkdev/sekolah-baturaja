$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$checks = @()

function Add-Check {
  param(
    [string]$Name,
    [scriptblock]$Test
  )

  try {
    & $Test
    $script:checks += [pscustomobject]@{ Name = $Name; Status = "PASS" }
  } catch {
    $script:checks += [pscustomobject]@{ Name = $Name; Status = "FAIL"; Error = $_.Exception.Message }
  }
}

function Read-Text {
  param([string]$Path)
  return Get-Content -Raw -LiteralPath $Path
}

Add-Check "schema checker treats restored media player tables as optional until deployed" {
  $text = Read-Text "src/utils/verifyDatabaseSchema.js"
  if ($text -match "enableDeferredFeatures") { throw "media player tables are still treated as deferred in schema checker" }
  if ($text -notmatch "media_player_settings" -or $text -notmatch "music_files") { throw "restored media player tables are not checked" }
  if ($text -notmatch "optionalTables") { throw "optional table handling missing" }
  if ($text -notmatch "optional_missing") { throw "missing media tables still look fatal" }
}

Add-Check "media player hook queries restored playlist tables" {
  $text = Read-Text "src/hooks/useMediaPlayer.js"
  if ($text -match "enableDeferredFeatures") { throw "hook is still gated by deferred features" }
  if ($text -notmatch "from\('music_files'\)") { throw "hook does not read playlist table" }
  if ($text -notmatch "from\('media_player_settings'\)") { throw "hook does not persist player settings" }
}

Add-Check "media player settings is active and uses restored storage/table" {
  $text = Read-Text "src/components/dashboard/admin/MediaPlayerSettings.jsx"
  if ($text -match "enableDeferredFeatures") { throw "settings dialog is still gated by deferred features" }
  if ($text -notmatch "storage\.from\('music-files'\)") { throw "settings dialog does not upload to music-files bucket" }
  if ($text -notmatch "from\('music_files'\)") { throw "settings dialog does not persist playlist rows" }
}

Add-Check "digital attendance mounts media player while game shortcuts stay feature gated" {
  $text = Read-Text "src/pages/DigitalAttendancePage.jsx"
  if ($text -notmatch "<MediaPlayerWidget />") { throw "media player widget is not mounted" }
  if ($text -notmatch "enableGameFeatures &&") { throw "game attendance shortcuts are not feature gated" }
}

Add-Check "website content helper always sends non-null content field" {
  $text = Read-Text "src/lib/publicContentAdapters.js"
  if ($text -notmatch "normalizeWebsiteContentValue") { throw "normalizer missing" }
  if ($text -notmatch "content:\s*normalizedContent") { throw "single upsert does not include normalized content" }
  if ($text -notmatch "content:\s*normalizeWebsiteContentValue\(item.content\)") { throw "bulk upsert does not include normalized content" }
}

Add-Check "logo upload saves url before showing success" {
  $text = Read-Text "src/components/dashboard/admin/ContentManagement.jsx"
  if ($text -notmatch "assertNonEmptyWebsiteContentString\('logoUrl', publicUrl\)") { throw "logo URL is not validated" }
  if ($text -notmatch "saveWebsiteContentItem\(\{ key: 'logoUrl', content: logoUrl, isPublic: true \}\)") { throw "logo is not persisted with content payload" }
  if ($text -notmatch "Logo Disimpan!") { throw "success toast is not tied to database save" }
}

Add-Check "avatar upload uses direct Storage first and authenticated Edge fallback" {
  $text = Read-Text "src/lib/storageAdapters.js"
  if ($text -notmatch "uploadDirectlyToStorage") { throw "direct Storage upload helper missing" }
  if ($text -notmatch "\.upload\(path, file") { throw "direct Storage upload does not write deterministic avatar path" }
  if ($text -notmatch "upsert:\s*true") { throw "avatar upload is not replacing the old object" }
  if ($text -notmatch "supabase\.auth\.getSession\(\)") { throw "session is not loaded before signed upload" }
  if (-not $text.Contains('Authorization: `Bearer ${accessToken}`')) { throw "user access token is not sent to Edge Function" }
  if ($text -notmatch "apikey:\s*supabaseAnonKey") { throw "publishable key header missing" }
  if ($text -notmatch "/functions/v1/generate-signed-upload-url") { throw "function endpoint is not explicit" }
  if ($text -notmatch "Edge Function upload juga gagal") { throw "direct and Edge Function errors are not both surfaced" }
}

Add-Check "edge functions allow Vercel staging origins" {
  $text = Read-Text "supabase/functions/_shared/cors.ts"
  if ($text -notmatch "vercel\\.app") { throw "Vercel origins are not allowed by Edge Function CORS" }
  if ($text -notmatch "ALLOWED_ORIGINS") { throw "custom allowed origins env is missing" }
}

Add-Check "santri login supports nickname alias without custom JWT" {
  $fn = Read-Text "supabase/functions/signin-with-nomor-induk/index.ts"
  $auth = Read-Text "src/contexts/SupabaseAuthContext.jsx"
  $login = Read-Text "src/pages/LoginPage.jsx"
  if ($fn -notmatch 'ilike\("nama_panggilan"') { throw "Edge Function does not resolve nama_panggilan alias" }
  if ($fn -match '\.limit\(2\)') { throw "Edge Function still rejects duplicate nicknames by limiting to two" }
  if ($fn -notmatch "candidateAliases") { throw "Edge Function does not support multiple nickname candidates" }
  if ($fn -notmatch "auth.signInWithPassword") { throw "Edge Function does not verify through Supabase Auth" }
  if ($fn -notmatch "passwordSync") { throw "Edge Function does not repair a valid Nomor Induk password mismatch" }
  if ($fn -match "createJwt|jwt.sign|custom JWT") { throw "custom JWT logic detected" }
  if ($auth -notmatch "username,") { throw "frontend does not send username alias to Edge Function" }
  if ($login -notmatch "Nama Panggilan Santri") { throw "login placeholder does not explain santri nickname username" }
}

Add-Check "santri identifiers use resilient clipboard copy" {
  $component = Read-Text "src/components/dashboard/admin/SantriManagement.jsx"
  $helper = Read-Text "src/lib/clipboardUtils.js"
  if ($component -notmatch "copyTextToClipboard") { throw "santri identifiers do not use the clipboard helper" }
  if ($helper -notmatch "navigator\.clipboard") { throw "Clipboard API path is missing" }
  if ($helper -notmatch "execCommand\('copy'\)") { throw "clipboard fallback is missing" }
}

Add-Check "birthday modal has an opaque light theme surface" {
  $modal = Read-Text "src/components/dashboard/shared/BirthdayNotificationModal.jsx"
  if ($modal -notmatch "bg-slate-50/\[0\.97\]") { throw "light modal surface is still too transparent" }
  if ($modal -notmatch "border-slate-200") { throw "light modal border is not theme-safe" }
}

Add-Check "Nomor Induk edits synchronize Auth password" {
  $component = Read-Text "src/components/dashboard/admin/SantriManagement.jsx"
  $function = Read-Text "supabase/functions/manage-user/index.ts"
  if ($component -notmatch "Login santri gagal disinkronkan") { throw "admin edit does not route login changes through manage-user" }
  if ($function -notmatch "AUTH_PASSWORD_SYNC_FAILED") { throw "manage-user does not synchronize the Auth password" }
}

Add-Check "santri avatar upload persists avatar path after storage upload" {
  $text = Read-Text "src/components/dashboard/admin/SantriManagement.jsx"
  if ($text -notmatch "\.update\(\{\s*avatar_path:\s*path\s*\}\)") { throw "avatar path is not persisted narrowly" }
  if ($text -notmatch "Avatar terunggah, tetapi referensi profil santri tidak tersimpan") { throw "missing persistence failure message" }
  if ($text -notmatch "resolveAvatarUrl") { throw "santri list does not resolve avatar path after refresh" }
}

Add-Check "restored santri fields are selected and editable" {
  $component = Read-Text "src/components/dashboard/admin/SantriManagement.jsx"
  $migration = Read-Text "db/migrations/20260624002100_santri_legacy_fields_and_media_player.sql"
  foreach ($field in @("tanggal_pendaftaran", "nama_ayah", "nama_ibu", "no_kk", "no_nik", "berkas_foto", "berkas_akta", "berkas_kk", "berkas_form", "link_qiroati")) {
    if ($component -notmatch $field) { throw "component missing $field" }
    if ($migration -notmatch $field) { throw "migration missing $field" }
  }
  if ($component -match "tanggal_pendaftaran \|\| ''} disabled") { throw "tanggal masuk is still disabled" }
  if ($component -match "berkas_foto.*disabled") { throw "berkas checklist is still disabled" }
}

Add-Check "santri list falls back to base columns while staging migration is pending" {
  $component = Read-Text "src/components/dashboard/admin/SantriManagement.jsx"
  if ($component -notmatch "SANTRI_BASE_SELECT") { throw "base santri select missing" }
  if ($component -notmatch "SANTRI_EXTENDED_SELECT") { throw "extended santri select missing" }
  if ($component -notmatch "isMissingSantriExtendedColumn") { throw "missing extended column detector missing" }
  if ($component -notmatch "fetchSantri\(SANTRI_BASE_SELECT\)") { throw "fallback query does not retry base santri columns" }
}

Add-Check "santri edit sends changed fields and verifies updated row" {
  $adapter = Read-Text "src/lib/dataMasterAdapters.js"
  $component = Read-Text "src/components/dashboard/admin/SantriManagement.jsx"
  if ($adapter -notmatch "pickChangedSantriProfileFields") { throw "changed-field picker missing" }
  if ($component -notmatch "pickChangedSantriProfileFields\(finalFormData, editingSantri\)") { throw "edit flow does not use changed-field payload" }
  if ($component -notmatch "\.select\('id'\)\s*\.maybeSingle\(\)") { throw "edit flow does not verify updated row" }
  if ($component -notmatch "Data santri tidak tersimpan karena tidak ada row yang diperbarui") { throw "no-row update is not treated as failure" }
  if ($adapter -notmatch "berkas_foto" -or $adapter -notmatch "nama_ayah" -or $adapter -notmatch "link_qiroati") { throw "restored santri fields are not included in changed-field payload" }
  if ($component -match "Belum tersedia di schema staging") { throw "restored santri fields are still marked inactive" }
}

Add-Check "santri form assigns active class for digital attendance" {
  $component = Read-Text "src/components/dashboard/admin/SantriManagement.jsx"
  if ($component -notmatch "Kelas Aktif") { throw "active class field is missing from santri form" }
  if ($component -notmatch "current_class_id:\s*val") { throw "class select does not write current_class_id" }
  if ($component -notmatch "move_santri_to_class") { throw "class assignment does not use atomic class membership RPC" }
  if ($component -notmatch "Penempatan kelas awal dari Data Santri") { throw "initial class assignment reason is missing" }
}

Add-Check "guru dashboard restores scoped class transfer action" {
  $dashboard = Read-Text "src/components/dashboard/GuruDashboard.jsx"
  $modal = Read-Text "src/components/dashboard/guru/StudentTransferModal.jsx"
  $migration = Read-Text "db/migrations/20260723000100_guru_student_class_transfer.sql"

  if ($dashboard -notmatch "StudentTransferModal") { throw "guru transfer modal is not mounted" }
  if ($dashboard -notmatch "openTransferModal\(santri\)") { throw "transfer action is not wired to each santri row" }
  if ($dashboard -notmatch 'aria-label=\{`Transfer \$\{santri\.nama_lengkap\} ke kelas lain`\}') { throw "icon-only transfer action has no accessible name" }
  if ($dashboard -notmatch 'guru-transfer-action') { throw "icon-only transfer action style is missing" }
  if ($modal -notmatch "list_guru_transfer_destinations") { throw "transfer modal does not use scoped destination RPC" }
  if ($modal -notmatch "move_santri_to_class_by_guru") { throw "transfer modal does not use guru-scoped transfer RPC" }
  if ($modal -notmatch "PGRST202" -or $modal -notmatch "Pembaruan database untuk transfer kelas belum diterapkan") { throw "missing RPC error is not translated into an actionable message" }
  if ($migration -notmatch "v_active_membership\.id_guru is distinct from v_actor") { throw "transfer RPC does not verify the source teacher" }
  if ($migration -notmatch "kategori yang sama") { throw "transfer RPC does not enforce matching class category" }
}

Add-Check "attendance recap can mark present records as absent" {
  $text = Read-Text "src/components/dashboard/shared/AttendanceDetailsModal.jsx"
  if ($text -notmatch "handleMarkAbsent") { throw "mark absent handler missing" }
  if ($text -notmatch "status:\s*'Tidak Hadir'") { throw "mark absent does not save Tidak Hadir status" }
  if ($text -notmatch "check_in_timestamp:\s*null") { throw "mark absent does not clear timestamp" }
  if ($text -notmatch "Tandai Tidak Hadir") { throw "mark absent action is not visible" }
}

Add-Check "digital attendance duplicate scan keeps first timestamp and avatar card" {
  $page = Read-Text "src/pages/DigitalAttendancePage.jsx"
  $admin = Read-Text "src/components/dashboard/admin/DigitalAttendance.jsx"
  if ($page -notmatch "message: 'Absensi sudah tercatat\.'") { throw "public digital attendance does not preserve first timestamp on duplicate" }
  if ($admin -notmatch "message: 'Absensi sudah tercatat\.'") { throw "admin digital attendance does not preserve first timestamp on duplicate" }
  if ($page -notmatch "avatar_path" -or $admin -notmatch "avatar_path") { throw "digital attendance does not select avatar_path" }
  if ($page -notmatch "resolveAvatarUrl" -or $admin -notmatch "resolveAvatarUrl") { throw "digital attendance does not resolve avatar URLs" }
}

Add-Check "active santri without class can use digital attendance" {
  $page = Read-Text "src/pages/DigitalAttendancePage.jsx"
  $admin = Read-Text "src/components/dashboard/admin/DigitalAttendance.jsx"
  $adapter = Read-Text "src/lib/attendanceAdapters.js"
  if ($page -match "Santri belum memiliki kelas aktif") { throw "public scanner still rejects classless santri" }
  if ($admin -match "Santri belum memiliki kelas aktif") { throw "admin scanner still rejects classless santri" }
  if ($adapter -notmatch "class_id:\s*santri\.current_class_id") { throw "attendance payload no longer preserves optional class id" }
  if ($adapter -notmatch "fallback = 'Pagi'") { throw "classless santri has no session fallback" }
}

Add-Check "attendance profile shows late accent and combined monthly stats" {
  $card = Read-Text "src/components/dashboard/shared/AttendanceProfileCard.jsx"
  $page = Read-Text "src/pages/DigitalAttendancePage.jsx"
  if ($card -notmatch "attendance-profile-card__status-chip--late") { throw "late status chip class is missing" }
  if ($card -match "statusAccent|getLateAccent|attendance-profile-card--late") { throw "late status still overrides the whole profile accent" }
  if ($card -notmatch "attendance-profile-card__attendance-summary") { throw "monthly attendance is not combined into one card" }
  if ($card -notmatch "monthlyStats\.late") { throw "monthly late count is not rendered" }
  if ($card -notmatch "Sesi \{getSessionName\(sesi\)\}") { throw "student session label is missing below the name" }
  if ($page -notmatch "select\('attendance_date, status'\)") { throw "monthly attendance query does not load status" }
  if ($page -notmatch "return \{ present, late, absent \}") { throw "monthly attendance result does not separate late records" }
  if ($card -notmatch "Karakter Unggulan" -or $card -notmatch "Kategori Terkuat") { throw "student attendance insight tiles are missing" }
  if ($page -notmatch "from\('santri_character_strengths'\)") { throw "attendance profile does not load the selected character strength" }
  if ($page -notmatch "right\.average - left\.average" -or $page -notmatch "right\.completed - left\.completed") { throw "strongest hafalan category ranking is incomplete" }
}

Add-Check "favicon and media player use stable cohesive assets" {
  $index = Read-Text "index.html"
  $homePage = Read-Text "src/pages/HomePage.jsx"
  $player = Read-Text "src/components/MediaPlayerWidget.jsx"
  $styles = Read-Text "src/styles/admin-dashboard.css"
  if ($index -notmatch 'href="/favicon\.ico\?v=2"' -or -not (Test-Path "public/favicon.ico")) { throw "official favicon is missing" }
  if (-not (Test-Path "public/favicon-16x16.png") -or -not (Test-Path "public/favicon-32x32.png") -or -not (Test-Path "public/apple-touch-icon.png")) { throw "responsive favicon assets are incomplete" }
  if ($homePage -match 'rel="icon"') { throw "homepage still overrides the stable favicon" }
  if ($player -notmatch "media-player-glass__control--active" -or $player -notmatch "media-player-glass__control--accent") { throw "media player active accents are not explicit" }
  if ($styles -notmatch "linear-gradient\(135deg, rgb\(13 148 136" -or $styles -notmatch "linear-gradient\(90deg, rgb\(13 148 136\), rgb\(37 99 235\)\)") { throw "media player teal-blue accent palette is incomplete" }
}

Add-Check "admin dashboard counts active santri status variants" {
  $text = Read-Text "src/components/dashboard/AdminDashboard.jsx"
  if ($text -notmatch "\.in\('status', \['Aktif', 'active'\]\)") { throw "active santri stat does not include Aktif and active variants" }
}

Add-Check "admin can mark guru attendance absent from detail modal" {
  $recap = Read-Text "src/components/dashboard/admin/GuruAttendanceRecap.jsx"
  if ($recap -notmatch "Tandai Tidak Hadir") { throw "explicit absent action is missing from guru attendance detail" }
  if ($recap -notmatch "handleSaveAttendance\(\{ markAbsent: true \}\)") { throw "absent action does not use the forced absent mutation" }
  if ($recap -notmatch "check_in_time: attendanceTime \|\| null") { throw "absent mutation does not clear check-in time" }
  if ($recap -notmatch "check_in_timestamp: checkInTs") { throw "absent mutation does not clear check-in timestamp" }
  if ($recap -notmatch "\.select\('id'\)\.single\(\)") { throw "guru attendance mutation does not verify the saved row" }
}

Add-Check "attendance late boundary uses one 15-minute helper" {
  $js = @'
import { buildJakartaTimestamp, determineAttendanceStatus } from './src/utils/AttendanceStatusLogic.js';
const start = buildJakartaTimestamp('2026-06-25', '16:00:00');
const onBoundary = buildJakartaTimestamp('2026-06-25', '16:15:00');
const afterBoundary = buildJakartaTimestamp('2026-06-25', '16:16:00');
if (determineAttendanceStatus(onBoundary, start) !== 'Hadir') throw new Error('15-minute boundary should be on time');
if (determineAttendanceStatus(afterBoundary, start) !== 'Terlambat') throw new Error('after 15 minutes should be late');
console.log('ok');
'@
  $output = & node --input-type=module -e $js
  if ($LASTEXITCODE -ne 0 -or $output -notmatch "ok") { throw "late boundary helper failed" }
}

Add-Check "attendance helper accepts numeric session values from santri data" {
  $js = @'
import { buildSessionStartTimestamp, determineAttendanceStatus } from './src/utils/AttendanceStatusLogic.js';
const start = buildSessionStartTimestamp('2026-06-25', '3');
if (start !== '2026-06-25T15:45:00+07:00') throw new Error(`numeric Sore session was not normalized: ${start}`);
const late = determineAttendanceStatus('2026-06-25T16:16:00+07:00', start);
if (late !== 'Terlambat') throw new Error('numeric session did not produce late status');
console.log('ok');
'@
  $output = & node --input-type=module -e $js
  if ($LASTEXITCODE -ne 0 -or $output -notmatch "ok") { throw "numeric session late helper failed" }
}

Add-Check "RFID attendance enforces the final session windows" {
  $js = @'
import { evaluateAttendanceWindow } from './src/utils/AttendanceStatusLogic.js';
const cases = [
  ['Pagi', '2026-07-21T05:59:00+07:00', false, null],
  ['Pagi', '2026-07-21T06:00:00+07:00', true, 'Hadir'],
  ['Pagi', '2026-07-21T08:00:59+07:00', true, 'Hadir'],
  ['Pagi', '2026-07-21T08:01:00+07:00', true, 'Terlambat'],
  ['Pagi', '2026-07-21T09:15:59+07:00', true, 'Terlambat'],
  ['Pagi', '2026-07-21T09:16:00+07:00', false, null],
  ['Siang', '2026-07-21T15:05:00+07:00', true, 'Terlambat'],
  ['Sore', '2026-07-21T15:05:00+07:00', true, 'Hadir'],
];
for (const [sesi, timestamp, canRecord, status] of cases) {
  const result = evaluateAttendanceWindow({ timestamp, dateStr: '2026-07-21', sesi });
  if (result.canRecord !== canRecord || result.status !== status) {
    throw new Error(`${sesi} ${timestamp}: ${JSON.stringify(result)}`);
  }
}
console.log('ok');
'@
  $output = & node --input-type=module -e $js
  if ($LASTEXITCODE -ne 0 -or $output -notmatch "ok") { throw "final attendance window rules failed" }
}

Add-Check "attendance configuration can keep recording after session end" {
  $js = @'
import { DEFAULT_SESSION_TIMES, evaluateAttendanceWindow, resolveSantriAttendanceSession } from './src/utils/AttendanceStatusLogic.js';
const configurableTimes = Object.fromEntries(Object.entries(DEFAULT_SESSION_TIMES).map(([name, value]) => [
  name,
  { ...value, closeAfterEnd: false },
]));
const result = evaluateAttendanceWindow({
  timestamp: '2026-07-21T10:30:00+07:00',
  dateStr: '2026-07-21',
  sesi: 'Pagi',
  sessionTimes: configurableTimes,
});
if (!result.canRecord || result.status !== 'Terlambat') throw new Error(JSON.stringify(result));

const alternateResult = resolveSantriAttendanceSession({
  timestamp: '2026-07-21T16:05:00+07:00',
  dateStr: '2026-07-21',
  assignedSession: 'Pagi',
  sessionTimes: configurableTimes,
});
const lateMinutes = Math.floor(
  (new Date('2026-07-21T16:05:00+07:00').getTime() - new Date(alternateResult.deadlineAt).getTime()) / 60000,
);
if (!alternateResult.can || alternateResult.attendedSession !== 'Sore' || alternateResult.status !== 'Terlambat' || lateMinutes !== 5) {
  throw new Error(JSON.stringify({ alternateResult, lateMinutes }));
}
console.log('ok');
'@
  $output = & node --input-type=module -e $js
  if ($LASTEXITCODE -ne 0 -or $output -notmatch "ok") { throw "disabled session closure is not honored" }

  $editor = Read-Text "src/components/dashboard/admin/AttendanceConfiguration.jsx"
  $adapter = Read-Text "src/lib/attendanceConfiguration.js"
  $publicPage = Read-Text "src/pages/DigitalAttendancePage.jsx"
  $adminPage = Read-Text "src/components/dashboard/admin/DigitalAttendance.jsx"
  if ($editor -notmatch "Tutup absensi otomatis setelah sesi berakhir") { throw "session closure switch is missing" }
  if ($adapter -notmatch "attendance_session_config") { throw "attendance configuration storage key is missing" }
  if ($publicPage -notmatch "useAttendanceSessionConfiguration" -or $adminPage -notmatch "useAttendanceSessionConfiguration") { throw "digital attendance does not load saved session configuration" }
}

Add-Check "santri may attend a different active session" {
  $js = @'
import { resolveSantriAttendanceSession } from './src/utils/AttendanceStatusLogic.js';
const cases = [
  ['Pagi', '2026-07-21T15:05:00+07:00', true, 'Sore', 'Hadir'],
  ['Pagi', '2026-07-21T16:01:00+07:00', true, 'Sore', 'Terlambat'],
  ['Siang', '2026-07-21T15:05:00+07:00', true, 'Siang', 'Terlambat'],
  ['Malam', '2026-07-21T07:00:00+07:00', true, 'Pagi', 'Hadir'],
  ['Pagi', '2026-07-21T11:45:00+07:00', false, null, null],
];
for (const [assignedSession, timestamp, can, attendedSession, status] of cases) {
  const result = resolveSantriAttendanceSession({
    timestamp,
    dateStr: '2026-07-21',
    assignedSession,
  });
  if (result.can !== can || result.attendedSession !== attendedSession || result.status !== status) {
    throw new Error(`${assignedSession} ${timestamp}: ${JSON.stringify(result)}`);
  }
}
console.log('ok');
'@
  $output = & node --input-type=module -e $js
  if ($LASTEXITCODE -ne 0 -or $output -notmatch "ok") { throw "alternate santri session resolution failed" }

  $adapter = Read-Text "src/lib/attendanceAdapters.js"
  $migration = Read-Text "db/migrations/20260721000200_attendance_actual_session.sql"
  if ($adapter -notmatch "attended_session") { throw "attendance payload does not store actual session" }
  if ($migration -notmatch "add column if not exists attended_session text") { throw "actual session migration is missing" }
}

Add-Check "duplicate scans preserve first attendance and late santri receive no point" {
  $publicPage = Read-Text "src/pages/DigitalAttendancePage.jsx"
  $adminPage = Read-Text "src/components/dashboard/admin/DigitalAttendance.jsx"
  if ($publicPage -notmatch "attendanceStatusText === 'Hadir'") { throw "point increment is not limited to on-time santri" }
  if ($publicPage -notmatch "message: 'Absensi sudah tercatat\.'") { throw "public duplicate scan message missing" }
  if ($adminPage -notmatch "message: 'Absensi sudah tercatat\.'") { throw "admin duplicate scan message missing" }
  if ($publicPage -match "message: 'Absensi berhasil diperbarui!'") { throw "normal duplicate scan can still overwrite first attendance" }
}

Add-Check "attendance recap and manual edit use shared late helper" {
  $recap = Read-Text "src/components/dashboard/admin/AttendanceRecap.jsx"
  $modal = Read-Text "src/components/dashboard/shared/AttendanceDetailsModal.jsx"
  $santriRecap = Read-Text "src/components/dashboard/santri/SantriAbsensiRecap.jsx"
  if ($recap -notmatch "buildSessionStartTimestamp") { throw "admin recap does not use shared session timestamp helper" }
  if ($modal -notmatch "buildJakartaTimestamp") { throw "manual edit does not use Jakarta timestamp helper" }
  if ($modal -notmatch "status:\s*newStatus") { throw "manual edit does not save recomputed status" }
  if ($santriRecap -notmatch "buildSessionStartTimestamp") { throw "santri recap does not use shared helper" }
}

Add-Check "santri management and attendance recap paginate ten records server-side" {
  $santri = Read-Text "src/components/dashboard/admin/SantriManagement.jsx"
  $recap = Read-Text "src/components/dashboard/admin/AttendanceRecap.jsx"
  $pagination = Read-Text "src/components/dashboard/shared/DataPagination.jsx"

  if ($santri -notmatch "const PAGE_SIZE = 10") { throw "santri page size is not ten" }
  if ($santri -notmatch "\.range\(from, to\)") { throw "santri query is not paginated at Supabase" }
  if ($recap -notmatch "const PAGE_SIZE = 10") { throw "attendance recap page size is not ten" }
  if ($recap -notmatch "\.in\('user_id', santriIds\)") { throw "attendance recap does not limit attendance to current page users" }
  if ($recap -notmatch "\.range\(from, to\)") { throw "attendance recap santri query is not paginated" }
  if ($pagination -notmatch "Halaman \{safePage\} dari \{totalPages\}") { throw "pagination status is missing" }
}

Add-Check "attendance recap filters santri by registered session" {
  $recap = Read-Text "src/components/dashboard/admin/AttendanceRecap.jsx"
  if ($recap -notmatch "selectedSession") { throw "attendance recap session state is missing" }
  if ($recap -notmatch "getSessionNumber\(selectedSession\)") { throw "attendance recap does not normalize numeric session values" }
  if ($recap -notmatch "Semua Sesi") { throw "attendance recap session filter UI is missing" }
}

Add-Check "admin edit and table selection can migrate TPQ PTPT and adult" {
  $management = Read-Text "src/components/dashboard/admin/SantriManagement.jsx"
  $migration = Read-Text "db/migrations/20260721000300_change_santri_category_ptpt.sql"
  if ($management -notmatch "Migrasi ke PTPT") { throw "edit form PTPT migration is missing" }
  if ($management -notmatch "Migrasi ke Dewasa") { throw "edit form adult migration is missing" }
  if ($management -notmatch "handleBulkMigration\('PTPT'\)") { throw "bulk PTPT migration is missing" }
  if ($management -notmatch "handleBulkMigration\('Dewasa'\)") { throw "bulk adult migration is missing" }
  if ($management -notmatch "rpc\('change_santri_category'") { throw "category migration does not use the atomic RPC" }
  if ($migration -notmatch "when 'PTPT' then 'PTPT'") { throw "category RPC migration does not support PTPT" }
  if ($migration -notmatch "set search_path = public, pg_temp") { throw "category RPC lacks an explicit search path" }
}

Add-Check "RFID scan restores an explicit absence without duplicating attendance" {
  $adapter = Read-Text "src/lib/attendanceAdapters.js"
  $publicPage = Read-Text "src/pages/DigitalAttendancePage.jsx"
  $adminPage = Read-Text "src/components/dashboard/admin/DigitalAttendance.jsx"
  $tvPage = Read-Text "src/pages/TvDisplayPage.jsx"

  if ($adapter -notmatch "isExplicitAbsentAttendance") { throw "explicit absence helper is missing" }
  if ($adapter -notmatch "tidak hadir.*alpha.*ghaib.*absen") { throw "explicit absence statuses are incomplete" }
  foreach ($source in @($publicPage, $adminPage, $tvPage)) {
    if ($source -notmatch "shouldRestoreAbsentAttendance") { throw "a digital attendance surface does not restore absence" }
    if ($source -notmatch "\.update\(\{") { throw "absence restoration does not update the existing record" }
    if ($source -notmatch "\.eq\('id', existingAttendance\.id\)|\.eq\('id', existing\.id\)") { throw "absence restoration is not scoped to the existing record" }
  }
  if ($publicPage -notmatch "!shouldRestoreAbsentAttendance") { throw "restored absence can award duplicate gamification points" }
}

Add-Check "payment proof reloads stored payment record before generating receipt" {
  $text = Read-Text "src/components/dashboard/admin/PaymentProofModal.jsx"
  if ($text -notmatch "from\('payments'\)") { throw "proof modal does not read stored payment" }
  if ($text -notmatch "select\(PAYMENT_DETAIL_SELECT\)") { throw "proof modal does not request complete payment detail" }
  if ($text -notmatch "receiptPayment\?\.id") { throw "proof generation is not guarded by stored record" }
  if ($text -notmatch "No\. Induk") { throw "receipt does not include santri identifier" }
  if ($text -notmatch "transactionRef") { throw "receipt does not include transaction reference" }
}

Add-Check "payment proof uses uploaded website logo as embeddable image" {
  $helper = Read-Text "src/lib/publicContentAdapters.js"
  $modal = Read-Text "src/components/dashboard/admin/PaymentProofModal.jsx"
  $system = Read-Text "src/components/dashboard/admin/PaymentSystem.jsx"
  if ($helper -notmatch "fetchReceiptLogoDataUrl") { throw "receipt logo helper missing" }
  if ($helper -notmatch "fetchWebsiteContentMap\(\{ keys: \['logoUrl'\]") { throw "receipt helper does not read website_content logoUrl" }
  if ($helper -notmatch "readAsDataURL") { throw "receipt logo is not embedded for html-to-image" }
  if ($modal -notmatch "fetchReceiptLogoDataUrl") { throw "payment proof modal does not load uploaded logo" }
  if ($system -notmatch "fetchReceiptLogoDataUrl") { throw "payment system receipt does not load uploaded logo" }
  if ($modal -notmatch "imagePlaceholder: '/logo-lpq-al-fath-maulana.webp'" -or $system -notmatch "imagePlaceholder: '/logo-lpq-al-fath-maulana.webp'") { throw "receipt image generation lacks official local logo fallback" }
  if ($helper -notmatch "waitForImagesToLoad") { throw "receipt image helper does not wait for embedded logo/images" }
  if ($modal -notmatch "waitForImagesToLoad\(receiptRef\.current\)" -or $system -notmatch "waitForImagesToLoad\(receiptRef\.current\)") { throw "receipt export does not wait for images before rendering" }
}

Add-Check "TV Display maps final santri schema and avatar fallback" {
  $text = Read-Text "src/pages/TvDisplayPage.jsx"
  if ($text -notmatch "current_class_id") { throw "TV display does not query current_class_id" }
  if ($text -notmatch "id_kelas:\s*item\.current_class_id") { throw "TV display does not bridge current_class_id for old UI" }
  if ($text -notmatch "resolveAvatarUrl") { throw "TV display does not resolve avatar paths" }
  if ($text -match "class:id_kelas") { throw "TV display still uses legacy id_kelas relation" }
  if ($text -notmatch "order\('sort_order'") { throw "TV display does not order classes by final sort_order column" }
}

Add-Check "profile avatars open an accessible shared preview" {
  $guru = Read-Text "src/components/dashboard/GuruDashboard.jsx"
  $santri = Read-Text "src/components/dashboard/SantriDashboard.jsx"
  $preview = Read-Text "src/components/dashboard/shared/AvatarPreviewDialog.jsx"
  if ($guru -notmatch "isOwnAvatarPreviewOpen" -or $guru -notmatch "Lihat foto profil guru") { throw "guru profile avatar preview is missing" }
  if ($santri -notmatch "isAvatarPreviewOpen" -or $santri -notmatch "Lihat foto profil santri") { throw "santri profile avatar preview is missing" }
  if ($preview -notmatch "DialogDescription" -or $preview -notmatch "Foto profil.*pengguna") { throw "shared avatar preview is not accessible" }
}

Add-Check "guru profile includes constellation and permanent jilid controls" {
  $guru = Read-Text "src/components/dashboard/GuruDashboard.jsx"
  if ($guru -notmatch "ProfileConstellationScene") { throw "guru constellation scene is missing" }
  if ($guru -notmatch "<Suspense fallback=\{null\}><ProfileConstellationScene") { throw "guru constellation is not lazy rendered" }
  if ($guru -match 'flex gap-1 opacity-0 group-hover:opacity-100') { throw "jilid controls are still hover-only" }
  if ($guru -notmatch 'title="Naik Jilid"' -or $guru -notmatch 'title="Turun Jilid"') { throw "jilid controls are missing" }
}

Add-Check "guru password inputs have safe visibility toggles" {
  $dashboard = Read-Text "src/components/dashboard/GuruDashboard.jsx"
  $management = Read-Text "src/components/dashboard/admin/GuruManagement.jsx"
  if ($dashboard -notmatch "type=\{showPassword \? 'text' : 'password'\}") { throw "guru self-edit password toggle is missing" }
  if ($dashboard -notmatch "Toggle hanya menampilkan password baru") { throw "guru password visibility scope is unclear" }
  if ($management -notmatch 'type=\{showPassword \? "text" : "password"\}') { throw "admin guru password toggle is missing" }
  if ($management -notmatch "Password Auth lama tidak dapat dibaca kembali") { throw "admin password visibility scope is unclear" }
}

Add-Check "all avatar uploads are converted to bounded WebP" {
  $storage = Read-Text "src/lib/storageAdapters.js"
  if ($storage -notmatch "compressAvatarToWebp") { throw "WebP compression helper is missing" }
  if ($storage -notmatch "canvas\.toBlob" -or $storage -notmatch "'image/webp'") { throw "avatar conversion does not create WebP" }
  if ($storage -notmatch "MAX_AVATAR_DIMENSION") { throw "avatar dimensions are not bounded" }
  if ($storage -notmatch "file: webpFile") { throw "signed upload does not receive compressed WebP" }
  if ($storage -notmatch "file: webpFile \}\)") { throw "direct upload does not receive compressed WebP" }
  if ($storage -notmatch "profile\.webp") { throw "deterministic WebP path changed" }
}

Add-Check "official logo is the document favicon" {
  $html = Read-Text "index.html"
  if (-not (Test-Path "public/logo-lpq-al-fath-maulana.webp")) { throw "official local logo asset is missing" }
  if ($html -notmatch 'href="/favicon\.ico\?v=2"' -or $html -notmatch 'href="/apple-touch-icon\.png\?v=2"') { throw "document does not reference official favicon assets" }
}

Add-Check "official public content replaces institutional placeholders" {
  $institution = Read-Text "src/lib/institutionContent.js"
  $enrollment = Read-Text "src/lib/enrollmentContent.js"
  $contact = Read-Text "src/pages/ContactPage.jsx"
  $system = Read-Text "src/pages/SystemPage.jsx"
  $homePageText = Read-Text "src/pages/HomePage.jsx"
  $trust = Read-Text "src/components/public/home/TestimonialsFaq.jsx"
  if ($institution -notmatch "ACADEMIC_YEAR = '2026–2027'" -or $institution -notmatch "0857-8322-7144" -or $institution -notmatch "admin@lpqalfathmaulana\.id") { throw "official academic year or contact content is incomplete" }
  if ($enrollment -notmatch "totalFee: 'Rp 450\.000'" -or $enrollment -notmatch "totalFee: 'Rp 250\.000'") { throw "confirmed registration fees are missing" }
  if ($contact -match "WhatsApp resmi belum diisi" -or $system -match "Jadwal resmi belum diisi") { throw "public contact or learning-system placeholder remains" }
  if ($homePageText -match "testimonials=\{content\.testimonials\}" -or $trust -match "<blockquote" -or $trust -notmatch "Alasan keluarga memilih") { throw "homepage still presents fabricated-style testimonials instead of verified proof points" }
  $requiredAssets = @(
    "public/institution/hero-learning.webp",
    "public/institution/hero-al-alaq.webp",
    "public/institution/hero-qiroati.webp",
    "public/institution/classroom.webp",
    "public/institution/gallery-quiz.webp",
    "public/institution/cta-activity.webp"
  )
  foreach ($asset in $requiredAssets) { if (-not (Test-Path $asset)) { throw "official local asset is missing: $asset" } }
}

Add-Check "level configuration saves with verified readback and drives digital attendance" {
  $configuration = Read-Text "src/components/dashboard/admin/GameConfiguration.jsx"
  $attendance = Read-Text "src/pages/DigitalAttendancePage.jsx"
  $resolver = Read-Text "src/lib/santriLevel.js"
  if ($configuration -notmatch "saveWebsiteContentItem\(\{ key: 'level_config'") { throw "level settings bypass the official content adapter" }
  if ($configuration -notmatch "normalizeLevelConfigShape\(saved\?\.content\)") { throw "saved level settings are not normalized on readback" }
  if ($configuration -notmatch "\{ id: 'levels', label: 'Konfigurasi Level'" ) { throw "level settings tab is unavailable" }
  if ($attendance -notmatch "resolveSantriLevel\(\{ points, gender, config: levelConfig \}\)") { throw "digital attendance does not use the shared level resolver" }
  if ($resolver -notmatch "cardBorderThickness" -or $resolver -notmatch "avatarBorderThickness") { throw "shared resolver omits profile-card visual settings" }
  if ($configuration -notmatch "const \[isSaving, setIsSaving\]" -or $configuration -notmatch 'type="button" onClick=\{saveLevelConfig\}') { throw "level save button can remain locked by initial loading" }
  foreach ($stage in @('Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Mythic')) {
    if ($resolver -notmatch "name: '$stage'") { throw "level stage $stage is missing from the shared defaults" }
  }
  if ($attendance -notmatch "label: 'Bronze'") { throw "attendance fallback is inconsistent with the Bronze stage" }
  if ($resolver -notmatch "typeof config !== 'string'" -or $resolver -notmatch "Object\.entries\(value\)" -or $resolver -notmatch "parsed\.putra") { throw "legacy string/object level settings are not normalized" }
  if ($resolver -notmatch "isLegacyLevelCollection" -or $resolver -notmatch "createDefaultSantriLevelConfig") { throw "legacy A/B/C/S levels are not upgraded to the six-stage configuration" }
  if ($configuration -notmatch "id: index \+ 1" -or $configuration -notmatch "level\.id === id") { throw "editable levels do not have isolated stable ids" }
}

Add-Check "admin guru edit resets Auth password through the guarded function" {
  $management = Read-Text "src/components/dashboard/admin/GuruManagement.jsx"
  $edgeAdapter = Read-Text "src/lib/edgeFunctionAdapters.js"
  $function = Read-Text "supabase/functions/reset-user-password/index.ts"
  $cors = Read-Text "supabase/functions/_shared/cors.ts"
  if ($management -match "Reset password ditunda") { throw "existing guru password edit is still blocked" }
  if ($management -notmatch "invokeAuthenticatedEdgeFunction\('reset-user-password'") { throw "guru edit does not use the authenticated password reset request" }
  if ($management -notmatch "target_user_id: userId" -or $management -notmatch "new_password: formData\.password") { throw "password reset payload is incomplete" }
  if ($edgeAdapter -notmatch "supabase\.auth\.getSession\(\)" -or $edgeAdapter -notmatch 'Authorization: `Bearer \$\{accessToken\}`') { throw "Edge Function request does not carry the active user session" }
  if ($cors -notmatch 'Deno\.env\.get\("ALLOWED_ORIGINS"\)' -or $cors -notmatch "http://localhost:5173") { throw "Edge Function CORS is not environment-driven with a local-safe default" }
  if ($function -notmatch 'requireRole\(user\.id, \["admin"\]\)') { throw "password reset function is not restricted to admin" }
  if ($function -notmatch "admin\.auth\.admin\.updateUserById") { throw "password reset does not update Supabase Auth" }
}

Add-Check "WhatsApp message templates are editable and used by jilid and payment flows" {
  $configuration = Read-Text "src/components/dashboard/admin/GameConfiguration.jsx"
  $adapter = Read-Text "src/lib/whatsappTemplateAdapters.js"
  $jilid = Read-Text "src/components/dashboard/admin/JilidChangeModal.jsx"
  $proof = Read-Text "src/components/dashboard/admin/PaymentProofModal.jsx"
  $payments = Read-Text "src/components/dashboard/admin/PaymentSystem.jsx"
  if ($configuration -notmatch "\{ id: 'whatsapp', label: 'Pesan WhatsApp'" -or $configuration -notmatch "saveWhatsAppTemplates") { throw "WhatsApp template editor is unavailable" }
  if ($adapter -notmatch "whatsapp_message_templates" -or $adapter -notmatch "isPublic: false" -or $adapter -notmatch "renderWhatsAppTemplate") { throw "WhatsApp templates are not stored privately or rendered safely" }
  if ($jilid -notmatch "templates\.jilidPromotion" -or $jilid -notmatch "templates\.jilidDemotion") { throw "jilid messages do not use configured templates" }
  if ($proof -notmatch "paymentMessageTemplate" -or $payments -notmatch "templates\.paymentReceipt") { throw "payment messages do not use configured templates" }
}

Add-Check "login security logging uses server-derived IP and transparent consent" {
  $login = Read-Text "src/pages/LoginPage.jsx"
  $adapter = Read-Text "src/lib/loginSecurityAdapters.js"
  $function = Read-Text "supabase/functions/record-login-attempt/index.ts"
  $config = Read-Text "supabase/config.toml"
  $logs = Read-Text "src/components/dashboard/admin/LoginLogs.jsx"
  if ($login -match "rpc\('record_login_attempt'" -or $login -notmatch "LOGIN_SECURITY_CONSENT_KEY") { throw "login still bypasses the security notice or server logger" }
  if ($login -notmatch "Kami tidak merekam password" -or $login -notmatch "Izinkan &amp; lanjutkan") { throw "privacy notice is not explicit and actionable" }
  if ($adapter -notmatch "/functions/v1/record-login-attempt" -or $adapter -match "password") { throw "frontend login logger has an unsafe contract" }
  if ($function -notmatch 'req\.headers\.get\("x-forwarded-for"\)' -or $function -notmatch "cf-ipcity" -or $function -notmatch "consume_auth_rate_limit") { throw "Edge logger does not derive and rate-limit network metadata" }
  if ($function -notmatch "ip_address: ipAddress" -or $function -notmatch "user_agent: userAgent") { throw "Edge logger does not persist the server-derived audit fields" }
  if ($config -notmatch '\[functions\.record-login-attempt\][\s\S]*verify_jwt = false') { throw "failed login logger cannot run anonymously" }
  if ($logs -notmatch "Perkiraan lokasi") { throw "admin log incorrectly presents network location as exact GPS" }
}

Add-Check "guru attendance detail modal stays compact and editable" {
  $recap = Read-Text "src/components/dashboard/admin/GuruAttendanceRecap.jsx"
  if ($recap -notmatch 'DialogContent className="overflow-hidden p-0 sm:max-w-lg"') { throw "guru attendance modal is not using the compact shell" }
  if ($recap -notmatch "grid grid-cols-2 divide-x" -or $recap -notmatch "ModalStatusIcon") { throw "guru attendance summary is not compact or status-aware" }
  if ($recap -notmatch "handleSaveAttendance\(\{ markAbsent: true \}\)" -or $recap -notmatch "Simpan Perubahan") { throw "guru attendance edit actions were lost" }
}

$passed = @($checks | Where-Object { $_.Status -eq "PASS" }).Count
$failed = @($checks | Where-Object { $_.Status -eq "FAIL" }).Count

foreach ($check in $checks) {
  if ($check.Status -eq "PASS") {
    Write-Host "PASS $($check.Name)"
  } else {
    Write-Host "FAIL $($check.Name) - $($check.Error)"
  }
}

Write-Host "SUMMARY passed=$passed failed=$failed"
if ($failed -gt 0) { exit 1 }
