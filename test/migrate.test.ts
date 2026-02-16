import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { readFileSync, unlinkSync, writeFileSync } from 'fs';
import { migrate, MIGRATION_PATTERN } from '../server/migrate';

const SCHEMA_PATH = join(dirname(import.meta.dir), 'server', 'schema.sql');

let dbPath: string;
let db: Database;

beforeEach(() => {
  dbPath = join(tmpdir(), `nursecal-migrate-test-${Date.now()}.db`);
  db = new Database(dbPath);
  db.run('PRAGMA foreign_keys = ON');
});

afterEach(() => {
  db.close();
  try {
    unlinkSync(dbPath);
  } catch {}
});

function getTables(db: Database): string[] {
  return db
    .prepare<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((r) => r.name);
}

describe('migrate', () => {
  test('creates all tables from scratch on a fresh database', () => {
    migrate(db);

    const tables = getTables(db);
    expect(tables).toContain('users');
    expect(tables).toContain('labels');
    expect(tables).toContain('calendars');
    expect(tables).toContain('otc');
    expect(tables).toContain('oauth_states');
    expect(tables).toContain('google_tokens');
    expect(tables).toContain('_migrations');
  });

  test('records applied migrations', () => {
    migrate(db);

    const migrations = db
      .prepare<{ name: string; applied_at: string }, []>('SELECT * FROM _migrations')
      .all();

    expect(migrations.length).toBeGreaterThanOrEqual(1);
    expect(migrations[0].name).toBe('001_initial.sql');
    expect(migrations[0].applied_at).toBeTruthy();
  });

  test('skips already-applied migrations on second run', () => {
    migrate(db);
    migrate(db);

    const migrations = db
      .prepare<{ name: string }, []>('SELECT * FROM _migrations')
      .all();

    // Should still only have each migration once
    const names = migrations.map((m) => m.name);
    expect(names.length).toBe(new Set(names).size);
  });

  test('resulting schema supports basic operations', () => {
    migrate(db);

    // Insert a user
    const user = db
      .prepare<{ id: number }, [string, string]>('INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id')
      .get('test@example.com', 'hash123');
    expect(user!.id).toBe(1);

    // Insert a label with foreign key
    db.run("INSERT INTO labels (id, user_id, short_code, name, color) VALUES ('l1', 1, 'E', 'Early', '#ff0000')");

    // Insert calendar data
    db.run("INSERT INTO calendars (user_id, shifts) VALUES (1, '{\"2025-01-01\": \"E\"}')");

    // Verify foreign key enforcement
    expect(() => {
      db.run("INSERT INTO labels (id, user_id, short_code, name, color) VALUES ('l2', 999, 'L', 'Late', '#0000ff')");
    }).toThrow();
  });

  test('schema.sql snapshot is up to date', () => {
    migrate(db);

    const rows = db
      .prepare<{ sql: string }, []>(
        "SELECT sql FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%' ORDER BY type, name",
      )
      .all();

    const generated = rows.map((r) => r.sql + ';').join('\n\n') + '\n';

    let existing: string | null = null;
    try {
      existing = readFileSync(SCHEMA_PATH, 'utf-8');
    } catch {}

    if (existing === null) {
      writeFileSync(SCHEMA_PATH, generated);
      console.log(`Generated ${SCHEMA_PATH}`);
    } else {
      expect(generated).toBe(existing);
    }
  });

  test('rejects invalid migration filenames', () => {
    expect(MIGRATION_PATTERN.test('001_initial.sql')).toBe(true);
    expect(MIGRATION_PATTERN.test('002_add_column.sql')).toBe(true);
    expect(MIGRATION_PATTERN.test('100_something_long.sql')).toBe(true);
    expect(MIGRATION_PATTERN.test('bad-name.sql')).toBe(false);
    expect(MIGRATION_PATTERN.test('1_short.sql')).toBe(false);
    expect(MIGRATION_PATTERN.test('001_initial.txt')).toBe(false);
    expect(MIGRATION_PATTERN.test('no_number.sql')).toBe(false);
  });
});
