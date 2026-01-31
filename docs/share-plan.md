# Calendar Sharing Feature Plan

## Overview
Add read-only calendar sharing where users can invite other NurseCal users by email. Shared users view the owner's calendar with their labels (colors/short codes) but cannot edit.

## Database Changes

**New table: `calendar_shares`** in `server/db.ts`
```sql
CREATE TABLE IF NOT EXISTS calendar_shares (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  shared_with_id INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (shared_with_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (owner_id, shared_with_id)
)
```

Add prepared queries: `findSharedWithUser`, `findSharesByOwner`, `findShare`, `create`, `delete`, `hasAccess`

## Backend API Endpoints

Add to `server/index.ts`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/shares` | POST | Create share (invite by email) |
| `/api/shares` | GET | List who I've shared with |
| `/api/shares/:id` | DELETE | Revoke a share |
| `/api/shared-calendars` | GET | List calendars shared with me |
| `/api/shared-calendars/:ownerId` | GET | Get shared calendar data (shifts + labels) |

The shared calendar endpoint returns both the owner's shifts AND their labels so the viewer sees correct colors.

## Frontend Changes

### New Hooks
- `src/hooks/useShares.ts` - Manage shares (add/remove) and fetch calendars shared with me
- `src/hooks/useSharedCalendar.ts` - Fetch a specific shared calendar's data

### New Components
- `src/components/ShareManager.tsx` - Modal to invite users and manage existing shares
- `src/components/CalendarSwitcher.tsx` - Dropdown to switch between own calendar and shared calendars

### Modified Files
- `src/components/Header.tsx` - Add "Share" button (hidden when viewing shared calendar)
- `src/components/DayCell.tsx` - Add `readOnly` prop to disable interaction
- `src/App.tsx` - Integrate view switching, conditional data display, disable editing for shared view

## Data Flow

**Viewing own calendar** (existing):
- `useLabels` → own labels, `useShifts` → own shifts, editing enabled

**Viewing shared calendar**:
1. User selects from CalendarSwitcher dropdown
2. `useSharedCalendar(ownerId)` fetches `/api/shared-calendars/:ownerId`
3. Response includes owner's labels + shifts
4. Calendar renders with owner's data
5. Day tap disabled, no LabelPicker shown

## Security
- Backend only allows GET for shared calendars (no PUT)
- `hasAccess` query validates share exists before returning data
- Existing PUT `/api/calendar` only affects authenticated user's data

## Implementation Order

1. **Database** (`server/db.ts`) - Add table + queries
2. **Backend routes** (`server/index.ts`) - Add 5 endpoints
3. **Frontend types** (`src/types.ts`) - Add Share, SharedCalendar types
4. **Hooks** - Create useShares, useSharedCalendar
5. **Components** - Create ShareManager, CalendarSwitcher
6. **Integration** - Update Header, DayCell, App.tsx

## Verification

1. Run `bun run dev` and `bun run dev:frontend`
2. Create two test accounts
3. From Account A: Share calendar with Account B's email
4. From Account B: Verify shared calendar appears in switcher
5. View Account A's calendar from Account B - confirm read-only
6. Add a shift in Account A, refresh Account B - confirm sync
7. From Account A: Remove share, confirm Account B loses access
