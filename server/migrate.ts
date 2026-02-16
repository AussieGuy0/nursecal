import { Database } from 'bun:sqlite';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export const MIGRATION_PATTERN = /^\d{3}_\w+\.sql$/;

export function migrate(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const migrationsDir = join(import.meta.dir, 'migrations');

  let entries: string[];
  try {
    entries = readdirSync(migrationsDir);
  } catch {
    return;
  }

  const invalid = entries.filter((f) => !MIGRATION_PATTERN.test(f));
  if (invalid.length > 0) {
    throw new Error(`Invalid migration filenames (expected NNN_name.sql): ${invalid.join(', ')}`);
  }

  const files = entries.filter((f) => MIGRATION_PATTERN.test(f)).sort();
  if (files.length === 0) return;

  const applied = new Set(
    db
      .prepare<{ name: string }, []>('SELECT name FROM _migrations')
      .all()
      .map((r) => r.name),
  );

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = readFileSync(join(migrationsDir, file), 'utf-8');

    db.transaction(() => {
      db.exec(sql);
      db.run('INSERT INTO _migrations (name) VALUES (?)', [file]);
    })();

    console.log(`Migration applied: ${file}`);
  }
}
