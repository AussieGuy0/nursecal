# Google Calendar Read-Only Integration Plan

## Overview
Add one-way Google Calendar viewing to NurseCal. Users can see their Google Calendar events alongside shifts, but shifts don't sync back to Google.

**Key decisions:**
- Show events from **all calendars** (not just primary)
- Include a **visibility toggle** to show/hide events without disconnecting

---

## Implementation Steps

### 1. Database Schema
**File:** `server/db.ts`

Add `google_tokens` table:
```sql
CREATE TABLE google_tokens (
  user_id INTEGER PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  scope TEXT NOT NULL,
  visible INTEGER DEFAULT 1,  -- visibility toggle
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
```

Add prepared statements for token CRUD operations.

---

### 2. Backend OAuth Endpoints
**File:** `server/index.ts`

Add endpoints:
- `GET /api/google/auth` - Generate OAuth URL (scope: `calendar.readonly`)
- `GET /api/google/callback` - Handle OAuth callback, store tokens
- `GET /api/google/status` - Check connection status + visibility
- `POST /api/google/disconnect` - Remove tokens
- `POST /api/google/toggle` - Toggle visibility on/off
- `GET /api/google/events?timeMin=&timeMax=` - Fetch events from all calendars

**Token refresh:** Auto-refresh expired access tokens using refresh token.

**Fetching all calendars:** Query `/calendar/v3/users/me/calendarList` first, then fetch events from each calendar.

---

### 3. Environment Variables
Required:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3123/api/google/callback
```

---

### 4. Frontend Types
**File:** `src/types.ts`

```typescript
interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  isAllDay: boolean;
  calendarName?: string;
  color?: string;
}
```

---

### 5. Frontend Hook
**New file:** `src/hooks/useGoogleCalendar.ts`

- Check connection status on mount
- Fetch events when connected and month changes
- Provide `connect()`, `disconnect()`, `toggleVisibility()` methods
- Group events by date key (YYYY-MM-DD)

---

### 6. UI Components

**Update `DayCell.tsx`:**
- Display Google events below shift label
- Show up to 2 events with "+N more" indicator
- Style: amber/yellow background to distinguish from shift labels

**Update `Header.tsx`:**
- Add Google Calendar button with connection indicator
- Add visibility toggle (eye icon) when connected

**New `GoogleCalendarSettings.tsx`:**
- Modal to connect/disconnect Google account
- Show connection status

**Update `App.tsx`:**
- Integrate `useGoogleCalendar` hook
- Pass events to Calendar component
- Handle OAuth redirect params

---

### 7. Visual Design

| Element | Style |
|---------|-------|
| Shift labels | Colored badge with short code (E, L, N) |
| Google events | Amber/yellow pill with truncated title |
| Connected indicator | Amber calendar icon in header |
| Visibility toggle | Eye icon next to Google calendar button |

---

## Files to Modify

1. `server/db.ts` - Add google_tokens table and queries
2. `server/index.ts` - Add 6 new API endpoints
3. `src/types.ts` - Add GoogleCalendarEvent type
4. `src/hooks/useGoogleCalendar.ts` - New hook (create)
5. `src/components/DayCell.tsx` - Display Google events
6. `src/components/Calendar.tsx` - Pass events to DayCell
7. `src/components/Header.tsx` - Add Google button + toggle
8. `src/components/GoogleCalendarSettings.tsx` - New modal (create)
9. `src/App.tsx` - Wire everything together

---

## Verification

1. Start dev server: `bun run dev`
2. Log in and open Google Calendar settings
3. Click "Connect Google Calendar" - should redirect to Google OAuth
4. After authorization, redirect back with events visible
5. Toggle visibility off - events should hide
6. Toggle back on - events should reappear
7. Disconnect - events should disappear, can reconnect
8. Test with events spanning multiple days and all-day events
