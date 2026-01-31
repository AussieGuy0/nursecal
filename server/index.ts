import { createApp } from './app';

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
