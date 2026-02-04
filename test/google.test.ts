import { describe, test, expect, beforeAll, afterAll, mock } from 'bun:test';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync } from 'fs';

// ─── Mock Google module before importing app ──────────────────────────────────

let stateCounter = 0;

const mockBuildAuthUrl = mock((state: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`);

const mockExchangeCodeForTokens = mock(() =>
  Promise.resolve({
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    token_type: 'Bearer',
  }),
);

const mockRefreshAccessToken = mock(() =>
  Promise.resolve({
    access_token: 'refreshed-access-token',
    expires_in: 3600,
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    token_type: 'Bearer',
  }),
);

const mockRevokeToken = mock(() => Promise.resolve(true));

const mockFetchAllCalendarEvents = mock(() =>
  Promise.resolve([
    {
      id: 'event1',
      summary: 'Test Event',
      start: '2025-03-01T09:00:00Z',
      end: '2025-03-01T10:00:00Z',
      isAllDay: false,
      calendarName: 'Primary',
      color: '#4285f4',
    },
  ]),
);

mock.module('../server/google', () => ({
  generateOAuthState: () => `test-state-${++stateCounter}`,
  buildAuthUrl: mockBuildAuthUrl,
  exchangeCodeForTokens: mockExchangeCodeForTokens,
  refreshAccessToken: mockRefreshAccessToken,
  revokeToken: mockRevokeToken,
  fetchAllCalendarEvents: mockFetchAllCalendarEvents,
}));

import { createApp } from '../server/app';

// ─── Test setup ───────────────────────────────────────────────────────────────

const TEST_DB_PATH = join(tmpdir(), `nursecal-google-test-${Date.now()}.db`);

const { app, getOTC } = createApp({
  dbPath: TEST_DB_PATH,
  jwtSecret: 'test-secret',
});

const BASE = 'http://localhost';

afterAll(() => {
  try {
    unlinkSync(TEST_DB_PATH);
  } catch {}
});

async function registerUser(email: string, password: string): Promise<string> {
  const initRes = await app.handle(
    new Request(`${BASE}/api/auth/register/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  );
  expect(initRes.status).toBe(200);

  const otc = getOTC(email);
  expect(otc).not.toBeNull();

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
  return cookie!.split(';')[0];
}

// ─── Unauthenticated access ─────────────────────────────────────────────────

describe('Google Calendar - Unauthenticated', () => {
  test('GET /api/google/auth returns 401', async () => {
    const res = await app.handle(new Request(`${BASE}/api/google/auth`));
    expect(res.status).toBe(401);
  });

  test('GET /api/google/callback returns 401', async () => {
    const res = await app.handle(new Request(`${BASE}/api/google/callback?code=x&state=y`));
    expect(res.status).toBe(401);
  });

  test('GET /api/google/status returns 401', async () => {
    const res = await app.handle(new Request(`${BASE}/api/google/status`));
    expect(res.status).toBe(401);
  });

  test('POST /api/google/disconnect returns 401', async () => {
    const res = await app.handle(new Request(`${BASE}/api/google/disconnect`, { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  test('POST /api/google/toggle returns 401', async () => {
    const res = await app.handle(new Request(`${BASE}/api/google/toggle`, { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  test('GET /api/google/events returns 401', async () => {
    const res = await app.handle(new Request(`${BASE}/api/google/events?timeMin=2025-03-01&timeMax=2025-03-31`));
    expect(res.status).toBe(401);
  });
});

// ─── Full Google Calendar flow ──────────────────────────────────────────────

describe('Google Calendar', () => {
  let cookie: string;

  beforeAll(async () => {
    cookie = await registerUser('google@test.com', 'password123');
  });

  // ── Auth URL ────────────────────────────────────────────────────────────

  describe('GET /api/google/auth', () => {
    test('returns an OAuth URL', async () => {
      const res = await app.handle(
        new Request(`${BASE}/api/google/auth`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.url).toContain('accounts.google.com');
      expect(body.url).toContain('state=');
    });

    test('returns 500 when Google OAuth is not configured', async () => {
      mockBuildAuthUrl.mockImplementationOnce(() => null);

      const res = await app.handle(
        new Request(`${BASE}/api/google/auth`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Google OAuth not configured');
    });
  });

  // ── Status before connecting ────────────────────────────────────────────

  describe('Status - not connected', () => {
    test('returns connected: false', async () => {
      const res = await app.handle(
        new Request(`${BASE}/api/google/status`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.connected).toBe(false);
      expect(body.visible).toBe(false);
    });
  });

  // ── Toggle/Events before connecting ─────────────────────────────────────

  describe('Toggle - not connected', () => {
    test('returns 400', async () => {
      const res = await app.handle(
        new Request(`${BASE}/api/google/toggle`, {
          method: 'POST',
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Google Calendar not connected');
    });
  });

  describe('Events - not connected', () => {
    test('returns 400', async () => {
      const res = await app.handle(
        new Request(`${BASE}/api/google/events?timeMin=2025-03-01T00:00:00Z&timeMax=2025-03-31T00:00:00Z`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Google Calendar not connected');
    });
  });

  // ── OAuth Callback ──────────────────────────────────────────────────────

  describe('GET /api/google/callback', () => {
    test('missing code returns 400', async () => {
      const res = await app.handle(
        new Request(`${BASE}/api/google/callback?state=some-state`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Missing authorization code');
    });

    test('missing state returns 400', async () => {
      const res = await app.handle(
        new Request(`${BASE}/api/google/callback?code=some-code`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Missing state parameter');
    });

    test('invalid state returns 403', async () => {
      const res = await app.handle(
        new Request(`${BASE}/api/google/callback?code=test-code&state=nonexistent-state`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain('Invalid or expired OAuth state');
    });

    test('state belonging to different user returns 403', async () => {
      // Register a second user and get their auth state
      const otherCookie = await registerUser('other@test.com', 'password123');
      const authRes = await app.handle(
        new Request(`${BASE}/api/google/auth`, {
          headers: { Cookie: otherCookie },
        }),
      );
      const { url } = await authRes.json();
      const otherState = new URL(url).searchParams.get('state')!;

      // Try to use that state with the first user
      const res = await app.handle(
        new Request(`${BASE}/api/google/callback?code=test-code&state=${otherState}`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(403);
    });

    test('token exchange failure returns 400', async () => {
      // Create a valid state for this user
      const authRes = await app.handle(
        new Request(`${BASE}/api/google/auth`, {
          headers: { Cookie: cookie },
        }),
      );
      const { url } = await authRes.json();
      const state = new URL(url).searchParams.get('state')!;

      mockExchangeCodeForTokens.mockImplementationOnce(() => Promise.resolve(null));

      const res = await app.handle(
        new Request(`${BASE}/api/google/callback?code=bad-code&state=${state}`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Failed to exchange authorization code');
    });

    test('missing refresh token returns 400', async () => {
      const authRes = await app.handle(
        new Request(`${BASE}/api/google/auth`, {
          headers: { Cookie: cookie },
        }),
      );
      const { url } = await authRes.json();
      const state = new URL(url).searchParams.get('state')!;

      mockExchangeCodeForTokens.mockImplementationOnce(() =>
        Promise.resolve({
          access_token: 'token',
          expires_in: 3600,
          scope: 'calendar.readonly',
          token_type: 'Bearer',
          // no refresh_token
        }),
      );

      const res = await app.handle(
        new Request(`${BASE}/api/google/callback?code=test-code&state=${state}`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('No refresh token received');
    });

    test('successful callback stores tokens and redirects', async () => {
      const authRes = await app.handle(
        new Request(`${BASE}/api/google/auth`, {
          headers: { Cookie: cookie },
        }),
      );
      const { url } = await authRes.json();
      const state = new URL(url).searchParams.get('state')!;

      const res = await app.handle(
        new Request(`${BASE}/api/google/callback?code=valid-code&state=${state}`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/');
      expect(mockExchangeCodeForTokens).toHaveBeenCalled();

      // Verify tokens were stored by checking status
      const statusRes = await app.handle(
        new Request(`${BASE}/api/google/status`, {
          headers: { Cookie: cookie },
        }),
      );
      const status = await statusRes.json();
      expect(status.connected).toBe(true);
    });
  });

  // ── Status after connecting ─────────────────────────────────────────────

  describe('Status - connected', () => {
    test('returns connected: true, visible: true', async () => {
      const res = await app.handle(
        new Request(`${BASE}/api/google/status`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.connected).toBe(true);
      expect(body.visible).toBe(true);
    });
  });

  // ── Toggle visibility ───────────────────────────────────────────────────

  describe('Toggle', () => {
    test('toggles visibility off', async () => {
      const res = await app.handle(
        new Request(`${BASE}/api/google/toggle`, {
          method: 'POST',
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.visible).toBe(false);
    });

    test('toggles visibility back on', async () => {
      const res = await app.handle(
        new Request(`${BASE}/api/google/toggle`, {
          method: 'POST',
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.visible).toBe(true);
    });
  });

  // ── Events ──────────────────────────────────────────────────────────────

  describe('Events', () => {
    test('missing timeMin and timeMax returns 400', async () => {
      const res = await app.handle(
        new Request(`${BASE}/api/google/events`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('timeMin and timeMax are required');
    });

    test('invalid date format returns 400', async () => {
      const res = await app.handle(
        new Request(`${BASE}/api/google/events?timeMin=not-a-date&timeMax=also-not`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('valid ISO 8601');
    });

    test('range exceeding 90 days returns 400', async () => {
      const res = await app.handle(
        new Request(`${BASE}/api/google/events?timeMin=2025-01-01T00:00:00Z&timeMax=2025-07-01T00:00:00Z`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('must not exceed 90 days');
    });

    test('timeMax before timeMin returns 400', async () => {
      const res = await app.handle(
        new Request(`${BASE}/api/google/events?timeMin=2025-03-31T00:00:00Z&timeMax=2025-03-01T00:00:00Z`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('timeMax must be after timeMin');
    });

    test('returns empty array when visibility is off', async () => {
      // Toggle off
      await app.handle(
        new Request(`${BASE}/api/google/toggle`, {
          method: 'POST',
          headers: { Cookie: cookie },
        }),
      );

      const res = await app.handle(
        new Request(`${BASE}/api/google/events?timeMin=2025-03-01T00:00:00Z&timeMax=2025-03-31T00:00:00Z`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);

      // Toggle back on for subsequent tests
      await app.handle(
        new Request(`${BASE}/api/google/toggle`, {
          method: 'POST',
          headers: { Cookie: cookie },
        }),
      );
    });

    test('returns events for valid date range', async () => {
      const res = await app.handle(
        new Request(`${BASE}/api/google/events?timeMin=2025-03-01T00:00:00Z&timeMax=2025-03-31T00:00:00Z`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(200);
      const events = await res.json();
      expect(events).toBeArrayOfSize(1);
      expect(events[0].id).toBe('event1');
      expect(events[0].summary).toBe('Test Event');
      expect(events[0].calendarName).toBe('Primary');
    });

    test('returns 502 when Google API fails', async () => {
      mockFetchAllCalendarEvents.mockImplementationOnce(() => Promise.resolve(null));

      const res = await app.handle(
        new Request(`${BASE}/api/google/events?timeMin=2025-03-01T00:00:00Z&timeMax=2025-03-31T00:00:00Z`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toBe('Failed to fetch calendar events');
    });
  });

  // ── Disconnect ──────────────────────────────────────────────────────────

  describe('Disconnect', () => {
    test('disconnects successfully', async () => {
      const res = await app.handle(
        new Request(`${BASE}/api/google/disconnect`, {
          method: 'POST',
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockRevokeToken).toHaveBeenCalled();
    });

    test('status shows disconnected after disconnect', async () => {
      const res = await app.handle(
        new Request(`${BASE}/api/google/status`, {
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.connected).toBe(false);
    });

    test('disconnect when already disconnected still succeeds', async () => {
      const res = await app.handle(
        new Request(`${BASE}/api/google/disconnect`, {
          method: 'POST',
          headers: { Cookie: cookie },
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });
});
