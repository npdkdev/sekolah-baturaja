import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [page, migration] = await Promise.all([
  readFile(new URL('../src/pages/RandomNamePage.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../db/migrations/20260723000300_increment_santri_points.sql', import.meta.url), 'utf8'),
]);

assert.match(page, /const \[isUpdatingPoints, setIsUpdatingPoints\]/);
assert.match(page, /const \{ data, error \} = await supabase\.rpc\('increment_santri_points'/);
assert.match(page, /const updatedPoints = Number\(data\)/);
assert.match(page, /disabled=\{isUpdatingPoints\}/);
assert.doesNotMatch(page, /const updatedPoints = \(finalSelected\.points \|\| 0\) \+ amount/);

assert.match(migration, /create or replace function public\.increment_santri_points/i);
assert.match(migration, /public\.is_admin\(\)/);
assert.match(migration, /public\.is_guru\(\)[\s\S]*public\.guru_has_santri_access\(p_santri_id\)/);
assert.match(migration, /points = greatest\(0, points \+ p_amount\)/);
assert.match(migration, /return v_points/);
assert.match(migration, /grant execute[\s\S]*to authenticated/i);
assert.match(migration, /revoke all[\s\S]*from anon/i);

console.log('random-name point adjustment checks passed');
