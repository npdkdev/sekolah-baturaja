import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeAttendanceSessionName } from '../src/utils/AttendanceStatusLogic.js';

assert.equal(normalizeAttendanceSessionName('3'), 'Sore');
assert.equal(normalizeAttendanceSessionName('0'), 'Pagi');

const [adapter, publicAttendance, adminAttendance, migration] = await Promise.all([
  readFile(new URL('../src/lib/attendanceAdapters.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/DigitalAttendancePage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/dashboard/admin/DigitalAttendance.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../db/migrations/20260722000200_santri_first_attendance_per_day.sql', import.meta.url), 'utf8'),
]);

assert.match(adapter, /normalizeAttendanceSessionName\(santri\?\.sesi_mengaji \|\| santri\?\.class\?\.sesi \|\| fallback\)/);
assert.match(adapter, /attendance_santri_first_daily_unique/);
assert.match(adapter, /Absensi santri hari ini sudah tercatat\./);

for (const source of [publicAttendance, adminAttendance]) {
  assert.match(source, /order\('check_in_timestamp', \{ ascending: true, nullsFirst: false \}\)/);
  assert.match(source, /order\('created_at', \{ ascending: true \}\)/);
  assert.match(source, /limit\(1\)/);
}

assert.match(migration, /on public\.attendance \(user_id, attendance_date\)/);
assert.match(migration, /role = 'santri'::public\.app_role/);
assert.match(migration, /source <> 'import'/);

console.log('first santri attendance checks passed');
