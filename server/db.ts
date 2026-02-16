import { Database } from 'bun:sqlite';
import { existsSync } from 'fs';
import { migrate } from './migrate';

export function createDB(dbPath: string) {
  const isNewDb = !existsSync(dbPath);

  console.log(`Database path: ${dbPath}`);
  if (isNewDb) {
    console.log('Creating new database');
  }

  const db = new Database(dbPath);

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Apply migrations (creates schema on fresh DBs, evolves existing ones)
  migrate(db);

  const userQueries = {
    findByEmail: db.prepare<{ id: number; email: string; password_hash: string; created_at: string }, [string]>(
      'SELECT * FROM users WHERE email = ?',
    ),

    findById: db.prepare<{ id: number; email: string; password_hash: string; created_at: string }, [number]>(
      'SELECT * FROM users WHERE id = ?',
    ),

    create: db.prepare<{ id: number }, [string, string]>(
      'INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id',
    ),
  };

  const labelQueries = {
    findByUserId: db.prepare<
      { id: string; user_id: number; short_code: string; name: string; color: string },
      [number]
    >('SELECT * FROM labels WHERE user_id = ?'),

    findById: db.prepare<{ id: string; user_id: number; short_code: string; name: string; color: string }, [string]>(
      'SELECT * FROM labels WHERE id = ?',
    ),

    create: db.prepare('INSERT INTO labels (id, user_id, short_code, name, color) VALUES (?, ?, ?, ?, ?)'),

    update: db.prepare('UPDATE labels SET short_code = ?, name = ?, color = ? WHERE id = ? AND user_id = ?'),

    delete: db.prepare('DELETE FROM labels WHERE id = ? AND user_id = ?'),
  };

  const calendarQueries = {
    findByUserId: db.prepare<{ user_id: number; shifts: string }, [number]>(
      'SELECT * FROM calendars WHERE user_id = ?',
    ),

    upsert: db.prepare(
      'INSERT INTO calendars (user_id, shifts) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET shifts = excluded.shifts',
    ),
  };

  const oauthStateQueries = {
    insert: db.prepare('INSERT INTO oauth_states (state, user_id, expires_at) VALUES (?, ?, ?)'),
    find: db.prepare<{ state: string; user_id: number; expires_at: number }, [string]>(
      'SELECT * FROM oauth_states WHERE state = ?',
    ),
    delete: db.prepare('DELETE FROM oauth_states WHERE state = ?'),
    deleteExpired: db.prepare('DELETE FROM oauth_states WHERE expires_at < ?'),
  };

  const googleTokenQueries = {
    findByUserId: db.prepare<
      {
        user_id: number;
        access_token: string;
        refresh_token: string;
        expires_at: number;
        scope: string;
        visible: number;
      },
      [number]
    >('SELECT * FROM google_tokens WHERE user_id = ?'),

    upsert: db.prepare(
      `INSERT INTO google_tokens (user_id, access_token, refresh_token, expires_at, scope, visible)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(user_id) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         expires_at = excluded.expires_at,
         scope = excluded.scope`,
    ),

    updateAccessToken: db.prepare('UPDATE google_tokens SET access_token = ?, expires_at = ? WHERE user_id = ?'),

    toggleVisibility: db.prepare(
      'UPDATE google_tokens SET visible = CASE WHEN visible = 1 THEN 0 ELSE 1 END WHERE user_id = ?',
    ),

    delete: db.prepare('DELETE FROM google_tokens WHERE user_id = ?'),
  };

  return { db, userQueries, labelQueries, calendarQueries, oauthStateQueries, googleTokenQueries };
}

// Helper to generate UUIDs for labels
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}
