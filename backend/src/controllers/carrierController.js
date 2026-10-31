import { z } from 'zod';
import { query } from '../db/db.js';
import { NotFoundError, BadRequestError } from '../errors/appErrors.js';
import { logger } from '../utils/logger.js';

export const createCarrierSchema = z.object({
  name: z.string().min(2, 'Название перевозчика должно быть не менее 2 символов'),
  description: z.string().optional().default(''),
  phone: z.string().min(5, 'Укажите контактный номер телефона'),
  email: z.string().email('Некорректный контактный email'),
  rating: z.coerce.number().min(1).max(5).optional().default(4.8),
  licenseNumber: z.string().optional().default(''),
  ownerId: z.coerce.number().optional().nullable(),
});

export const updateCarrierSchema = createCarrierSchema.partial();

export async function listCarriers(req, res, next) {
  try {
    const result = await query(`
      SELECT 
        c.*,
        COUNT(DISTINCT b.id) AS buses_count,
        COUNT(DISTINCT t.id) AS trips_count
      FROM carriers c
      LEFT JOIN buses b ON b.carrier_id = c.id
      LEFT JOIN trips t ON t.carrier_id = c.id
      GROUP BY c.id
      ORDER BY c.rating DESC, c.id ASC
    `);

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCarrierById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new BadRequestError('ID перевозчика должен быть целым числом');
    }

    const carrierRes = await query('SELECT * FROM carriers WHERE id = $1', [id]);
    if (carrierRes.rowCount === 0) {
      throw new NotFoundError(`Перевозчик с ID ${id} не найден`);
    }

    const carrier = carrierRes.rows[0];

    // Fetch carrier buses
    const busesRes = await query('SELECT * FROM buses WHERE carrier_id = $1 ORDER BY id ASC', [id]);
    carrier.buses = busesRes.rows;

    // Fetch upcoming trips
    const tripsRes = await query(`
      SELECT t.*, b.model as bus_model, b.capacity as bus_capacity
      FROM trips t
      JOIN buses b ON b.id = t.bus_id
      WHERE t.carrier_id = $1
      ORDER BY t.departure_time ASC
    `, [id]);
    carrier.trips = tripsRes.rows;

    return res.status(200).json({
      success: true,
      data: carrier,
    });
  } catch (error) {
    next(error);
  }
}

export async function createCarrier(req, res, next) {
  try {
    const { name, description, phone, email, rating, licenseNumber, ownerId } = req.body;
    
    // File from multipart/form-data if provided
    let logoUrl = null;
    let licenseFileUrl = null;

    if (req.files) {
      if (req.files['logo'] && req.files['logo'][0]) {
        logoUrl = `/uploads/${req.files['logo'][0].filename}`;
      }
      if (req.files['license'] && req.files['license'][0]) {
        licenseFileUrl = `/uploads/${req.files['license'][0].filename}`;
      }
    } else if (req.file) {
      logoUrl = `/uploads/${req.file.filename}`;
    }

    const result = await query(`
      INSERT INTO carriers (name, description, phone, email, rating, logo_url, license_number, license_file_url, owner_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `, [name, description || '', phone, email, rating || 4.8, logoUrl, licenseNumber || null, licenseFileUrl, ownerId || null]);

    logger.info('Carrier created', { carrierId: result.rows[0].id, name });

    return res.status(201).json({
      success: true,
      message: 'Перевозчик успешно добавлен',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCarrier(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new BadRequestError('ID перевозчика должен быть целым числом');
    }

    const existingRes = await query('SELECT * FROM carriers WHERE id = $1', [id]);
    if (existingRes.rowCount === 0) {
      throw new NotFoundError(`Перевозчик с ID ${id} не найден`);
    }

    const current = existingRes.rows[0];
    const { name, description, phone, email, rating, licenseNumber } = req.body;

    let logoUrl = current.logo_url;
    if (req.files && req.files['logo'] && req.files['logo'][0]) {
      logoUrl = `/uploads/${req.files['logo'][0].filename}`;
    } else if (req.file) {
      logoUrl = `/uploads/${req.file.filename}`;
    }

    const result = await query(`
      UPDATE carriers
      SET 
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        phone = COALESCE($3, phone),
        email = COALESCE($4, email),
        rating = COALESCE($5, rating),
        logo_url = COALESCE($6, logo_url),
        license_number = COALESCE($7, license_number),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *;
    `, [name, description, phone, email, rating, logoUrl, licenseNumber, id]);

    return res.status(200).json({
      success: true,
      message: 'Информация о перевозчике успешно обновлена',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteCarrier(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new BadRequestError('ID перевозчика должен быть целым числом');
    }

    const deleteRes = await query('DELETE FROM carriers WHERE id = $1 RETURNING id, name', [id]);
    if (deleteRes.rowCount === 0) {
      throw new NotFoundError(`Перевозчик с ID ${id} не найден`);
    }

    logger.info('Carrier deleted', { carrierId: id });

    return res.status(200).json({
      success: true,
      message: `Перевозчик «${deleteRes.rows[0].name}» успешно удален`,
      data: { id },
    });
  } catch (error) {
    next(error);
  }
}
