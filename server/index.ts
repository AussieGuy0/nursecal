import * as Sentry from '@sentry/bun';
import { createApp } from './app';

Sentry.init({
  dsn: 'https://b5d29bc60300fac1d1fa0f37287f1685@o4510803064520704.ingest.us.sentry.io/4510803064782848',
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
});

const PORT = process.env.PORT || 3123;

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const { app } = createApp({
  dbPath: process.env.NODE_ENV === 'production' ? '/app/data/nursecal.db' : './nursecal.db',
  jwtSecret: process.env.JWT_SECRET,
});

app.listen(PORT);

console.log(`Server running at http://localhost:${PORT}`);

export type App = typeof app;
