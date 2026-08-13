import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../db/migrations/20260722000300_atomic_guru_account_update.sql', import.meta.url),
  'utf8',
);
const edgeFunction = await readFile(
  new URL('../supabase/functions/manage-user/index.ts', import.meta.url),
  'utf8',
);
const guruManagement = await readFile(
  new URL('../src/components/dashboard/admin/GuruManagement.jsx', import.meta.url),
  'utf8',
);

assert.match(migration, /create or replace function public\.update_guru_account/i);
assert.match(migration, /update public\.user_profiles[\s\S]*update public\.guru/i);
assert.match(migration, /auth\.role\(\)[\s\S]*service_role/i);
assert.match(migration, /grant execute[\s\S]*to service_role/i);
assert.match(migration, /revoke all[\s\S]*from authenticated/i);

assert.match(edgeFunction, /admin\.rpc\("update_guru_account"/);
assert.match(edgeFunction, /email_confirm: true[\s\S]*user_metadata:/);
assert.match(edgeFunction, /manage_user_auth_rollback_failed/);
assert.match(edgeFunction, /rfid_tag: profile\.rfid_tag/);
assert.match(edgeFunction, /status_guru: profile\.status_guru/);

assert.doesNotMatch(
  guruManagement,
  /from\(['"]guru['"]\)\.upsert\(dataToSubmit\)/,
  'Form guru must not perform a second browser-side profile upsert.',
);
assert.match(guruManagement, /action: 'update'[\s\S]*pickGuruProfileFields/);

console.log('Atomic guru account update regression checks passed.');
