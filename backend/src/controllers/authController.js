import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../db/db.js';
import { config } from '../config/index.js';
import { BadRequestError, UnauthorizedError, NotFoundError, ValidationError } from '../errors/appErrors.js';
import { logger } from '../utils/logger.js';
import { sendPasswordResetEmail } from '../utils/mailer.js';
import { loginBruteForceProtection } from '../middleware/rateLimiter.js';

function generateAccessToken(user, sessionId) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId,
    },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiresIn }
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

/** id перевозчиков, которыми владеет пользователь (для ролей CARRIER). */
async function loadCarrierIds(userId) {
  const res = await query('SELECT id FROM carriers WHERE owner_id = $1', [userId]);
  return res.rows.map((row) => row.id);
}

export const authController = {
  // Register a new user
  register: async (req, res, next) => {
    try {
      const { email, password, name, phone } = req.body;

      if (!email || !password || !name) {
        throw new ValidationError('Необходимо заполнить обязательные поля: email, пароль, имя');
      }

      // Check if user exists
      const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
      if (existing.rows.length > 0) {
        throw new BadRequestError('Пользователь с таким email уже зарегистрирован');
      }

      // Public self-registration may only create PASSENGER accounts;
      // ADMIN/CARRIER accounts are provisioned by an administrator (see seedData.js).
      const assignedRole = 'PASSENGER';
      const passwordHash = await bcrypt.hash(password, 10);

      const result = await query(
        `INSERT INTO users (email, password_hash, name, phone, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, name, phone, role, created_at`,
        [email.toLowerCase().trim(), passwordHash, name, phone || null, assignedRole]
      );

      const user = result.rows[0];

      logger.info('New user registered', { requestId: req.requestId, userId: user.id, email: user.email, role: user.role });

      res.status(201).json({
        success: true,
        data: user,
      });
    } catch (err) {
      next(err);
    }
  },

  // Login user and create session
  login: async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
      const userAgent = req.get('user-agent') || 'unknown';

      if (!email || !password) {
        throw new BadRequestError('Укажите email и пароль');
      }

      const normalizedEmail = email.toLowerCase().trim();

      const userRes = await query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
      if (userRes.rows.length === 0) {
        loginBruteForceProtection.recordFailure(ip, normalizedEmail);
        logger.warn('Login failed: user not found', { requestId: req.requestId, email: normalizedEmail, ip });
        throw new UnauthorizedError('Неверный email или пароль');
      }

      const user = userRes.rows[0];
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        loginBruteForceProtection.recordFailure(ip, normalizedEmail);
        logger.warn('Login failed: invalid password', { requestId: req.requestId, userId: user.id, ip });
        throw new UnauthorizedError('Неверный email или пароль');
      }

      // Reset brute force attempts on successful login
      loginBruteForceProtection.resetAttempts(ip, normalizedEmail);

      // Create session
      const sessionId = crypto.randomUUID();
      const refreshToken = generateRefreshToken();
      const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
      
      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 days

      await query(
        `INSERT INTO active_sessions (id, user_id, refresh_token_hash, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sessionId, user.id, refreshTokenHash, ip, userAgent, expiresAt]
      );

      const accessToken = generateAccessToken(user, sessionId);
      const carrierIds = await loadCarrierIds(user.id);

      logger.info('User logged in successfully', { requestId: req.requestId, userId: user.id, sessionId, ip });

      res.status(200).json({
        success: true,
        data: {
          accessToken,
          refreshToken,
          sessionId,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            phone: user.phone,
            role: user.role,
            carrierIds,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // Refresh access token
  refreshToken: async (req, res, next) => {
    try {
      const { refreshToken, sessionId } = req.body;
      if (!refreshToken || !sessionId) {
        throw new BadRequestError('Требуется refresh token и sessionId');
      }

      const sessionRes = await query('SELECT * FROM active_sessions WHERE id = $1 AND is_revoked = FALSE', [sessionId]);
      if (sessionRes.rows.length === 0) {
        throw new UnauthorizedError('Сессия не найдена или была завершена');
      }

      const session = sessionRes.rows[0];
      if (new Date(session.expires_at) < new Date()) {
        throw new UnauthorizedError('Срок действия сессии истек');
      }

      const isValidToken = await bcrypt.compare(refreshToken, session.refresh_token_hash);
      if (!isValidToken) {
        throw new UnauthorizedError('Недействительный refresh token');
      }

      const userRes = await query('SELECT * FROM users WHERE id = $1', [session.user_id]);
      if (userRes.rows.length === 0) {
        throw new NotFoundError('Пользователь не найден');
      }

      const user = userRes.rows[0];
      const newAccessToken = generateAccessToken(user, sessionId);

      // Update last active
      await query('UPDATE active_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE id = $1', [sessionId]);

      res.status(200).json({
        success: true,
        data: {
          accessToken: newAccessToken,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  // Logout: полностью удаляет текущую сессию из БД
  logout: async (req, res, next) => {
    try {
      const targetSessionId = req.body?.sessionId || req.user?.sessionId;
      if (targetSessionId) {
        // Удаляем только свою сессию (AND user_id = текущий пользователь)
        await query('DELETE FROM active_sessions WHERE id = $1 AND user_id = $2', [
          targetSessionId,
          req.user.id,
        ]);
      }

      logger.info('User logged out', { requestId: req.requestId, userId: req.user?.id });

      res.status(200).json({
        success: true,
        message: 'Сеанс успешно завершен',
      });
    } catch (err) {
      next(err);
    }
  },

  // Get current authenticated user profile
  me: async (req, res, next) => {
    try {
      const userRes = await query(
        'SELECT id, email, name, phone, role, avatar_url, created_at FROM users WHERE id = $1',
        [req.user.id]
      );
      if (userRes.rows.length === 0) {
        throw new NotFoundError('Пользователь не найден');
      }

      const carrierIds = await loadCarrierIds(req.user.id);

      res.status(200).json({
        success: true,
        data: { ...userRes.rows[0], carrierIds },
      });
    } catch (err) {
      next(err);
    }
  },

  // Update current user's personal info (name, phone, email)
  updateProfile: async (req, res, next) => {
    try {
      const { name, phone, email } = req.body;

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ValidationError('Некорректный email');
      }
      if (name !== undefined && String(name).trim().length < 2) {
        throw new ValidationError('Имя должно содержать минимум 2 символа');
      }

      let result;
      try {
        result = await query(
          `UPDATE users
           SET name = COALESCE($1, name),
               phone = COALESCE($2, phone),
               email = COALESCE($3, email),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4
           RETURNING id, email, name, phone, role, avatar_url, created_at`,
          [
            name !== undefined ? String(name).trim() : null,
            phone !== undefined ? String(phone).trim() : null,
            email ? String(email).toLowerCase().trim() : null,
            req.user.id,
          ]
        );
      } catch (dbErr) {
        if (dbErr.code === '23505') {
          throw new BadRequestError('Пользователь с таким email уже существует');
        }
        throw dbErr;
      }

      if (result.rowCount === 0) {
        throw new NotFoundError('Пользователь не найден');
      }

      const carrierIds = await loadCarrierIds(req.user.id);
      logger.info('User profile updated', { requestId: req.requestId, userId: req.user.id });

      res.status(200).json({
        success: true,
        message: 'Личная информация обновлена',
        data: { ...result.rows[0], carrierIds },
      });
    } catch (err) {
      next(err);
    }
  },

  // List active sessions for user (Active connections control)
  listSessions: async (req, res, next) => {
    try {
      const sessionsRes = await query(
        `SELECT id, ip_address, user_agent, created_at, last_active_at, expires_at, is_revoked 
         FROM active_sessions 
         WHERE user_id = $1 AND is_revoked = FALSE AND expires_at > CURRENT_TIMESTAMP
         ORDER BY last_active_at DESC`,
        [req.user.id]
      );

      res.status(200).json({
        success: true,
        data: sessionsRes.rows,
      });
    } catch (err) {
      next(err);
    }
  },

  // Terminate a specific active session (Control active connections)
  terminateSession: async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      await query(
        'UPDATE active_sessions SET is_revoked = TRUE WHERE id = $1 AND user_id = $2',
        [sessionId, req.user.id]
      );

      res.status(200).json({
        success: true,
        message: 'Сеанс успешно завершен',
      });
    } catch (err) {
      next(err);
    }
  },

  // Terminate all other sessions of the user (keep the current one active)
  terminateOtherSessions: async (req, res, next) => {
    try {
      const currentSessionId = req.user.sessionId || '';
      const result = await query(
        `UPDATE active_sessions
         SET is_revoked = TRUE
         WHERE user_id = $1 AND id <> $2 AND is_revoked = FALSE`,
        [req.user.id, currentSessionId]
      );

      logger.info('Other sessions terminated', {
        requestId: req.requestId,
        userId: req.user.id,
        revokedCount: result.rowCount,
      });

      res.status(200).json({
        success: true,
        message: 'Остальные сеансы успешно завершены',
        data: { revokedCount: result.rowCount },
      });
    } catch (err) {
      next(err);
    }
  },

  // Recover password via email (real SMTP delivery via nodemailer)
  recoverPassword: async (req, res, next) => {
    try {
      const { email } = req.body;
      if (!email) {
        throw new BadRequestError('Укажите email для восстановления доступа');
      }

      const userRes = await query('SELECT id, email, name FROM users WHERE email = $1', [email.toLowerCase().trim()]);

      // Анти-перечисление: всегда отвечаем 200, даже если email не найден
      if (userRes.rows.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'Если такой email зарегистрирован, инструкции по восстановлению отправлены.',
        });
      }

      const user = userRes.rows[0];
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await query(
        `INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)`,
        [user.id, resetToken, expiresAt]
      );

      // Отправка реального письма со ссылкой для сброса пароля
      try {
        const mail = await sendPasswordResetEmail(user.email, resetToken);
        logger.info('Password recovery email sent', {
          requestId: req.requestId,
          userId: user.id,
          email: user.email,
          messageId: mail.messageId,
          previewUrl: mail.previewUrl,
        });
      } catch (mailError) {
        // Не раскрываем получателю сбой почты (защита от перечисления пользователей)
        logger.error('Failed to send password recovery email', {
          requestId: req.requestId,
          userId: user.id,
          email: user.email,
          error: mailError.message,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Инструкции по восстановлению отправлены на электронную почту.',
      });
    } catch (err) {
      next(err);
    }
  },

  // Reset password using recovery token
  resetPassword: async (req, res, next) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) {
        throw new BadRequestError('Укажите токен восстановления и новый пароль');
      }

      const resetRes = await query(
        `SELECT * FROM password_resets WHERE token = $1 AND used = FALSE AND expires_at > CURRENT_TIMESTAMP`,
        [token]
      );

      if (resetRes.rows.length === 0) {
        throw new BadRequestError('Недействительный или просроченный токен восстановления');
      }

      const resetRecord = resetRes.rows[0];
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      await query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newPasswordHash, resetRecord.user_id]);
      await query('UPDATE password_resets SET used = TRUE WHERE id = $1', [resetRecord.id]);
      // Revoke all active sessions for security
      await query('UPDATE active_sessions SET is_revoked = TRUE WHERE user_id = $1', [resetRecord.user_id]);

      logger.info('Password successfully reset', { requestId: req.requestId, userId: resetRecord.user_id });

      res.status(200).json({
        success: true,
        message: 'Пароль успешно изменен. Пожалуйста, выполните вход с новым паролем.',
      });
    } catch (err) {
      next(err);
    }
  },

  // List all users (Admin only)
  listUsers: async (req, res, next) => {
    try {
      const usersRes = await query('SELECT id, email, name, phone, role, created_at FROM users ORDER BY id ASC');
      res.status(200).json({
        success: true,
        data: usersRes.rows,
      });
    } catch (err) {
      next(err);
    }
  }
};
