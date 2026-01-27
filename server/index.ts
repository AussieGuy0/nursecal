import { Elysia, t } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { staticPlugin } from '@elysiajs/static';
import { db, initDB, userQueries, labelQueries, calendarQueries, generateId } from './db';
import { DEFAULT_LABELS, type JWTPayload, type LabelResponse, type ShiftMap } from './types';

// Initialize database
initDB();

const PORT = process.env.PORT || 3123;
const JWT_SECRET = process.env.JWT_SECRET || 'nursecal-dev-secret-change-in-production';

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

const app = new Elysia()
  .use(
    jwt({
      name: 'jwt',
      secret: JWT_SECRET,
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
    '/api/auth/register',
    async ({ body, jwt, cookie: { auth }, set }) => {
      const { email, password } = body;

      // Check if user already exists
      const existing = userQueries.findByEmail.get(email);
      if (existing) {
        set.status = 400;
        return { error: 'Email already registered' };
      }

      // Hash password and create user
      const passwordHash = await hashPassword(password);
      const result = userQueries.create.get(email, passwordHash);

      if (!result) {
        set.status = 500;
        return { error: 'Failed to create user' };
      }

      const userId = result.id;

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
        password: t.String({ minLength: 6 }),
      }),
    }
  )
  .post(
    '/api/auth/login',
    async ({ body, jwt, cookie: { auth }, set }) => {
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
        shortCode: t.String({ minLength: 1, maxLength: 3 }),
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
        shortCode: t.Optional(t.String({ minLength: 1, maxLength: 3 })),
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
  // Serve static files from dist/ (built frontend)
  .use(
    staticPlugin({
      assets: 'dist',
      prefix: '/',
    })
  )
  // Fallback to index.html for SPA routing
  .get('*', () => Bun.file('dist/index.html'))
  .listen(PORT);

console.log(`Server running at http://localhost:${PORT}`);

export type App = typeof app;
