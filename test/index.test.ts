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

let registerCounter = 0;

/** Register + verify a user, returning the auth cookie header value. */
async function registerUser(email: string, password: string): Promise<string> {
  // Use a unique IP per registration to avoid rate limiting
  const ip = `10.0.0.${++registerCounter}`;

  // Initiate registration
  const initRes = await app.handle(
    new Request(`${BASE}/api/auth/register/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
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
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
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

// ─── Sharing ──────────────────────────────────────────────────────────────────

describe('Sharing', () => {
  let cookieA: string;
  let cookieB: string;

  beforeAll(async () => {
    cookieA = await registerUser('owner@test.com', 'password123');
    cookieB = await registerUser('viewer@test.com', 'password123');

    // Owner sets up some shifts
    await app.handle(
      new Request(`${BASE}/api/calendar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({ '2025-03-01': 'label1' }),
      }),
    );
  });

  test('unauthenticated requests return 401', async () => {
    const res1 = await app.handle(new Request(`${BASE}/api/shares`));
    expect(res1.status).toBe(401);

    const res2 = await app.handle(new Request(`${BASE}/api/shared-calendars`));
    expect(res2.status).toBe(401);
  });

  test('POST /api/shares creates a share and sends invite email', async () => {
    const sentBefore = emailService.sent.length;
    const res = await app.handle(
      new Request(`${BASE}/api/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({ email: 'viewer@test.com' }),
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Wait for fire-and-forget email
    await new Promise((r) => setTimeout(r, 50));
    const sent = emailService.sent.slice(sentBefore);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('viewer@test.com');
    expect(sent[0].subject).toContain('shared their NurseCal calendar');
  });

  test('POST /api/shares rejects sharing with yourself', async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({ email: 'owner@test.com' }),
      }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('yourself');
  });

  test('POST /api/shares returns 201 for duplicate share (prevents enumeration)', async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({ email: 'viewer@test.com' }),
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  test('POST /api/shares returns 201 for unknown email (prevents enumeration)', async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieA },
        body: JSON.stringify({ email: 'nobody@test.com' }),
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  test('GET /api/shares lists shares for the owner', async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/shares`, {
        headers: { Cookie: cookieA },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBeArrayOfSize(1);
    expect(data[0].email).toBe('viewer@test.com');
  });

  test('GET /api/shared-calendars lists calendars shared with user', async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/shared-calendars`, {
        headers: { Cookie: cookieB },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBeArrayOfSize(1);
    expect(data[0].email).toBe('owner@test.com');
    expect(data[0].ownerId).toBeUndefined();
  });

  test('GET /api/shared-calendars/:ownerEmail returns shifts and labels', async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/shared-calendars/${encodeURIComponent('owner@test.com')}`, {
        headers: { Cookie: cookieB },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.shifts).toEqual({ '2025-03-01': 'label1' });
    expect(data.labels).toBeArray();
    expect(data.labels.length).toBeGreaterThan(0);
    expect(data.labels[0].shortCode).toBeDefined();
  });

  test('GET /api/shared-calendars/:ownerEmail returns 404 without access', async () => {
    // cookieA trying to view owner@test.com's calendar via shared endpoint (no self-share)
    const res = await app.handle(
      new Request(`${BASE}/api/shared-calendars/${encodeURIComponent('owner@test.com')}`, {
        headers: { Cookie: cookieA },
      }),
    );
    expect(res.status).toBe(404);
  });

  test('GET /api/shared-calendars/:ownerEmail returns 404 for non-existent user', async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/shared-calendars/${encodeURIComponent('nonexistent@test.com')}`, {
        headers: { Cookie: cookieB },
      }),
    );
    expect(res.status).toBe(404);
  });

  test('DELETE /api/shares/:id revokes a share', async () => {
    // Get share ID from the list
    const listRes = await app.handle(
      new Request(`${BASE}/api/shares`, {
        headers: { Cookie: cookieA },
      }),
    );
    const shares = await listRes.json();
    const shareId = shares[0].id;

    const res = await app.handle(
      new Request(`${BASE}/api/shares/${shareId}`, {
        method: 'DELETE',
        headers: { Cookie: cookieA },
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  test('shared calendar is no longer accessible after revocation', async () => {
    const listRes = await app.handle(
      new Request(`${BASE}/api/shared-calendars`, {
        headers: { Cookie: cookieB },
      }),
    );
    const data = await listRes.json();
    expect(data).toBeArrayOfSize(0);
  });

  test('DELETE /api/shares/:id returns 404 for non-existent share', async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/shares/nonexistent`, {
        method: 'DELETE',
        headers: { Cookie: cookieA },
      }),
    );
    expect(res.status).toBe(404);
  });
});
