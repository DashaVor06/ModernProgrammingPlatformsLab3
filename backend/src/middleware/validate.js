import { ValidationError } from '../errors/appErrors.js';

/**
 * Zod validation middleware for Express
 * Validates req.body, req.query, or req.params
 */
export function validate({ body, query, params }) {
  return async (req, res, next) => {
    try {
      if (body) {
        req.body = await body.parseAsync(req.body);
      }
      if (query) {
        req.query = await query.parseAsync(req.query);
      }
      if (params) {
        req.params = await params.parseAsync(req.params);
      }
      next();
    } catch (error) {
      if (error.errors && Array.isArray(error.errors)) {
        const details = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        const summary = details.map(d => `${d.field ? d.field + ': ' : ''}${d.message}`).join(', ');
        return next(new ValidationError(`Ошибка валидации: ${summary}`, details));
      }
      return next(new ValidationError('Некорректные входящие данные', error.message));
    }
  };
}
