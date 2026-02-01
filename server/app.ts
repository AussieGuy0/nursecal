import { Elysia, t } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { openapi, fromTypes } from '@elysiajs/openapi';
import { createDB, generateId } from './db';
import { createOTCService, generateOTC, maskEmail } from './otc';
import { DEFAULT_LABELS, type JWTPayload, type LabelResponse, type ShiftMap } from './types';
import { buildAuthUrl, generateOAuthState, exchangeCodeForTokens, refreshAccessToken, revokeToken, fetchAllCalendarEvents } from './google';

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 5;

// Password hashing using Bun's native crypto
async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: 'bcrypt',
    cost: 10,
  });
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

export function createApp({ dbPath, jwtSecret }: { dbPath: string; jwtSecret: string }) {
  const { userQueries, labelQueries, calendarQueries, oauthStateQueries, googleTokenQueries, db } = createDB(dbPath);
  const { storeOTC, getOTC, deleteOTC } = createOTCService(db);

  // In-memory rate limit store: IP -> { count, resetTime }
  const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

  function checkRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const record = rateLimitStore.get(ip);

    if (!record || now > record.resetTime) {
      rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
      return { allowed: true };
    }

    if (record.count >= RATE_LIMIT_MAX_ATTEMPTS) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    record.count++;
    return { allowed: true };
  }

  // Cleanup old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of rateLimitStore) {
      if (now > record.resetTime) {
        rateLimitStore.delete(ip);
      }
    }
    oauthStateQueries.deleteExpired.run(now);
  }, 60 * 1000);

  const app = new Elysia()
    .derive(({ request }) => {
      return { requestStart: performance.now(), requestPath: new URL(request.url).pathname };
    })
    .onAfterResponse(({ request, set, requestStart, requestPath }) => {
      const duration = (performance.now() - requestStart).toFixed(1);
      console.log(`${request.method} ${requestPath} ${set.status ?? 200} ${duration}ms`);
    })
    .use(openapi({
      path: '/api/openapi',
      references: fromTypes(),
      scalar: {
        url: '/api/openapi/json'
      }
    }))
    .use(
      jwt({
        name: 'jwt',
        secret: jwtSecret,
        exp: '7d',
      })
    )
    // Derive user from JWT cookie
    .derive(async ({ jwt, cookie: { auth } }) => {
      const token = auth?.value;
      if (!token || typeof token !== 'string') {
        return { user: null as { id: number; email: string } | null };
      }

      try {
        const payload = await jwt.verify(token) as JWTPayload | false;
        if (!payload) {
          return { user: null as { id: number; email: string } | null };
        }

        const user = userQueries.findById.get(payload.userId);
        if (!user) {
          return { user: null as { id: number; email: string } | null };
        }

        return { user: { id: user.id, email: user.email } };
      } catch {
        return { user: null as { id: number; email: string } | null };
      }
    })
    // Auth routes
    .post(
      '/api/auth/register/initiate',
      async ({ body, set, request }) => {
        // Rate limiting
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          || request.headers.get('x-real-ip')
          || 'unknown';
        const rateLimit = checkRateLimit(`register:${ip}`);
        if (!rateLimit.allowed) {
          set.status = 429;
          set.headers['Retry-After'] = String(rateLimit.retryAfterSeconds);
          return { error: 'Too many attempts. Please try again later.' };
        }

        const { email, password } = body;

        // Check if user already exists
        const existing = userQueries.findByEmail.get(email);
        if (existing) {
          set.status = 400;
          return { error: 'Email already registered' };
        }

        // Hash password and generate OTC
        const passwordHash = await hashPassword(password);
        const code = generateOTC();

        // Store OTC in database
        storeOTC(email, code, passwordHash);

        // Log OTC with masked email (for development - in production this would send an email)
        console.log(`[OTC] Registration code for ${maskEmail(email)}: ${code}`);

        return { success: true, message: 'Verification code sent' };
      },
      {
        body: t.Object({
          email: t.String({ format: 'email' }),
          password: t.String({ minLength: 8 }),
        }),
      }
    )
    .post(
      '/api/auth/register/verify',
      async ({ body, jwt, cookie: { auth }, set, request }) => {
        // Rate limiting
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          || request.headers.get('x-real-ip')
          || 'unknown';
        const rateLimit = checkRateLimit(`register-verify:${ip}`);
        if (!rateLimit.allowed) {
          set.status = 429;
          set.headers['Retry-After'] = String(rateLimit.retryAfterSeconds);
          return { error: 'Too many attempts. Please try again later.' };
        }

        const { email, code } = body;

        // Get OTC record from database
        const otcRecord = getOTC(email);
        if (!otcRecord) {
          set.status = 400;
          return { error: 'No pending registration found. Please start over.' };
        }

        // Check expiry
        if (Date.now() > otcRecord.expiresAt) {
          deleteOTC(email);
          set.status = 400;
          return { error: 'Verification code expired. Please start over.' };
        }

        // Verify code
        if (otcRecord.code !== code) {
          set.status = 400;
          return { error: 'Invalid verification code' };
        }

        // Check again if user exists (race condition protection)
        const existing = userQueries.findByEmail.get(email);
        if (existing) {
          deleteOTC(email);
          set.status = 400;
          return { error: 'Email already registered' };
        }

        // Create user with pre-hashed password
        const result = userQueries.create.get(email, otcRecord.passwordHash);

        if (!result) {
          set.status = 500;
          return { error: 'Failed to create user' };
        }

        const userId = result.id;

        // Clean up OTC
        deleteOTC(email);

        // Seed default labels for the new user
        for (const label of DEFAULT_LABELS) {
          labelQueries.create.run(
            generateId(),
            userId,
            label.shortCode,
            label.name,
            label.color
          );
        }

        // Initialize empty calendar
        calendarQueries.upsert.run(userId, '{}');

        // Create JWT token
        const token = await jwt.sign({
          userId,
          email,
        });

        // Set cookie
        auth.set({
          value: token,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7, // 7 days
          path: '/',
        });

        return { success: true, email };
      },
      {
        body: t.Object({
          email: t.String({ format: 'email' }),
          code: t.String({ minLength: 6, maxLength: 6 }),
        }),
      }
    )
    .post(
      '/api/auth/login',
      async ({ body, jwt, cookie: { auth }, set, request }) => {
        // Rate limiting
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          || request.headers.get('x-real-ip')
          || 'unknown';
        const rateLimit = checkRateLimit(`login:${ip}`);
        if (!rateLimit.allowed) {
          set.status = 429;
          set.headers['Retry-After'] = String(rateLimit.retryAfterSeconds);
          return { error: 'Too many attempts. Please try again later.' };
        }

        const { email, password } = body;

        // Find user
        const user = userQueries.findByEmail.get(email);
        if (!user) {
          set.status = 401;
          return { error: 'Invalid email or password' };
        }

        // Verify password
        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) {
          set.status = 401;
          return { error: 'Invalid email or password' };
        }

        // Create JWT token
        const token = await jwt.sign({
          userId: user.id,
          email: user.email,
        });

        // Set cookie
        auth.set({
          value: token,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7, // 7 days
          path: '/',
        });

        return { success: true, email: user.email };
      },
      {
        body: t.Object({
          email: t.String({ format: 'email' }),
          password: t.String(),
        }),
      }
    )
    .post('/api/auth/logout', ({ cookie: { auth } }) => {
      auth.remove();
      return { success: true };
    })
    .get('/api/auth/me', ({ user }) => {
      if (!user) {
        return { authenticated: false };
      }
      return {
        authenticated: true,
        email: user.email,
      };
    })
    // Labels routes
    .get('/api/labels', ({ user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }

      const labels = labelQueries.findByUserId.all(user.id);

      // Transform to frontend format
      const response: LabelResponse[] = labels.map((label) => ({
        id: label.id,
        shortCode: label.short_code,
        name: label.name,
        color: label.color,
      }));

      return response;
    })
    .post(
      '/api/labels',
      ({ user, body, set }) => {
        if (!user) {
          set.status = 401;
          return { error: 'Unauthorized' };
        }

        const id = generateId();
        labelQueries.create.run(
          id,
          user.id,
          body.shortCode,
          body.name,
          body.color
        );

        const response: LabelResponse = {
          id,
          shortCode: body.shortCode,
          name: body.name,
          color: body.color,
        };

        set.status = 201;
        return response;
      },
      {
        body: t.Object({
          shortCode: t.String({ minLength: 1, maxLength: 4 }),
          name: t.String({ minLength: 1 }),
          color: t.String({ pattern: '^#[0-9a-fA-F]{6}$' }),
        }),
      }
    )
    .put(
      '/api/labels/:id',
      ({ user, params, body, set }) => {
        if (!user) {
          set.status = 401;
          return { error: 'Unauthorized' };
        }

        // Check if label exists and belongs to user
        const existing = labelQueries.findById.get(params.id);
        if (!existing || existing.user_id !== user.id) {
          set.status = 404;
          return { error: 'Label not found' };
        }

        // Update with provided values or keep existing
        const shortCode = body.shortCode ?? existing.short_code;
        const name = body.name ?? existing.name;
        const color = body.color ?? existing.color;

        labelQueries.update.run(shortCode, name, color, params.id, user.id);

        const response: LabelResponse = {
          id: params.id,
          shortCode,
          name,
          color,
        };

        return response;
      },
      {
        params: t.Object({
          id: t.String(),
        }),
        body: t.Object({
          shortCode: t.Optional(t.String({ minLength: 1, maxLength: 4 })),
          name: t.Optional(t.String({ minLength: 1 })),
          color: t.Optional(t.String({ pattern: '^#[0-9a-fA-F]{6}$' })),
        }),
      }
    )
    .delete(
      '/api/labels/:id',
      ({ user, params, set }) => {
        if (!user) {
          set.status = 401;
          return { error: 'Unauthorized' };
        }

        // Check if label exists and belongs to user
        const existing = labelQueries.findById.get(params.id);
        if (!existing || existing.user_id !== user.id) {
          set.status = 404;
          return { error: 'Label not found' };
        }

        labelQueries.delete.run(params.id, user.id);

        return { success: true };
      },
      {
        params: t.Object({
          id: t.String(),
        }),
      }
    )
    // Calendar routes
    .get('/api/calendar', ({ user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: 'Unauthorized' };
      }

      const calendar = calendarQueries.findByUserId.get(user.id);

      if (!calendar) {
        return {} as ShiftMap;
      }

      try {
        return JSON.parse(calendar.shifts) as ShiftMap;
      } catch {
        return {} as ShiftMap;
      }
    })
    .put(
      '/api/calendar',
      ({ user, body, set }) => {
        if (!user) {
          set.status = 401;
          return { error: 'Unauthorized' };
        }

        const shiftsJson = JSON.stringify(body);
        calendarQueries.upsert.run(user.id, shiftsJson);

        return body;
      },
      {
        body: t.Record(t.String(), t.String()),
      }
    )
    // Google Calendar routes
    .get('/api/google/auth', ({ user, set }) => {
      if (!user) { set.status = 401; return { error: 'Unauthorized' }; }

      const state = generateOAuthState();
      oauthStateQueries.insert.run(state, user.id, Date.now() + 10 * 60 * 1000);

      const url = buildAuthUrl(state);
      if (!url) { set.status = 500; return { error: 'Google OAuth not configured' }; }
      return { url };
    })
    .get('/api/google/callback', async ({ query, user, set, redirect }) => {
      if (!user) { set.status = 401; return { error: 'Unauthorized' }; }
      if (!query.code) { set.status = 400; return { error: 'Missing authorization code' }; }
      if (!query.state) { set.status = 400; return { error: 'Missing state parameter' }; }

      const storedState = oauthStateQueries.find.get(query.state);
      if (!storedState || storedState.user_id !== user.id || Date.now() > storedState.expires_at) {
        set.status = 403;
        return { error: 'Invalid or expired OAuth state. Please try again.' };
      }
      oauthStateQueries.delete.run(query.state);

      const tokens = await exchangeCodeForTokens(query.code);
      if (!tokens) { set.status = 400; return { error: 'Failed to exchange authorization code' }; }
      if (!tokens.refresh_token) { set.status = 400; return { error: 'No refresh token received. Please try disconnecting and reconnecting.' }; }

      googleTokenQueries.upsert.run(user.id, tokens.access_token, tokens.refresh_token, Date.now() + tokens.expires_in * 1000, tokens.scope);

      return redirect('/');
    })
    .get('/api/google/status', ({ user, set }) => {
      if (!user) { set.status = 401; return { error: 'Unauthorized' }; }

      const record = googleTokenQueries.findByUserId.get(user.id);
      if (!record) return { connected: false, visible: false };
      return { connected: true, visible: record.visible === 1 };
    })
    .post('/api/google/disconnect', async ({ user, set }) => {
      if (!user) { set.status = 401; return { error: 'Unauthorized' }; }

      const record = googleTokenQueries.findByUserId.get(user.id);
      if (record) {
        // Revoke refresh token with Google (best-effort; also invalidates its access tokens)
        await revokeToken(record.refresh_token).catch(() => {});
      }
      googleTokenQueries.delete.run(user.id);
      return { success: true };
    })
    .post('/api/google/toggle', ({ user, set }) => {
      if (!user) { set.status = 401; return { error: 'Unauthorized' }; }

      const record = googleTokenQueries.findByUserId.get(user.id);
      if (!record) { set.status = 400; return { error: 'Google Calendar not connected' }; }

      googleTokenQueries.toggleVisibility.run(user.id);
      const updated = googleTokenQueries.findByUserId.get(user.id);
      return { visible: updated!.visible === 1 };
    })
    .get('/api/google/events', async ({ query, user, set }) => {
      if (!user) { set.status = 401; return { error: 'Unauthorized' }; }

      const record = googleTokenQueries.findByUserId.get(user.id);
      if (!record) { set.status = 400; return { error: 'Google Calendar not connected' }; }
      if (record.visible === 0) return [];

      let accessToken = record.access_token;
      if (Date.now() >= record.expires_at) {
        const refreshed = await refreshAccessToken(record.refresh_token);
        if (!refreshed) {
          googleTokenQueries.delete.run(user.id);
          set.status = 401;
          return { error: 'Google token expired. Please reconnect.' };
        }
        accessToken = refreshed.access_token;
        googleTokenQueries.updateAccessToken.run(accessToken, Date.now() + refreshed.expires_in * 1000, user.id);
      }

      const { timeMin, timeMax } = query;
      if (!timeMin || !timeMax) { set.status = 400; return { error: 'timeMin and timeMax are required' }; }

      const minDate = new Date(timeMin);
      const maxDate = new Date(timeMax);
      if (isNaN(minDate.getTime()) || isNaN(maxDate.getTime())) {
        set.status = 400;
        return { error: 'timeMin and timeMax must be valid ISO 8601 dates' };
      }
      // Cap range to 90 days to prevent excessive API calls
      const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
      if (maxDate.getTime() - minDate.getTime() > ninetyDaysMs) {
        set.status = 400;
        return { error: 'Date range must not exceed 90 days' };
      }
      if (maxDate <= minDate) {
        set.status = 400;
        return { error: 'timeMax must be after timeMin' };
      }

      const events = await fetchAllCalendarEvents(accessToken, minDate.toISOString(), maxDate.toISOString());
      if (!events) { set.status = 502; return { error: 'Failed to fetch calendar events' }; }
      return events;
    })
    // Serve static files from dist/ (built frontend)
    .get('/', () => Bun.file('dist/index.html'))
    .get('/assets/*', ({ params }) => {
      const filePath = `dist/assets/${params['*']}`;
      return Bun.file(filePath);
    })
    // Catch-all for SPA routing - serve index.html for any unmatched routes
    .get('/*', ({ params }) => {
      const filePath = `dist/${params['*']}`;
      const file = Bun.file(filePath);
      // If file exists, serve it; otherwise serve index.html for SPA routing
      return file.exists().then(exists => exists ? file : Bun.file('dist/index.html'));
    });

  return { app, getOTC };
}
