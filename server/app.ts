import * as Sentry from '@sentry/bun';
import { Elysia, t } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { openapi, fromTypes } from '@elysiajs/openapi';
import { createDB, generateId } from './db';
import { createOTCService, generateOTC } from './otc';
import { DEFAULT_LABELS, type JWTPayload, type LabelResponse, type ShiftMap } from './types';
import {
  buildAuthUrl,
  generateOAuthState,
  exchangeCodeForTokens,
  refreshAccessToken,
  revokeToken,
  fetchAllCalendarEvents,
} from './google';
import type { EmailService } from './email';
import { createInMemoryRateLimiter } from './rateLimit';
// Maximum shares a single user can create (prevents abuse)
const MAX_SHARES = 50;
// Maximum calendar entries per PUT — one per day for a full leap year
const MAX_CALENDAR_ENTRIES = 366;

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

export function createApp({
  dbPath,
  jwtSecret,
  emailService,
  emailDomain = 'localhost',
}: {
  dbPath: string;
  jwtSecret: string;
  emailService: EmailService;
  emailDomain?: string;
}) {
  const { userQueries, labelQueries, calendarDayQueries, shareQueries, oauthStateQueries, googleTokenQueries, db } =
    createDB(dbPath);
  const { storeOTC, getOTC, deleteOTC } = createOTCService(db);

  const rateLimiter = createInMemoryRateLimiter({ windowMs: 15 * 60 * 1000, maxAttempts: 5 });

  // Per-email OTC failed attempt tracking: email -> failedCount
  // Cleared on successful verification or when OTC is deleted.
  // Locked out emails must re-initiate registration to get a fresh OTC.
  const OTC_MAX_FAILED_ATTEMPTS = 5;
  const otcFailedAttempts = new Map<string, number>();

  // Cleanup old entries periodically
  setInterval(() => {
    rateLimiter.cleanup();
    oauthStateQueries.deleteExpired.run(Date.now());
    // Remove OTC attempt counters for emails that no longer have a pending OTC
    for (const email of otcFailedAttempts.keys()) {
      if (!getOTC(email)) {
        otcFailedAttempts.delete(email);
      }
    }
  }, 60 * 1000);

  const app = new Elysia()
    .onError(({ error }) => {
      Sentry.captureException(error);
    })
    .derive(({ request }) => {
      return { requestStart: performance.now(), requestPath: new URL(request.url).pathname };
    })
    .onAfterResponse(({ request, set, requestStart, requestPath }) => {
      const duration = (performance.now() - requestStart).toFixed(1);
      console.log(`${request.method} ${requestPath} ${set.status ?? 200} ${duration}ms`);
    })
    .use(
      openapi({
        path: '/api/openapi',
        references: fromTypes(),
        scalar: {
          url: '/api/openapi/json',
        },
      }),
    )
    .use(
      jwt({
        name: 'jwt',
        secret: jwtSecret,
        exp: '30d',
      }),
    )
    // Derive user from JWT cookie (available on all routes)
    .derive(async ({ jwt, cookie: { auth } }) => {
      const token = auth?.value;
      if (!token || typeof token !== 'string') {
        return { user: null as { id: number; email: string } | null };
      }

      try {
        const payload = (await jwt.verify(token)) as JWTPayload | false;
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
    // -------------------------
    // Unauthenticated routes
    // -------------------------
    .post(
      '/api/auth/register/initiate',
      async ({ body, set, request }) => {
        const ip =
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          request.headers.get('x-real-ip') ||
          'unknown';
        const rateLimit = rateLimiter.check(`register:${ip}`);
        if (!rateLimit.allowed) {
          set.status = 429;
          set.headers['Retry-After'] = String(rateLimit.retryAfterSeconds);
          return { error: 'Too many attempts. Please try again later.' };
        }

        const { email, password } = body;

        const existing = userQueries.findByEmail.get(email);
        if (existing) {
          set.status = 400;
          return { error: 'Email already registered' };
        }

        const passwordHash = await hashPassword(password);
        const code = generateOTC();

        storeOTC(email, code, passwordHash);

        try {
          await emailService.sendEmail(
            `NurseCal <noreply@${emailDomain}>`,
            email,
            'Your NurseCal verification code',
            `<p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`,
          );
        } catch (err) {
          console.error('[Email] Failed to send verification code:', err);
          deleteOTC(email);
          set.status = 500;
          return { error: 'Failed to send verification code. Please try again.' };
        }

        return { success: true, message: 'Verification code sent' };
      },
      {
        body: t.Object({
          email: t.String({ format: 'email' }),
          password: t.String({ minLength: 8 }),
        }),
      },
    )
    .post(
      '/api/auth/register/verify',
      async ({ body, jwt, cookie: { auth }, set, request }) => {
        const ip =
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          request.headers.get('x-real-ip') ||
          'unknown';
        const rateLimit = rateLimiter.check(`register-verify:${ip}`);
        if (!rateLimit.allowed) {
          set.status = 429;
          set.headers['Retry-After'] = String(rateLimit.retryAfterSeconds);
          return { error: 'Too many attempts. Please try again later.' };
        }

        const { email, code } = body;

        const otcRecord = getOTC(email);
        if (!otcRecord) {
          set.status = 400;
          return { error: 'No pending registration found. Please start over.' };
        }

        if (Date.now() > otcRecord.expiresAt) {
          deleteOTC(email);
          otcFailedAttempts.delete(email);
          set.status = 400;
          return { error: 'Verification code expired. Please start over.' };
        }

        const failedAttempts = otcFailedAttempts.get(email) ?? 0;
        if (failedAttempts >= OTC_MAX_FAILED_ATTEMPTS) {
          deleteOTC(email);
          otcFailedAttempts.delete(email);
          set.status = 429;
          return { error: 'Too many incorrect attempts. Please start registration over.' };
        }

        if (otcRecord.code !== code) {
          otcFailedAttempts.set(email, failedAttempts + 1);
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

        let result: { id: number } | null = null;
        try {
          result = userQueries.create.get(email, otcRecord.passwordHash);
        } catch {
          deleteOTC(email);
          set.status = 409;
          return { error: 'Email already registered' };
        }
        if (!result) {
          set.status = 500;
          return { error: 'Failed to create user' };
        }

        const userId = result.id;
        deleteOTC(email);
        otcFailedAttempts.delete(email);

        // Seed default labels for the new user
        for (const label of DEFAULT_LABELS) {
          labelQueries.create.run(generateId(), userId, label.shortCode, label.name, label.color);
        }

        const token = await jwt.sign({ userId, email });
        auth.set({
          value: token,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30, // 30 days
          path: '/',
        });

        return { success: true, email };
      },
      {
        body: t.Object({
          email: t.String({ format: 'email' }),
          code: t.String({ minLength: 6, maxLength: 6 }),
        }),
      },
    )
    .post(
      '/api/auth/login',
      async ({ body, jwt, cookie: { auth }, set, request }) => {
        const ip =
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          request.headers.get('x-real-ip') ||
          'unknown';
        const rateLimit = rateLimiter.check(`login:${ip}`);
        if (!rateLimit.allowed) {
          set.status = 429;
          set.headers['Retry-After'] = String(rateLimit.retryAfterSeconds);
          return { error: 'Too many attempts. Please try again later.' };
        }

        const { email, password } = body;

        const user = userQueries.findByEmail.get(email);
        if (!user) {
          set.status = 401;
          return { error: 'Invalid email or password' };
        }

        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) {
          set.status = 401;
          return { error: 'Invalid email or password' };
        }

        const token = await jwt.sign({ userId: user.id, email: user.email });
        auth.set({
          value: token,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30, // 30 days
          path: '/',
        });

        return { success: true, email: user.email };
      },
      {
        body: t.Object({
          email: t.String({ format: 'email' }),
          password: t.String(),
        }),
      },
    )
    .post('/api/auth/logout', ({ cookie: { auth } }) => {
      auth.remove();
      return { success: true };
    })
    .get('/api/auth/me', ({ user }) => {
      if (!user) {
        return { authenticated: false };
      }
      return { authenticated: true, email: user.email };
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
      return file.exists().then((exists) => (exists ? file : Bun.file('dist/index.html')));
    })
    // -------------------------
    // Protected routes — 401 if not authenticated
    // -------------------------
    .guard({}, (app) =>
      app
        .onBeforeHandle(({ user, set }) => {
          if (!user) {
            set.status = 401;
            return { error: 'Unauthorized' };
          }
        })
        .derive(({ user }) => ({ user: user as { id: number; email: string } }))
        // Labels
        .get('/api/labels', ({ user }) => {
          const labels = labelQueries.findByUserId.all(user.id);
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
            const id = generateId();
            labelQueries.create.run(id, user.id, body.shortCode, body.name, body.color);
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
          },
        )
        .put(
          '/api/labels/:id',
          ({ user, params, body, set }) => {
            const existing = labelQueries.findById.get(params.id);
            if (!existing || existing.user_id !== user.id) {
              set.status = 404;
              return { error: 'Label not found' };
            }

            const shortCode = body.shortCode ?? existing.short_code;
            const name = body.name ?? existing.name;
            const color = body.color ?? existing.color;

            labelQueries.update.run(shortCode, name, color, params.id, user.id);

            const response: LabelResponse = { id: params.id, shortCode, name, color };
            return response;
          },
          {
            params: t.Object({ id: t.String() }),
            body: t.Object({
              shortCode: t.Optional(t.String({ minLength: 1, maxLength: 4 })),
              name: t.Optional(t.String({ minLength: 1 })),
              color: t.Optional(t.String({ pattern: '^#[0-9a-fA-F]{6}$' })),
            }),
          },
        )
        .delete(
          '/api/labels/:id',
          ({ user, params, set }) => {
            const existing = labelQueries.findById.get(params.id);
            if (!existing || existing.user_id !== user.id) {
              set.status = 404;
              return { error: 'Label not found' };
            }
            labelQueries.delete.run(params.id, user.id);
            return { success: true };
          },
          {
            params: t.Object({ id: t.String() }),
          },
        )
        // Calendar
        .get('/api/calendar', ({ user }) => {
          const days = calendarDayQueries.findByUserId.all(user.id);
          const shifts: ShiftMap = {};
          for (const day of days) {
            shifts[day.date] = day.label_id;
          }
          return shifts;
        })
        .put(
          '/api/calendar',
          ({ user, body, set }) => {
            if (Object.keys(body).length > MAX_CALENDAR_ENTRIES) {
              set.status = 400;
              return { error: 'Too many calendar entries' };
            }

            if (Object.keys(body).length > 0) {
              const userLabels = labelQueries.findByUserId.all(user.id);
              const validLabelIds = new Set(userLabels.map((l) => l.id));
              const invalidId = Object.values(body).find((id) => !validLabelIds.has(id));
              if (invalidId) {
                set.status = 400;
                return { error: 'Invalid label ID' };
              }
            }

            db.transaction(() => {
              calendarDayQueries.deleteByUserId.run(user.id);
              for (const [date, labelId] of Object.entries(body)) {
                calendarDayQueries.upsert.run(user.id, date, labelId);
              }
            })();

            return body;
          },
          {
            body: t.Record(t.String(), t.String()),
          },
        )
        // Sharing
        .post(
          '/api/shares',
          ({ user, body, set, request }) => {
            if (body.email.toLowerCase() === user.email.toLowerCase()) {
              set.status = 400;
              return { error: 'You cannot share with yourself' };
            }

            const ip =
              request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
              request.headers.get('x-real-ip') ||
              'unknown';
            const rateLimit = rateLimiter.check(`share:${ip}`);
            if (!rateLimit.allowed) {
              set.status = 429;
              set.headers['Retry-After'] = String(rateLimit.retryAfterSeconds);
              return { error: 'Too many attempts. Please try again later.' };
            }

            const shareCount = shareQueries.countByOwnerId.get(user.id);
            if (shareCount && shareCount.count >= MAX_SHARES) {
              set.status = 400;
              return { error: 'Maximum number of shares reached' };
            }

            // Uniform response to prevent email enumeration
            const targetUser = userQueries.findByEmail.get(body.email);
            if (targetUser) {
              const existing = shareQueries.hasAccess.get(user.id, targetUser.id);
              if (!existing) {
                const id = generateId();
                shareQueries.create.run(id, user.id, targetUser.id);

                // Send invite email (fire-and-forget, don't fail the share)
                emailService
                  .sendEmail(
                    `NurseCal <noreply@${emailDomain}>`,
                    targetUser.email,
                    `${user.email} shared their NurseCal calendar with you`,
                    `<p><strong>${user.email}</strong> has shared their calendar with you on NurseCal.</p><p>Log in to view their shifts.</p>`,
                  )
                  .catch((err) => console.error('[Email] Failed to send share invite:', err));
              }
            }

            set.status = 201;
            return { success: true };
          },
          {
            body: t.Object({
              email: t.String({ format: 'email' }),
            }),
          },
        )
        .get('/api/shares', ({ user }) => {
          const shares = shareQueries.findByOwnerId.all(user.id);
          return shares.map((s) => ({ id: s.id, email: s.email }));
        })
        .delete(
          '/api/shares/:id',
          ({ user, params, set }) => {
            const share = shareQueries.findById.get(params.id);
            if (!share || share.owner_id !== user.id) {
              set.status = 404;
              return { error: 'Share not found' };
            }
            shareQueries.delete.run(params.id, user.id);
            return { success: true };
          },
          {
            params: t.Object({ id: t.String() }),
          },
        )
        .get('/api/shared-calendars', ({ user }) => {
          const shared = shareQueries.findSharedWithUser.all(user.id);
          return shared.map((s) => ({ email: s.email }));
        })
        .get(
          '/api/shared-calendars/:ownerEmail',
          ({ user, params, set }) => {
            const ownerEmail = decodeURIComponent(params.ownerEmail);
            const owner = userQueries.findByEmail.get(ownerEmail);

            // Uniform 404 for both "no such user" and "no access"
            if (!owner) {
              set.status = 404;
              return { error: 'Calendar not found' };
            }

            const access = shareQueries.hasAccess.get(owner.id, user.id);
            if (!access) {
              set.status = 404;
              return { error: 'Calendar not found' };
            }

            const days = calendarDayQueries.findByUserId.all(owner.id);
            const labels = labelQueries.findByUserId.all(owner.id);

            const shifts: ShiftMap = {};
            for (const day of days) {
              shifts[day.date] = day.label_id;
            }
            const labelResponse: LabelResponse[] = labels.map((l) => ({
              id: l.id,
              shortCode: l.short_code,
              name: l.name,
              color: l.color,
            }));

            return { shifts, labels: labelResponse };
          },
          {
            params: t.Object({ ownerEmail: t.String() }),
          },
        )
        // Google Calendar
        .get('/api/google/auth', ({ user, set }) => {
          const state = generateOAuthState();
          oauthStateQueries.insert.run(state, user.id, Date.now() + 10 * 60 * 1000);

          const url = buildAuthUrl(state);
          if (!url) {
            set.status = 500;
            return { error: 'Google OAuth not configured' };
          }
          return { url };
        })
        .get('/api/google/callback', async ({ query, user, set, redirect }) => {
          if (!query.code) {
            set.status = 400;
            return { error: 'Missing authorization code' };
          }
          if (!query.state) {
            set.status = 400;
            return { error: 'Missing state parameter' };
          }

          const storedState = oauthStateQueries.find.get(query.state);
          if (!storedState || storedState.user_id !== user.id || Date.now() > storedState.expires_at) {
            set.status = 403;
            return { error: 'Invalid or expired OAuth state. Please try again.' };
          }
          oauthStateQueries.delete.run(query.state);

          const tokens = await exchangeCodeForTokens(query.code);
          if (!tokens) {
            set.status = 400;
            return { error: 'Failed to exchange authorization code' };
          }
          if (!tokens.refresh_token) {
            set.status = 400;
            return { error: 'No refresh token received. Please try disconnecting and reconnecting.' };
          }

          googleTokenQueries.upsert.run(
            user.id,
            tokens.access_token,
            tokens.refresh_token,
            Date.now() + tokens.expires_in * 1000,
            tokens.scope,
          );

          return redirect('/');
        })
        .get('/api/google/status', ({ user }) => {
          const record = googleTokenQueries.findByUserId.get(user.id);
          if (!record) return { connected: false, visible: false };
          return { connected: true, visible: record.visible === 1 };
        })
        .post('/api/google/disconnect', async ({ user }) => {
          const record = googleTokenQueries.findByUserId.get(user.id);
          if (record) {
            // Revoke refresh token with Google (best-effort; also invalidates its access tokens)
            await revokeToken(record.refresh_token).catch((err) =>
              console.error('[Google] Failed to revoke token:', err),
            );
          }
          googleTokenQueries.delete.run(user.id);
          return { success: true };
        })
        .post('/api/google/toggle', ({ user, set }) => {
          const record = googleTokenQueries.findByUserId.get(user.id);
          if (!record) {
            set.status = 400;
            return { error: 'Google Calendar not connected' };
          }
          googleTokenQueries.toggleVisibility.run(user.id);
          const updated = googleTokenQueries.findByUserId.get(user.id);
          return { visible: updated!.visible === 1 };
        })
        .get('/api/google/events', async ({ query, user, set }) => {
          const record = googleTokenQueries.findByUserId.get(user.id);
          if (!record) {
            set.status = 400;
            return { error: 'Google Calendar not connected' };
          }
          if (record.visible === 0) return [];

          let accessToken = record.access_token;
          if (Date.now() >= record.expires_at) {
            const refreshResult = await refreshAccessToken(record.refresh_token);
            if (!refreshResult.ok) {
              if (refreshResult.permanent) {
                googleTokenQueries.delete.run(user.id);
                set.status = 401;
                return { error: 'Google token expired. Please reconnect.' };
              }
              set.status = 503;
              return { error: 'Failed to refresh Google token. Please try again later.' };
            }
            accessToken = refreshResult.tokens.access_token;
            googleTokenQueries.updateAccessToken.run(
              accessToken,
              Date.now() + refreshResult.tokens.expires_in * 1000,
              user.id,
            );
          }

          const { timeMin, timeMax } = query;
          if (!timeMin || !timeMax) {
            set.status = 400;
            return { error: 'timeMin and timeMax are required' };
          }

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
          if (!events) {
            set.status = 502;
            return { error: 'Failed to fetch calendar events' };
          }
          return events;
        }),
    );

  return { app, getOTC };
}
