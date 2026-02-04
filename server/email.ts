import nodemailer from 'nodemailer';

export interface EmailService {
  sendEmail(from: string, to: string, subject: string, html: string): Promise<void>;
}

interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  secure?: boolean;
}

export function createSmtpEmailService({ host, port, username, password, secure }: SmtpConfig): EmailService {
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: secure ?? port === 465,
    auth: { user: username, pass: password },
  });

  return {
    async sendEmail(from, to, subject, html) {
      await transporter.sendMail({ from, to, subject, html });
    },
  };
}

export function createLoggingEmailService(): EmailService {
  return {
    async sendEmail(from, to, subject, html) {
      console.log(`[Email] From: ${from} | To: ${to} | Subject: ${subject}`);
      console.log(`[Email] Body: ${html}`);
    },
  };
}

export interface SentEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
}

export function createInMemoryEmailService(): EmailService & { sent: SentEmail[] } {
  const sent: SentEmail[] = [];
  return {
    sent,
    async sendEmail(from, to, subject, html) {
      sent.push({ from, to, subject, html });
    },
  };
}
