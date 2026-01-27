# Nurse Calendar

A PWA for nurses to track shifts on a monthly calendar. Tap a day to assign a customizable label (e.g., "E" for early shift, "L" for late shift) with custom colors.

## Features

- Monthly calendar with navigation
- Tap days to assign shift labels
- Custom labels with colors
- Offline support (PWA)
- User authentication (email/password)
- Server-side data persistence (SQLite)

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, vite-plugin-pwa
- **Backend:** Elysia (Bun), SQLite, JWT authentication

## Development

Start the backend server:
```bash
bun install
bun run dev
```

For frontend hot-reload, run in a separate terminal:
```bash
bun run dev:frontend
```

Then open http://localhost:5173

## Production

Build and run:
```bash
bun run build
bun run start
```

Then open http://localhost:3123
