/**
 * Mock migration test: verifies that 002_calendar_day_table.sql correctly
 * migrates calendar data and skips orphaned label references.
 *
 * Run with: bun run scripts/test-migration.ts
 */
import { Database } from 'bun:sqlite';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(import.meta.dir, '../server/migrations');

function readMigration(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name), 'utf-8');
}

const db = new Database(':memory:');
db.run('PRAGMA foreign_keys = ON');

// ── Step 1: Apply migration 001 (base schema with calendars table) ────────────
console.log('Applying 001_initial.sql...');
db.exec(readMigration('001_initial.sql'));

// ── Step 2: Seed test data ────────────────────────────────────────────────────
console.log('Seeding test data...\n');

// User 1: has valid shifts + one orphaned label reference
const u1 = db.prepare<{ id: number }, [string, string]>(
  'INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id',
).get('alice@example.com', 'hash1')!;

db.run("INSERT INTO labels (id, user_id, short_code, name, color) VALUES ('early', ?, 'E', 'Early', '#22c55e')", [u1.id]);
db.run("INSERT INTO labels (id, user_id, short_code, name, color) VALUES ('late',  ?, 'L', 'Late',  '#3b82f6')", [u1.id]);
// 'deleted-label' was once inserted but then removed — simulating a deleted label
const shifts1 = JSON.stringify({
  '2025-01-01': 'early',
  '2025-01-02': 'late',
  '2025-01-03': 'deleted-label', // orphaned — label no longer in labels table
});
db.run('INSERT INTO calendars (user_id, shifts) VALUES (?, ?)', [u1.id, shifts1]);

// User 2: empty calendar
const u2 = db.prepare<{ id: number }, [string, string]>(
  'INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id',
).get('bob@example.com', 'hash2')!;
db.run("INSERT INTO calendars (user_id, shifts) VALUES (?, '{}')", [u2.id]);

// User 3: all shifts are orphaned (label deleted after assignment)
const u3 = db.prepare<{ id: number }, [string, string]>(
  'INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id',
).get('carol@example.com', 'hash3')!;
const shifts3 = JSON.stringify({
  '2025-02-01': 'ghost-label',
  '2025-02-02': 'another-ghost',
});
db.run('INSERT INTO calendars (user_id, shifts) VALUES (?, ?)', [u3.id, shifts3]);

// Print pre-migration state
console.log('── Pre-migration: calendars table ──────────────────');
const preRows = db.prepare('SELECT * FROM calendars').all() as { user_id: number; shifts: string }[];
for (const row of preRows) {
  console.log(`  user_id=${row.user_id}  shifts=${row.shifts}`);
}
console.log();

// ── Step 3: Apply migration 002 ───────────────────────────────────────────────
console.log('Applying 002_calendar_day_table.sql...');
db.exec(readMigration('002_calendar_day_table.sql'));
console.log('Migration complete.\n');

// ── Step 4: Verify results ────────────────────────────────────────────────────
console.log('── Post-migration: calendar_day table ──────────────');
const days = db.prepare('SELECT * FROM calendar_day ORDER BY user_id, date').all() as {
  id: number;
  user_id: number;
  date: string;
  label_id: string;
}[];
for (const row of days) {
  console.log(`  user_id=${row.user_id}  date=${row.date}  label_id=${row.label_id}`);
}
console.log();

// Assertions
let passed = true;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    passed = false;
  }
}

console.log('── Assertions ──────────────────────────────────────');

// calendars table no longer exists
const tableExists = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get('calendars') as { name: string } | null);
assert(tableExists === null, 'calendars table was dropped');

// User 1: 2 valid rows, orphaned one skipped
const u1Days = days.filter((d) => d.user_id === u1.id);
assert(u1Days.length === 2, 'alice: 2 rows migrated (orphaned entry skipped)');
assert(u1Days.some((d) => d.date === '2025-01-01' && d.label_id === 'early'), 'alice: 2025-01-01 → early');
assert(u1Days.some((d) => d.date === '2025-01-02' && d.label_id === 'late'), 'alice: 2025-01-02 → late');
assert(!u1Days.some((d) => d.label_id === 'deleted-label'), 'alice: orphaned deleted-label not migrated');

// User 2: empty calendar → no rows
const u2Days = days.filter((d) => d.user_id === u2.id);
assert(u2Days.length === 0, 'bob: empty calendar → 0 rows');

// User 3: all orphaned → no rows
const u3Days = days.filter((d) => d.user_id === u3.id);
assert(u3Days.length === 0, 'carol: all-orphaned calendar → 0 rows');

console.log();
if (passed) {
  console.log('All assertions passed.');
  process.exit(0);
} else {
  console.error('One or more assertions failed.');
  process.exit(1);
}
