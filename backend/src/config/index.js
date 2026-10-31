
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/bus_aggregator',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'fallback_secret_key_access',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback_secret_key_refresh',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  corsOrigin: process.env.CORS_ORIGIN || '*',
  uploadDir: path.resolve(__dirname, '../../uploads'),

  // Публичный адрес фронтенда — используется для ссылок в письмах
  appUrl: process.env.APP_URL || 'http://localhost:3000',

  // Настройки отправки почты
  mail: {
    // Resend (https://resend.com) — HTTP API, приоритетный транспорт
    resendApiKey: process.env.RESEND_API_KEY || '',

    // SMTP (запасной транспорт)
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',

    // Адрес отправителя. Для Resend без своего домена используйте onboarding@resend.dev
    from:
      process.env.MAIL_FROM ||
      (process.env.RESEND_API_KEY
        ? 'Межгород Экспресс <onboarding@resend.dev>'
        : 'Межгород Экспресс <no-reply@localhost>'),
  },
};
