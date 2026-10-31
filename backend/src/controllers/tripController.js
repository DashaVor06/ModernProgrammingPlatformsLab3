import { z } from 'zod';
import { query } from '../db/db.js';
import { NotFoundError, BadRequestError } from '../errors/appErrors.js';
import { logger } from '../utils/logger.js';
import { assertCarrierAccess } from '../utils/ownership.js';

export const createTripSchema = z.object({
  carrierId: z.coerce.number().int().positive('ID перевозчика обязателен'),
  busId: z.coerce.number().int().positive('ID автобуса обязателен'),
  originCity: z.string().min(2, 'Город отправления должен быть не короче 2 символов'),
  destinationCity: z.string().min(2, 'Город прибытия должен быть не короче 2 символов'),
  departureStation: z.string().optional().default('Автовокзал Центральный'),
  arrivalStation: z.string().optional().default('Автовокзал'),
  departureTime: z.string().refine(val => !isNaN(Date.parse(val)), 'Некорректная дата и время отправления'),
  arrivalTime: z.string().refine(val => !isNaN(Date.parse(val)), 'Некорректная дата и время прибытия'),
  price: z.coerce.number().positive('Стоимость билета должна быть больше нуля'),
  status: z.enum(['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional().default('SCHEDULED'),
}).refine(data => new Date(data.arrivalTime) > new Date(data.departureTime), {
  message: 'Время прибытия должно быть позже времени отправления',
  path: ['arrivalTime'],
});

export const updateTripSchema = z.object({
  carrierId: z.coerce.number().int().positive().optional(),
  busId: z.coerce.number().int().positive().optional(),
  originCity: z.string().min(2).optional(),
  destinationCity: z.string().min(2).optional(),
  departureStation: z.string().optional(),
  arrivalStation: z.string().optional(),
  departureTime: z.string().refine(val => !isNaN(Date.parse(val)), 'Некорректная дата отправления').optional(),
  arrivalTime: z.string().refine(val => !isNaN(Date.parse(val)), 'Некорректная дата прибытия').optional(),
  price: z.coerce.number().positive().optional(),
  status: z.enum(['SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
});

export async function listTrips(req, res, next) {
  try {
    const { 
      origin, 
      destination, 
      date, 
      carrierId, 
      minPrice, 
      maxPrice, 
      sortBy = 'departure_time', 
      sortOrder = 'ASC' 
    } = req.query;

    let sql = `
      SELECT 
        t.*,
        c.name as carrier_name,
        c.rating as carrier_rating,
        c.logo_url as carrier_logo_url,
        c.phone as carrier_phone,
        b.model as bus_model,
        b.plate_number as bus_plate_number,
        b.capacity as bus_capacity,
        b.features as bus_features,
        b.photo_url as bus_photo_url,
        COUNT(DISTINCT bk.id) FILTER (WHERE bk.status = 'CONFIRMED') as booked_seats_count,
        COALESCE(
          json_agg(bk.seat_number) FILTER (WHERE bk.status = 'CONFIRMED'), 
          '[]'
        ) as occupied_seats
      FROM trips t
      JOIN carriers c ON c.id = t.carrier_id
      JOIN buses b ON b.id = t.bus_id
      LEFT JOIN bookings bk ON bk.trip_id = t.id
      WHERE 1=1
    `;
    const params = [];

    if (origin) {
      params.push(`%${origin.trim()}%`);
      sql += ` AND t.origin_city ILIKE $${params.length}`;
    }

    if (destination) {
      params.push(`%${destination.trim()}%`);
      sql += ` AND t.destination_city ILIKE $${params.length}`;
    }

    if (date) {
      // Filter by calendar date (YYYY-MM-DD)
      params.push(`${date}%`);
      sql += ` AND t.departure_time::text LIKE $${params.length}`;
    }

    if (carrierId) {
      params.push(parseInt(carrierId, 10));
      sql += ` AND t.carrier_id = $${params.length}`;
    }

    if (minPrice) {
      params.push(parseFloat(minPrice));
      sql += ` AND t.price >= $${params.length}`;
    }

    if (maxPrice) {
      params.push(parseFloat(maxPrice));
      sql += ` AND t.price <= $${params.length}`;
    }

    sql += ` GROUP BY t.id, c.id, b.id`;

    // Safe sorting
    const validSortCols = ['departure_time', 'price', 'carrier_rating'];
    const col = validSortCols.includes(sortBy) ? (sortBy === 'carrier_rating' ? 'c.rating' : `t.${sortBy}`) : 't.departure_time';
    const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    sql += ` ORDER BY ${col} ${order}`;

    const result = await query(sql, params);

    // Compute remaining seats
    const trips = result.rows.map(trip => {
      const bookedCount = parseInt(trip.booked_seats_count || '0', 10);
      const capacity = parseInt(trip.bus_capacity, 10);
      return {
        ...trip,
        bus_capacity: capacity,
        booked_seats_count: bookedCount,
        available_seats_count: Math.max(0, capacity - bookedCount),
        occupied_seats: trip.occupied_seats || [],
      };
    });

    return res.status(200).json({
      success: true,
      data: trips,
      count: trips.length,
    });
  } catch (error) {
    next(error);
  }
}

export async function getTripById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new BadRequestError('ID рейса должен быть числом');
    }

    const sql = `
      SELECT 
        t.*,
        c.name as carrier_name,
        c.description as carrier_description,
        c.rating as carrier_rating,
        c.logo_url as carrier_logo_url,
        c.phone as carrier_phone,
        c.email as carrier_email,
        b.model as bus_model,
        b.plate_number as bus_plate_number,
        b.capacity as bus_capacity,
        b.features as bus_features,
        b.photo_url as bus_photo_url,
        COUNT(DISTINCT bk.id) FILTER (WHERE bk.status = 'CONFIRMED') as booked_seats_count,
        COALESCE(
          json_agg(bk.seat_number) FILTER (WHERE bk.status = 'CONFIRMED'), 
          '[]'
        ) as occupied_seats
      FROM trips t
      JOIN carriers c ON c.id = t.carrier_id
      JOIN buses b ON b.id = t.bus_id
      LEFT JOIN bookings bk ON bk.trip_id = t.id
      WHERE t.id = $1
      GROUP BY t.id, c.id, b.id
    `;

    const result = await query(sql, [id]);
    if (result.rowCount === 0) {
      throw new NotFoundError(`Рейс с ID ${id} не найден`);
    }

    const trip = result.rows[0];
    const capacity = parseInt(trip.bus_capacity, 10);
    const bookedCount = parseInt(trip.booked_seats_count || '0', 10);

    return res.status(200).json({
      success: true,
      data: {
        ...trip,
        bus_capacity: capacity,
        booked_seats_count: bookedCount,
        available_seats_count: Math.max(0, capacity - bookedCount),
        occupied_seats: trip.occupied_seats || [],
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function createTrip(req, res, next) {
  try {
    const { 
      carrierId, 
      busId, 
      originCity, 
      destinationCity, 
      departureStation, 
      arrivalStation, 
      departureTime, 
      arrivalTime, 
      price, 
      status 
    } = req.body;

    // RBAC: перевозчик может создавать рейсы только для своего перевозчика
    await assertCarrierAccess(req, carrierId);

    // Проверяем, что автобус существует и принадлежит выбранному перевозчику
    const busCheck = await query('SELECT carrier_id FROM buses WHERE id = $1', [busId]);
    if (busCheck.rowCount === 0) {
      throw new NotFoundError(`Автобус с ID ${busId} не найден`);
    }
    if (Number(busCheck.rows[0].carrier_id) !== Number(carrierId)) {
      throw new BadRequestError('Выбранный автобус не принадлежит указанному перевозчику');
    }

    const result = await query(`
      INSERT INTO trips (
        carrier_id, bus_id, origin_city, destination_city, 
        departure_station, arrival_station, departure_time, arrival_time, price, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `, [
      carrierId, 
      busId, 
      originCity, 
      destinationCity, 
      departureStation || 'Автовокзал Центральный', 
      arrivalStation || 'Автовокзал', 
      departureTime, 
      arrivalTime, 
      price, 
      status || 'SCHEDULED'
    ]);

    logger.info('Trip created successfully', { tripId: result.rows[0].id, originCity, destinationCity });

    return res.status(201).json({
      success: true,
      message: 'Рейс успешно создан',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

export async function updateTrip(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new BadRequestError('ID рейса должен быть числом');
    }

    const existingRes = await query('SELECT * FROM trips WHERE id = $1', [id]);
    if (existingRes.rowCount === 0) {
      throw new NotFoundError(`Рейс с ID ${id} не найден`);
    }

    const current = existingRes.rows[0];
    const {
      carrierId,
      busId,
      originCity,
      destinationCity,
      departureStation,
      arrivalStation,
      departureTime,
      arrivalTime,
      price,
      status,
    } = req.body;

    // RBAC: перевозчик может редактировать только рейсы своего перевозчика
    await assertCarrierAccess(req, current.carrier_id);
    if (carrierId && Number(carrierId) !== Number(current.carrier_id)) {
      // перенос рейса к другому перевозчику требует прав и на него
      await assertCarrierAccess(req, carrierId);
    }

    // Если меняется автобус — он должен принадлежать итоговому перевозчику
    const targetCarrierId = carrierId || current.carrier_id;
    if (busId) {
      const busRes = await query('SELECT carrier_id FROM buses WHERE id = $1', [busId]);
      if (busRes.rowCount === 0) {
        throw new NotFoundError(`Автобус с ID ${busId} не найден`);
      }
      if (Number(busRes.rows[0].carrier_id) !== Number(targetCarrierId)) {
        throw new BadRequestError('Выбранный автобус не принадлежит указанному перевозчику');
      }
    }

    const dep = departureTime || current.departure_time;
    const arr = arrivalTime || current.arrival_time;
    if (new Date(arr) <= new Date(dep)) {
      throw new BadRequestError('Время прибытия должно быть позже времени отправления');
    }

    const result = await query(`
      UPDATE trips
      SET
        carrier_id = COALESCE($1, carrier_id),
        bus_id = COALESCE($2, bus_id),
        origin_city = COALESCE($3, origin_city),
        destination_city = COALESCE($4, destination_city),
        departure_station = COALESCE($5, departure_station),
        arrival_station = COALESCE($6, arrival_station),
        departure_time = COALESCE($7, departure_time),
        arrival_time = COALESCE($8, arrival_time),
        price = COALESCE($9, price),
        status = COALESCE($10, status)
      WHERE id = $11
      RETURNING *;
    `, [
      carrierId,
      busId,
      originCity,
      destinationCity,
      departureStation,
      arrivalStation,
      departureTime,
      arrivalTime,
      price,
      status,
      id,
    ]);

    logger.info('Trip updated', { tripId: id });

    return res.status(200).json({
      success: true,
      message: 'Данные рейса успешно обновлены',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteTrip(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new BadRequestError('ID рейса должен быть числом');
    }

    const existingRes = await query('SELECT carrier_id FROM trips WHERE id = $1', [id]);
    if (existingRes.rowCount === 0) {
      throw new NotFoundError(`Рейс с ID ${id} не найден`);
    }

    // RBAC: перевозчик может удалять только рейсы своего перевозчика
    await assertCarrierAccess(req, existingRes.rows[0].carrier_id);

    const deleteRes = await query('DELETE FROM trips WHERE id = $1 RETURNING id, origin_city, destination_city', [id]);

    logger.info('Trip deleted', { tripId: id });

    return res.status(200).json({
      success: true,
      message: `Рейс ${deleteRes.rows[0].origin_city} — ${deleteRes.rows[0].destination_city} успешно удален`,
      data: { id },
    });
  } catch (error) {
    next(error);
  }
}
