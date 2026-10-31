import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { UnauthorizedError, ForbiddenError } from '../errors/appErrors.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware to authenticate JWT access tokens (Temporary Keys)
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return next(new UnauthorizedError('Отсутствует временный ключ доступа (Authorization Bearer Token)'));
  }

  try {
    const decoded = jwt.verify(token, config.jwt.accessSecret);
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      sessionId: decoded.sessionId,
    };
    next();
  } catch (err) {
    logger.warn('Token verification failed', {
      requestId: req.requestId,
      error: err.message,
    });
    if (err.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Срок действия временного ключа истек'));
    }
    return next(new UnauthorizedError('Недействительный временный ключ доступа'));
  }
}

/**
 * Middleware to authorize specific roles (Role-Based Access Control - RBAC)
 */
export function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Требуется аутентификация'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Access denied: insufficient role permissions', {
        requestId: req.requestId,
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
        path: req.originalUrl,
      });
      return next(new ForbiddenError(`Доступ запрещен. Требуется роль: ${allowedRoles.join(', ')}`));
    }

    next();
  };
}

/**
 * Optional authentication middleware - attaches req.user if token is valid, continues if not
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (token) {
    try {
      const decoded = jwt.verify(token, config.jwt.accessSecret);
      req.user = {
        id: decoded.sub,
        email: decoded.email,
        role: decoded.role,
        sessionId: decoded.sessionId,
      };
    } catch {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}
