import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync } from 'fs';
import { createApp } from '../server/app';
import { createInMemoryEmailService } from '../server/email';

const TEST_DB_PATH = join(tmpdir(), `nursecal-test-${Date.now()}.db`);
const emailService = createInMemoryEmailService();

const { app, getOTC } = createApp({
  dbPath: TEST_DB_PATH,
  jwtSecret: 'test-secret',
  emailService,
});

const BASE = 'http://localhost';

afterAll(() => {
  try {
    unlinkSync(TEST_DB_PATH);
  } catch {}
});

/** Register + verify a user, returning the auth cookie header value. */
async function registerUser(email: string, password: string): Promise<string> {
  // Initiate registration
  const initRes = await app.handle(
    new Request(`${BASE}/api/auth/register/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  );
  expect(initRes.status).toBe(200);

  // Grab the OTC from the database directly
  const otc = getOTC(email);
  expect(otc).not.toBeNull();

  // Verify
  const verifyRes = await app.handle(
    new Request(`${BASE}/api/auth/register/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: otc!.code }),
    }),
  );
  expect(verifyRes.status).toBe(200);

  const cookie = verifyRes.headers.getSetCookie().find((c) => c.startsWith('auth='));
  expect(cookie).toBeDefined();
  return cookie!.split(';')[0]; // "auth=<token>"
}

// ─── Auth ────────────────────────────────────────────────────────────────────

describe('Auth', () => {
  const email = 'auth@test.com';
  const password = 'password123';
  let cookie: string;

  test('register flow (initiate + verify)', async () => {
    const sentBefore = emailService.sent.length;
    cookie = await registerUser(email, password);
    expect(cookie).toContain('auth=');

    const sent = emailService.sent.slice(sentBefore);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email);
    expect(sent[0].subject).toContain('verification code');
  });

  test('GET /api/auth/me returns authenticated after register', async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/me`, {
        headers: { Cookie: cookie },
      }),
    );
    const body = await res.json();
    expect(body.authenticated).toBe(true);
    expect(body.email).toBe(email);
  });

  test('duplicate registration returns 400', async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/register/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test('login with correct credentials', async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('login with wrong password returns 401', async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'wrongpassword' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test('logout clears cookie', async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// ─── Unauthenticated access ─────────────────────────────────────────────────

describe('Unauthenticated access', () => {
  test('GET /api/labels returns 401', async () => {
    const res = await app.handle(new Request(`${BASE}/api/labels`));
    expect(res.status).toBe(401);
  });

  test('GET /api/calendar returns 401', async () => {
    const res = await app.handle(new Request(`${BASE}/api/calendar`));
    expect(res.status).toBe(401);
  });
});

// ─── Labels ──────────────────────────────────────────────────────────────────

describe('Labels', () => {
  let cookie: string;

  beforeAll(async () => {
    cookie = await registerUser('labels@test.com', 'password123');
  });

  test('GET /api/labels returns default labels after registration', async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/labels`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(200);
    const labels = await res.json();
    expect(labels).toBeArrayOfSize(3);
    const codes = labels.map((l: any) => l.shortCode).sort();
    expect(codes).toEqual(['E', 'L', 'N']);
  });

  test('POST /api/labels creates a new label', async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ shortCode: 'D', name: 'Day Off', color: '#ef4444' }),
      }),
    );
    expect(res.status).toBe(201);
    const label = await res.json();
    expect(label.shortCode).toBe('D');
    expect(label.name).toBe('Day Off');
    expect(label.color).toBe('#ef4444');
    expect(label.id).toBeDefined();
  });

  test('PUT /api/labels/:id updates a label', async () => {
    // Get labels to find an ID
    const listRes = await app.handle(
      new Request(`${BASE}/api/labels`, {
        headers: { Cookie: cookie },
      }),
    );
    const labels = await listRes.json();
    const target = labels.find((l: any) => l.shortCode === 'D');

    const res = await app.handle(
      new Request(`${BASE}/api/labels/${target.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ name: 'Rest Day' }),
      }),
    );
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.name).toBe('Rest Day');
    expect(updated.shortCode).toBe('D'); // unchanged
  });

  test('DELETE /api/labels/:id removes a label', async () => {
    const listRes = await app.handle(
      new Request(`${BASE}/api/labels`, {
        headers: { Cookie: cookie },
      }),
    );
    const labels = await listRes.json();
    const target = labels.find((l: any) => l.shortCode === 'D');

    const res = await app.handle(
      new Request(`${BASE}/api/labels/${target.id}`, {
        method: 'DELETE',
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(200);

    // Verify it's gone
    const afterRes = await app.handle(
      new Request(`${BASE}/api/labels`, {
        headers: { Cookie: cookie },
      }),
    );
    const after = await afterRes.json();
    expect(after).toBeArrayOfSize(3); // back to default 3
  });

  test('PUT /api/labels/:id returns 404 for non-existent label', async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/labels/nonexistent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ name: 'Nope' }),
      }),
    );
    expect(res.status).toBe(404);
  });
});

// ─── Calendar ────────────────────────────────────────────────────────────────

describe('Calendar', () => {
  let cookie: string;

  beforeAll(async () => {
    cookie = await registerUser('calendar@test.com', 'password123');
  });

  test('GET /api/calendar returns empty object initially', async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/calendar`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({});
  });

  test('PUT /api/calendar saves shifts', async () => {
    const shifts = { '2025-01-15': 'label1', '2025-01-16': 'label2' };
    const res = await app.handle(
      new Request(`${BASE}/api/calendar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(shifts),
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual(shifts);
  });

  test('GET /api/calendar returns saved shifts', async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/calendar`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data['2025-01-15']).toBe('label1');
    expect(data['2025-01-16']).toBe('label2');
  });

  test('PUT /api/calendar overwrites previous data', async () => {
    const newShifts = { '2025-02-01': 'label3' };
    await app.handle(
      new Request(`${BASE}/api/calendar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(newShifts),
      }),
    );

    const res = await app.handle(
      new Request(`${BASE}/api/calendar`, {
        headers: { Cookie: cookie },
      }),
    );
    const data = await res.json();
    expect(data).toEqual(newShifts);
  });
});
