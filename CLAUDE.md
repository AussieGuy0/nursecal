# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NurseCal is a PWA for nurses to track work shifts on a monthly calendar. Users assign customizable shift labels (e.g., "E" for early, "L" for late, "N" for night) with custom colors to calendar days.

## Commands

```bash
# Install dependencies
bun install

# Development - run both in separate terminals:
bun run dev              # Backend server on :3123 (hot reload)
bun run dev:frontend     # Vite dev server on :5173 (proxies /api to backend)

# Production
bun run build            # TypeScript compile + Vite production build
bun run start            # Run production server on :3123

# Type checking
bun run tsc              # Frontend type check only

# Tests
bun test                 # Backend tests (uses temp SQLite DB)
```

## Architecture

**Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + PWA (vite-plugin-pwa)
**Backend:** Elysia (Bun HTTP framework) + SQLite + JWT authentication

### Directory Structure

- `src/` - React frontend
  - `components/` - UI components (Calendar, DayCell, SettingsManager, LabelPicker, AuthForm, Header)
  - `hooks/` - State management hooks (useAuth, useLabels, useShifts)
  - `utils/calendar.ts` - Date calculations
  - `types.ts` - Frontend TypeScript interfaces
- `server/` - Elysia backend
  - `app.ts` - `createApp()` factory: builds the Elysia app with all routes
  - `index.ts` - Entrypoint: reads env vars, calls `createApp()`, starts server
  - `db.ts` - `createDB(dbPath)` factory: runs migrations, prepares queries
  - `migrate.ts` - Migration runner: applies numbered `.sql` files from `migrations/`
  - `migrations/` - SQL migration files (`NNN_name.sql` format)
  - `schema.sql` - Auto-generated snapshot of the current DB schema (updated by tests)
  - `otc.ts` - `createOTCService(db)` factory: one-time code operations
  - `email.ts` - `EmailService` interface + factories: `createSmtpEmailService()`, `createLoggingEmailService()`, `createInMemoryEmailService()`
  - `types.ts` - Backend TypeScript interfaces
- `test/` - Backend tests
  - `index.test.ts` - API tests using Elysia `.handle()`

### Key Patterns

- **State Management:** Custom React hooks (no Redux/Zustand). Each hook manages its own API calls and local state.
- **Sync Strategy:** `useShifts` uses 500ms debounced sync with optimistic UI updates.
- **Auth:** JWT stored in HTTP-only cookies, 30-day expiration. Rate limiting on auth endpoints.
- **Email:** `EmailService` abstraction with SMTP (nodemailer), logging (console), and in-memory (testing) implementations. `createApp()` requires an `emailService`. Registration OTC is delivered via this service.
- **Database:** SQLite with prepared statements. Shifts stored as JSON. Schema managed via migration files in `server/migrations/` (see below).
- **PWA:** Service worker (workbox via vite-plugin-pwa) caches static assets and uses a navigation fallback to `index.html` for offline SPA support. `/api/*` routes are excluded from the navigation fallback (`navigateFallbackDenylist` in `vite.config.ts`) so that server-initiated redirects (e.g., OAuth callbacks) reach the backend instead of being intercepted by the service worker. When debugging issues with routes returning unexpected HTML, check whether the service worker is interfering.

### API Endpoints

- `POST /api/auth/register/initiate` - Start registration (sends OTC)
- `POST /api/auth/register/verify` - Verify OTC and create user
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Check auth status
- `GET/POST/PUT/DELETE /api/labels` - CRUD for shift labels
- `GET/PUT /api/calendar` - Get/update shift assignments

### Migrations

Schema changes are managed by `server/migrate.ts`. Migration files live in `server/migrations/` and must follow the `NNN_name.sql` naming pattern (e.g., `002_add_notes_column.sql`). They run automatically on startup in sorted order, tracked in a `_migrations` table. To add a migration:

1. Create `server/migrations/NNN_description.sql` with the SQL
2. Run `bun test` — the schema snapshot test will fail; delete `server/schema.sql` and re-run to regenerate it
3. Commit both the migration and updated `schema.sql`

## Environment Variables

- `JWT_SECRET` - Required for JWT signing
- `NODE_ENV` - Set to "production" for secure cookies
- `EMAIL_DOMAIN` - Optional; domain for outbound email `from` address. Defaults to `localhost`.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` - Optional; if all set, emails sent via SMTP. Otherwise logs to console.

## Deployment

Deployed to Fly.io (Sydney region). SQLite data persisted on mounted volume at `/app/data`. GitHub Actions handles CI (type check + build) and auto-deploy on main branch push.
