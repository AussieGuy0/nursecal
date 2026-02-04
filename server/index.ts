import * as Sentry from '@sentry/bun';
import { createApp } from './app';
import { createSmtpEmailService, createLoggingEmailService, type EmailService } from './email';

Sentry.init({
  dsn: 'https://b5d29bc60300fac1d1fa0f37287f1685@o4510803064520704.ingest.us.sentry.io/4510803064782848',
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
});

const PORT = process.env.PORT || 3123;

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

let emailService: EmailService;
const { SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD } = process.env;
if (SMTP_HOST && SMTP_PORT && SMTP_USERNAME && SMTP_PASSWORD) {
  emailService = createSmtpEmailService({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    username: SMTP_USERNAME,
    password: SMTP_PASSWORD,
  });
  console.log('Using SMTP email service');
} else {
  emailService = createLoggingEmailService();
  console.log('Using logging email service');
}

const { app } = createApp({
  dbPath: process.env.NODE_ENV === 'production' ? '/app/data/nursecal.db' : './nursecal.db',
  jwtSecret: process.env.JWT_SECRET,
  emailService,
});

app.listen(PORT);

console.log(`Server running at http://localhost:${PORT}`);

export type App = typeof app;
