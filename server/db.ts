import { Database } from 'bun:sqlite';
import { existsSync } from 'fs';

const DB_PATH = process.env.NODE_ENV === 'production' ? '/app/data/nursecal.db' : './nursecal.db';
const isNewDb = !existsSync(DB_PATH);

console.log(`Database path: ${DB_PATH}`);
if (isNewDb) {
  console.log('Creating new database');
}

export const db = new Database(DB_PATH);

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Initialize schema immediately
function initSchema() {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Labels table (per-user, seeded with defaults on registration)
  db.run(`
    CREATE TABLE IF NOT EXISTS labels (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      short_code TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Calendar data (JSON blob per user)
  db.run(`
    CREATE TABLE IF NOT EXISTS calendars (
      user_id INTEGER PRIMARY KEY,
      shifts TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // One-time codes for registration verification
  db.run(`
    CREATE TABLE IF NOT EXISTS otc (
      email TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `);
}

// Initialize schema at module load
initSchema();

// Initialize DB (called from index.ts to ensure module is loaded)
export function initDB() {
  // Schema initialized at module load
}

// User queries
export const userQueries = {
  findByEmail: db.prepare<{ id: number; email: string; password_hash: string; created_at: string }, [string]>(
    'SELECT * FROM users WHERE email = ?'
  ),

  findById: db.prepare<{ id: number; email: string; password_hash: string; created_at: string }, [number]>(
    'SELECT * FROM users WHERE id = ?'
  ),

  create: db.prepare<{ id: number }, [string, string]>(
    'INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id'
  ),
};

// Label queries
export const labelQueries = {
  findByUserId: db.prepare<{ id: string; user_id: number; short_code: string; name: string; color: string }, [number]>(
    'SELECT * FROM labels WHERE user_id = ?'
  ),

  findById: db.prepare<{ id: string; user_id: number; short_code: string; name: string; color: string }, [string]>(
    'SELECT * FROM labels WHERE id = ?'
  ),

  create: db.prepare(
    'INSERT INTO labels (id, user_id, short_code, name, color) VALUES (?, ?, ?, ?, ?)'
  ),

  update: db.prepare(
    'UPDATE labels SET short_code = ?, name = ?, color = ? WHERE id = ? AND user_id = ?'
  ),

  delete: db.prepare(
    'DELETE FROM labels WHERE id = ? AND user_id = ?'
  ),
};

// Calendar queries
export const calendarQueries = {
  findByUserId: db.prepare<{ user_id: number; shifts: string }, [number]>(
    'SELECT * FROM calendars WHERE user_id = ?'
  ),

  upsert: db.prepare(
    'INSERT INTO calendars (user_id, shifts) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET shifts = excluded.shifts'
  ),
};

// Helper to generate UUIDs for labels
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}
