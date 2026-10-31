/**
 * Отправка транзакционных писем.
 *
 * Приоритет транспортов:
 *  1) RESEND_API_KEY задан — отправка через Resend API (https://resend.com).
 *  2) SMTP_HOST задан — отправка через обычный SMTP (nodemailer): Gmail, Yandex, Mail.ru и т.п.
 *  3) Иначе — для локальной разработки тестовый ящик Ethereal; в production — ошибка
 *     (не притворяемся, что письмо ушло).
 */
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { config } from '../config/index.js';
import { logger } from './logger.js';

let smtpTransporterPromise = null;
let resendClient = null;

/** Имя активного транспорта — удобно для логов и тестового скрипта. */
export function getMailTransportName() {
  if (config.mail.resendApiKey) return 'resend';
  if (config.mail.host) return 'smtp';
  if (config.nodeEnv === 'production') return 'none';
  return 'ethereal';
}

function getResendClient() {
  if (!resendClient) {
    resendClient = new Resend(config.mail.resendApiKey);
  }
  return resendClient;
}

async function createSmtpTransporter() {
  const { host, port, secure, user, pass } = config.mail;
  const auth = user && pass ? { auth: { user, pass } } : {};

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    ...auth,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  await transporter.verify();
  logger.info('SMTP transporter is ready', { host, port, secure, auth: Boolean(user && pass) });
  return transporter;
}

async function createEtherealTransporter() {
  logger.warn('Mail is not configured — using Ethereal test account (development only).');
  const testAccount = await nodemailer.createTestAccount();
  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: { user: testAccount.user, pass: testAccount.pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  logger.info('Ethereal test mailbox created', { user: testAccount.user });
  return transporter;
}

async function getSmtpTransporter() {
  if (!smtpTransporterPromise) {
    smtpTransporterPromise = createSmtpTransporter().catch((err) => {
      smtpTransporterPromise = null;
      throw err;
    });
  }
  return smtpTransporterPromise;
}

let etherealTransporterPromise = null;
async function getEtherealTransporter() {
  if (!etherealTransporterPromise) {
    etherealTransporterPromise = createEtherealTransporter().catch((err) => {
      etherealTransporterPromise = null;
      throw err;
    });
  }
  return etherealTransporterPromise;
}

function buildResetMessage(to, resetUrl) {
  const text = [
    'Здравствуйте!',
    '',
    'Вы запросили восстановление пароля в сервисе «Межгород Экспресс».',
    'Чтобы задать новый пароль, перейдите по ссылке:',
    resetUrl,
    '',
    'Ссылка действует 1 час. Если вы не запрашивали восстановление, просто проигнорируйте письмо.',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a;">
      <div style="background: #2563eb; padding: 24px; border-radius: 12px 12px 0 0; color: #fff;">
        <h1 style="margin: 0; font-size: 20px;">Межгород Экспресс</h1>
      </div>
      <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <h2 style="margin-top: 0; font-size: 18px;">Восстановление пароля</h2>
        <p>Вы запросили восстановление доступа к аккаунту <strong>${to}</strong>.</p>
        <p>Чтобы задать новый пароль, нажмите на кнопку:</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${resetUrl}"
             style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none;
                    padding: 12px 24px; border-radius: 8px; font-weight: bold;">
            Сбросить пароль
          </a>
        </p>
        <p style="font-size: 13px; color: #64748b;">
          Или скопируйте ссылку в браузер:<br>
          <a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a>
        </p>
        <p style="font-size: 13px; color: #64748b;">
          Ссылка действует 1 час. Если вы не запрашивали восстановление — просто проигнорируйте это письмо.
        </p>
      </div>
    </div>
  `;

  return { text, html };
}

/**
 * Отправить письмо через выбранный транспорт.
 * @returns {{ messageId?: string, transport: string, previewUrl?: string|null }}
 */
async function deliver({ to, subject, text, html }) {
  const transport = getMailTransportName();

  if (transport === 'resend') {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: config.mail.from,
      to,
      subject,
      text,
      html,
    });
    if (error) {
      throw new Error(`Resend error: ${error.message || JSON.stringify(error)}`);
    }
    logger.info('Email sent via Resend', { to, id: data?.id });
    return { messageId: data?.id, transport };
  }

  if (transport === 'smtp') {
    const transporter = await getSmtpTransporter();
    const info = await transporter.sendMail({ from: config.mail.from, to, subject, text, html });
    logger.info('Email sent via SMTP', { to, messageId: info.messageId });
    return { messageId: info.messageId, transport };
  }

  if (transport === 'ethereal') {
    const transporter = await getEtherealTransporter();
    const info = await transporter.sendMail({ from: config.mail.from, to, subject, text, html });
    const previewUrl = nodemailer.getTestMessageUrl(info) || null;
    logger.info('Email sent to Ethereal test inbox', { to, messageId: info.messageId, previewUrl });
    return { messageId: info.messageId, transport, previewUrl };
  }

  throw new Error(
    'Почта не настроена. Задайте RESEND_API_KEY (Resend) или SMTP_HOST/SMTP_USER/SMTP_PASS и MAIL_FROM.'
  );
}

/**
 * Отправить письмо со ссылкой для сброса пароля.
 * @param {string} to  адрес получателя
 * @param {string} resetToken  одноразовый токен из таблицы password_resets
 */
export async function sendPasswordResetEmail(to, resetToken) {
  const resetUrl = `${config.appUrl}/?reset=${encodeURIComponent(resetToken)}`;
  const { text, html } = buildResetMessage(to, resetUrl);

  const result = await deliver({
    to,
    subject: 'Восстановление пароля — Межгород Экспресс',
    text,
    html,
  });

  logger.info('Password reset email sent', { to, transport: result.transport, messageId: result.messageId });

  return { ...result, resetUrl };
}

/**
 * Проверка доступности почтового транспорта (можно вызывать при старте).
 */
export async function verifyMailer() {
  try {
    const transport = getMailTransportName();
    if (transport === 'resend') {
      // Resend проверяется фактической отправкой; здесь лишь фиксируем, что ключ задан
      logger.info('Mail transport: Resend (API key is set)');
      return true;
    }
    if (transport === 'smtp') {
      await getSmtpTransporter();
      return true;
    }
    if (transport === 'ethereal') {
      await getEtherealTransporter();
      return true;
    }
    return false;
  } catch (err) {
    logger.error('Mail transporter verification failed', { error: err.message });
    return false;
  }
}
