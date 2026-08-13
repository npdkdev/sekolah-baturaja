import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getOperationalRoleFromGuruForm, pickGuruProfileFields } from '../src/lib/dataMasterAdapters.js';

const guruInput = { nama: 'Guru Uji', roles: ['Pengajar', 'Admin'] };
assert.equal(getOperationalRoleFromGuruForm(guruInput), 'admin');
assert.deepEqual(pickGuruProfileFields(guruInput, 'admin').roles, ['Pengajar', 'Admin']);

const pentashihInput = { nama: 'Pentashih Uji', roles: ['Admin', 'Pentashih'] };
assert.equal(getOperationalRoleFromGuruForm(pentashihInput), 'admin');
assert.deepEqual(pickGuruProfileFields(pentashihInput, 'admin').roles, ['Pentashih', 'Admin']);

const regularPentashihInput = { nama: 'Pentashih Uji', roles: ['Pentashih'] };
assert.equal(getOperationalRoleFromGuruForm(regularPentashihInput), 'pentashih');
assert.deepEqual(pickGuruProfileFields(regularPentashihInput, 'pentashih').roles, ['Pentashih']);

const revokedAdminInput = { nama: 'Guru Kembali', roles: ['Pengajar'] };
assert.equal(getOperationalRoleFromGuruForm(revokedAdminInput), 'guru');
assert.deepEqual(pickGuruProfileFields(revokedAdminInput, 'guru').roles, ['Pengajar']);

const [management, edgeFunction, validation, restrictionMigration, enablementMigration] = await Promise.all([
  readFile(new URL('../src/components/dashboard/admin/GuruManagement.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/manage-user/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/_shared/validation.ts', import.meta.url), 'utf8'),
  readFile(new URL('../db/migrations/20260722000100_restrict_admin_to_official_email.sql', import.meta.url), 'utf8'),
  readFile(new URL('../db/migrations/20260723000200_enable_guru_admin_roles.sql', import.meta.url), 'utf8'),
]);

assert.match(management, /AVAILABLE_ROLES\s*=\s*\[[^\]]*['"]Admin['"]/);
assert.match(management, /Role Admin memberikan akses penuh ke Dashboard Admin/);
assert.match(management, /action:\s*['"]update['"]/);
assert.match(edgeFunction, /OFFICIAL_ADMIN_EMAIL\s*=\s*['"]admin@lpqalfathmaulana\.id['"]/);
assert.match(edgeFunction, /role === "admin" \? "admin"/);
assert.match(validation, /value === "admin"/);
assert.match(restrictionMigration, /user_profiles_admin_email_check/);
assert.match(enablementMigration, /drop constraint if exists user_profiles_admin_email_check/);
assert.match(enablementMigration, /drop index if exists public\.user_profiles_single_admin_idx/);
assert.match(enablementMigration, /p_role not in \([\s\S]*'admin'::public\.app_role/);
assert.match(enablementMigration, /up\.id = auth\.uid\(\)[\s\S]*up\.status = 'active'/);
assert.doesNotMatch(enablementMigration, /join auth\.users/);

console.log('guru admin role checks passed');
