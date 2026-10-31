import { query } from '../db/db.js';
import { ForbiddenError } from '../errors/appErrors.js';

/**
 * Проверяет, принадлежит ли перевозчик пользователю (carriers.owner_id = user.id).
 */
export async function userOwnsCarrier(userId, carrierId) {
  const res = await query('SELECT 1 FROM carriers WHERE id = $1 AND owner_id = $2', [carrierId, userId]);
  return res.rowCount > 0;
}

/**
 * Разграничение прав на управление сущностями перевозчика:
 *  - ADMIN может управлять всеми;
 *  - CARRIER — только своими (carriers.owner_id = его id);
 *  - остальным запрещено.
 * @throws {ForbiddenError}
 */
export async function assertCarrierAccess(req, carrierId) {
  const role = req.user?.role;
  if (role === 'ADMIN') return;

  if (role === 'CARRIER') {
    const owns = await userOwnsCarrier(req.user.id, carrierId);
    if (owns) return;
    throw new ForbiddenError('Вы можете управлять только своими рейсами и автобусами');
  }

  throw new ForbiddenError('Недостаточно прав для этой операции');
}

/** Список id перевозчиков, принадлежащих пользователю. */
export async function getOwnedCarrierIds(userId) {
  const res = await query('SELECT id FROM carriers WHERE owner_id = $1', [userId]);
  return res.rows.map((row) => row.id);
}
