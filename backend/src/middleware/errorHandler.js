import { AppError } from '../errors/appErrors.js';
import { logger } from '../utils/logger.js';

export function errorHandler(err, req, res, next) {
  const requestId = req.headers['x-request-id'] || 'no-request-id';
  const path = req.originalUrl || req.url;

  // Operational error known to application
  if (err instanceof AppError) {
    logger.warn('Operational HTTP error', {
      requestId,
      status: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details,
      path,
    });

    return res.status(err.statusCode).json({
      success: false,
      error: {
        status: err.statusCode,
        code: err.code,
        message: err.message,
        details: err.details,
        path,
        timestamp: new Date().toISOString(),
        requestId,
      },
    });
  }

  // Multer error handling (e.g. file too large, invalid field)
  if (err.name === 'MulterError') {
    logger.warn('Multer upload error', {
      requestId,
      code: err.code,
      message: err.message,
      path,
    });

    return res.status(400).json({
      success: false,
      error: {
        status: 400,
        code: 'UPLOAD_ERROR',
        message: `Ошибка загрузки файла: ${err.message}`,
        details: err.code,
        path,
        timestamp: new Date().toISOString(),
        requestId,
      },
    });
  }

  // Unexpected internal server error
  logger.error('Unhandled internal server error', {
    requestId,
    name: err.name,
    message: err.message,
    stack: err.stack,
    path,
  });

  return res.status(500).json({
    success: false,
    error: {
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Внутренняя ошибка сервера. Пожалуйста, повторите попытку позже.',
      details: process.env.NODE_ENV === 'development' ? err.message : null,
      path,
      timestamp: new Date().toISOString(),
      requestId,
    },
  });
}
