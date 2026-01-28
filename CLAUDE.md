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
```

## Architecture

**Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + PWA (vite-plugin-pwa)
**Backend:** Elysia (Bun HTTP framework) + SQLite + JWT authentication

### Directory Structure

- `src/` - React frontend
  - `components/` - UI components (Calendar, DayCell, LabelManager, LabelPicker, AuthForm, Header)
  - `hooks/` - State management hooks (useAuth, useLabels, useShifts)
  - `utils/calendar.ts` - Date calculations
  - `types.ts` - Frontend TypeScript interfaces
- `server/` - Elysia backend
  - `index.ts` - API routes and server setup
  - `db.ts` - SQLite schema and queries
  - `otc.ts` - One-time code generation for registration
  - `types.ts` - Backend TypeScript interfaces

### Key Patterns

- **State Management:** Custom React hooks (no Redux/Zustand). Each hook manages its own API calls and local state.
- **Sync Strategy:** `useShifts` uses 500ms debounced sync with optimistic UI updates.
- **Auth:** JWT stored in HTTP-only cookies, 7-day expiration. Rate limiting on auth endpoints.
- **Database:** SQLite with prepared statements. Shifts stored as JSON.

### API Endpoints

- `POST /api/auth/register/initiate` - Start registration (sends OTC)
- `POST /api/auth/register/verify` - Verify OTC and create user
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Check auth status
- `GET/POST/PUT/DELETE /api/labels` - CRUD for shift labels
- `GET/PUT /api/calendar` - Get/update shift assignments

## Environment Variables

- `JWT_SECRET` - Required for JWT signing
- `NODE_ENV` - Set to "production" for secure cookies

## Deployment

Deployed to Fly.io (Sydney region). SQLite data persisted on mounted volume at `/app/data`. GitHub Actions handles CI (type check + build) and auto-deploy on main branch push.
