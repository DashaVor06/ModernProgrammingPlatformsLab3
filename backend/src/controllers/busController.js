import { z } from 'zod';
import { query } from '../db/db.js';
import { NotFoundError, BadRequestError } from '../errors/appErrors.js';
import { logger } from '../utils/logger.js';
import { assertCarrierAccess } from '../utils/ownership.js';

export const createBusSchema = z.object({
  carrierId: z.coerce.number().int().positive('ID перевозчика должен быть положительным числом'),
  plateNumber: z.string().min(3, 'Госномер должен содержать минимум 3 символа'),
  model: z.string().min(2, 'Модель автобуса должна содержать минимум 2 символа'),
  capacity: z.coerce.number().int().min(4, 'Вместимость должна быть не менее 4 мест').max(100, 'Вместимость не более 100 мест'),
  features: z.union([z.array(z.string()), z.string()]).optional().default([]),
});

export const updateBusSchema = createBusSchema.partial();

export async function listBuses(req, res, next) {
  try {
    const { carrierId } = req.query;
    let sql = `
      SELECT b.*, c.name as carrier_name
      FROM buses b
      JOIN carriers c ON c.id = b.carrier_id
    `;
    const params = [];

    if (carrierId) {
      sql += ' WHERE b.carrier_id = $1';
      params.push(parseInt(carrierId, 10));
    }

    sql += ' ORDER BY b.id ASC';

    const result = await query(sql, params);
    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
}

export async function getBusById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new BadRequestError('ID автобуса должен быть числом');
    }

    const busRes = await query(`
      SELECT b.*, c.name as carrier_name
      FROM buses b
      JOIN carriers c ON c.id = b.carrier_id
      WHERE b.id = $1
    `, [id]);

    if (busRes.rowCount === 0) {
      throw new NotFoundError(`Автобус с ID ${id} не найден`);
    }

    return res.status(200).json({
      success: true,
      data: busRes.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

export async function createBus(req, res, next) {
  try {
    const { carrierId, plateNumber, model, capacity } = req.body;
    let { features } = req.body;

    // Handle features if passed as JSON string or comma-separated
    if (typeof features === 'string') {
      try {
        features = JSON.parse(features);
      } catch {
        features = features.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    if (!Array.isArray(features)) {
      features = ['Кондиционер', 'Wi-Fi'];
    }

    let photoUrl = null;
    if (req.file) {
      photoUrl = `/uploads/${req.file.filename}`;
    }

    // Verify carrier exists
    const carrierCheck = await query('SELECT id FROM carriers WHERE id = $1', [carrierId]);
    if (carrierCheck.rowCount === 0) {
      throw new NotFoundError(`Перевозчик с ID ${carrierId} не существует`);
    }

    // RBAC: перевозчик может добавлять автобусы только своему перевозчику
    await assertCarrierAccess(req, carrierId);

    const result = await query(`
      INSERT INTO buses (carrier_id, plate_number, model, capacity, features, photo_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `, [carrierId, plateNumber, model, capacity, features, photoUrl]);

    logger.info('Bus created', { busId: result.rows[0].id, model, plateNumber });

    return res.status(201).json({
      success: true,
      message: 'Автобус успешно добавлен в автопарк',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

export async function updateBus(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new BadRequestError('ID автобуса должен быть числом');
    }

    const existingRes = await query('SELECT * FROM buses WHERE id = $1', [id]);
    if (existingRes.rowCount === 0) {
      throw new NotFoundError(`Автобус с ID ${id} не найден`);
    }

    const current = existingRes.rows[0];
    const { carrierId, plateNumber, model, capacity } = req.body;
    let { features } = req.body;

    // RBAC: перевозчик может редактировать только свои автобусы
    await assertCarrierAccess(req, current.carrier_id);
    if (carrierId && Number(carrierId) !== Number(current.carrier_id)) {
      await assertCarrierAccess(req, carrierId);
    }

    if (features !== undefined) {
      if (typeof features === 'string') {
        try {
          features = JSON.parse(features);
        } catch {
          features = features.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
    } else {
      features = current.features;
    }

    let photoUrl = current.photo_url;
    if (req.file) {
      photoUrl = `/uploads/${req.file.filename}`;
    }

    const result = await query(`
      UPDATE buses
      SET 
        carrier_id = COALESCE($1, carrier_id),
        plate_number = COALESCE($2, plate_number),
        model = COALESCE($3, model),
        capacity = COALESCE($4, capacity),
        features = $5,
        photo_url = COALESCE($6, photo_url)
      WHERE id = $7
      RETURNING *;
    `, [carrierId, plateNumber, model, capacity, features, photoUrl, id]);

    return res.status(200).json({
      success: true,
      message: 'Данные автобуса успешно обновлены',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteBus(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new BadRequestError('ID автобуса должен быть числом');
    }

    const existingRes = await query('SELECT carrier_id FROM buses WHERE id = $1', [id]);
    if (existingRes.rowCount === 0) {
      throw new NotFoundError(`Автобус с ID ${id} не найден`);
    }

    // RBAC: перевозчик может удалять только свои автобусы
    await assertCarrierAccess(req, existingRes.rows[0].carrier_id);

    const deleteRes = await query('DELETE FROM buses WHERE id = $1 RETURNING id, model, plate_number', [id]);

    logger.info('Bus deleted', { busId: id });

    return res.status(200).json({
      success: true,
      message: `Автобус ${deleteRes.rows[0].model} (${deleteRes.rows[0].plate_number}) успешно удален`,
      data: { id },
    });
  } catch (error) {
    next(error);
  }
}
