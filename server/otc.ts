import { db } from './db';

const OTC_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

interface OTCRecord {
  email: string;
  code: string;
  password_hash: string;
  expires_at: number;
}

// OTC queries
const otcQueries = {
  find: db.prepare<OTCRecord, [string]>(
    'SELECT * FROM otc WHERE email = ?'
  ),

  upsert: db.prepare(
    'INSERT INTO otc (email, code, password_hash, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET code = excluded.code, password_hash = excluded.password_hash, expires_at = excluded.expires_at'
  ),

  delete: db.prepare('DELETE FROM otc WHERE email = ?'),

  deleteExpired: db.prepare('DELETE FROM otc WHERE expires_at < ?'),
};

export function generateOTC(): string {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  // Generate a 6-digit code (100000-999999)
  const code = 100000 + (buffer[0] % 900000);
  return code.toString();
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}

export function storeOTC(email: string, code: string, passwordHash: string): void {
  const expiresAt = Date.now() + OTC_EXPIRY_MS;
  otcQueries.upsert.run(email, code, passwordHash, expiresAt);
}

export function getOTC(email: string): { code: string; passwordHash: string; expiresAt: number } | null {
  const record = otcQueries.find.get(email);
  if (!record) return null;
  return {
    code: record.code,
    passwordHash: record.password_hash,
    expiresAt: record.expires_at,
  };
}

export function deleteOTC(email: string): void {
  otcQueries.delete.run(email);
}

export function cleanupExpiredOTCs(): void {
  otcQueries.deleteExpired.run(Date.now());
}

// Run cleanup periodically
setInterval(cleanupExpiredOTCs, 60 * 1000);
