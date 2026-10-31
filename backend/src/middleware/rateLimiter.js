import { AppError } from '../errors/appErrors.js';
import { logger } from '../utils/logger.js';

class TooManyRequestsError extends AppError {
  constructor(message = 'Слишком много неверных попыток входа. Попробуйте позже.', retryAfterSeconds = 900) {
    super(message, 429, 'TOO_MANY_REQUESTS', { retryAfterSeconds });
  }
}

// In-memory store for tracking failed login attempts
// key: `${ip}_${email}` -> { count, lockUntil }
const loginAttempts = new Map();

const MAX_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes lock out

export const loginBruteForceProtection = {
  checkLimit: (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    const email = (req.body?.email || '').toLowerCase().trim();
    const key = `${ip}:${email}`;

    const record = loginAttempts.get(key);

    if (record && record.lockUntil && record.lockUntil > Date.now()) {
      const remainingSeconds = Math.ceil((record.lockUntil - Date.now()) / 1000);
      logger.warn('Brute force attack blocked', {
        requestId: req.requestId,
        ip,
        email,
        attempts: record.count,
        lockoutSeconds: remainingSeconds,
      });

      res.setHeader('Retry-After', remainingSeconds);
      return next(new TooManyRequestsError(
        `Превышено количество попыток входа. Учетная запись временно заблокирована на ${Math.ceil(remainingSeconds / 60)} мин.`,
        remainingSeconds
      ));
    }

    next();
  },

  recordFailure: (ip, email) => {
    const normalizedEmail = (email || '').toLowerCase().trim();
    const key = `${ip}:${normalizedEmail}`;
    const now = Date.now();

    let record = loginAttempts.get(key);
    if (!record || (record.lockUntil && record.lockUntil <= now)) {
      record = { count: 0, lockUntil: null };
    }

    record.count += 1;
    if (record.count >= MAX_ATTEMPTS) {
      record.lockUntil = now + LOCK_TIME_MS;
      logger.warn('Account locked due to brute force attempts', {
        ip,
        email: normalizedEmail,
        failedAttempts: record.count,
        lockedUntil: new Date(record.lockUntil).toISOString(),
      });
    }

    loginAttempts.set(key, record);
  },

  resetAttempts: (ip, email) => {
    const normalizedEmail = (email || '').toLowerCase().trim();
    const key = `${ip}:${normalizedEmail}`;
    loginAttempts.delete(key);
  },

  clearAll: () => {
    loginAttempts.clear();
  }
};
