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

## Environment Variables

| Variable               | Required | Description                                                                          |
| ---------------------- | -------- | ------------------------------------------------------------------------------------ |
| `JWT_SECRET`           | Yes      | Secret key for signing JWT auth tokens. Can generate with `openssl rand -base64 32`. |
| `NODE_ENV`             | No       | Set to `production` in prod, otherwise can leave.                                    |
| `PORT`                 | No       | Server port. Defaults to `3123`.                                                     |
| `GOOGLE_CLIENT_ID`     | No       | OAuth 2.0 client ID for Google Calendar integration.                                 |
| `GOOGLE_CLIENT_SECRET` | No       | OAuth 2.0 client secret.                                                             |
| `GOOGLE_REDIRECT_URI`  | No       | OAuth callback URL, e.g. `https://yourdomain.com/api/google/callback`.               |

### Google Calendar setup

The Google Calendar integration is optional. To enable it:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or select an existing one)
3. Enable the **Google Calendar API** under APIs & Services > Library
4. Go to APIs & Services > Credentials and create an **OAuth 2.0 Client ID** (Web application)
5. Add your callback URL to **Authorized redirect URIs** (e.g. `https://yourdomain.com/api/google/callback`)
6. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in your environment

The app requests `calendar.readonly` scope only.

## Production

Build and run:

```bash
bun run build
bun run start
```

Then open http://localhost:3123
