import { z } from 'zod';
import { query, withTransaction } from '../db/db.js';
import { NotFoundError, BadRequestError, ConflictError, ForbiddenError } from '../errors/appErrors.js';
import { logger } from '../utils/logger.js';

export const createBookingSchema = z.object({
  tripId: z.coerce.number().int().positive('ID рейса обязателен'),
  seatNumber: z.coerce.number().int().positive('Номер места должен быть больше нуля'),
  passengerName: z.string().min(2, 'Укажите ФИО пассажира'),
  passengerPhone: z.string().min(5, 'Укажите контактный номер телефона'),
  passengerEmail: z.string().email('Некорректный email для отправки электронного билета'),
  userId: z.coerce.number().int().optional().nullable(),
});

export const updateBookingSchema = z.object({
  passengerName: z.string().min(2).optional(),
  passengerPhone: z.string().min(5).optional(),
  passengerEmail: z.string().email().optional(),
  status: z.enum(['CONFIRMED', 'CANCELLED']).optional(),
});

export async function listBookings(req, res, next) {
  try {
    const { tripId, userId, email, status } = req.query;

    // RBAC: non-admin users may only list their own bookings
    const effectiveUserId = req.user && req.user.role !== 'ADMIN' ? req.user.id : userId;

    let sql = `
      SELECT 
        bk.*,
        t.origin_city,
        t.destination_city,
        t.departure_station,
        t.arrival_station,
        t.departure_time,
        t.arrival_time,
        t.price as trip_price,
        c.name as carrier_name,
        c.phone as carrier_phone,
        b.model as bus_model,
        b.plate_number as bus_plate_number
      FROM bookings bk
      JOIN trips t ON t.id = bk.trip_id
      JOIN carriers c ON c.id = t.carrier_id
      JOIN buses b ON b.id = t.bus_id
      WHERE 1=1
    `;
    const params = [];

    if (tripId) {
      params.push(parseInt(tripId, 10));
      sql += ` AND bk.trip_id = $${params.length}`;
    }

    if (effectiveUserId) {
      params.push(parseInt(effectiveUserId, 10));
      sql += ` AND bk.user_id = $${params.length}`;
    }

    if (email) {
      params.push(email.trim());
      sql += ` AND bk.passenger_email ILIKE $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND bk.status = $${params.length}`;
    }

    sql += ' ORDER BY bk.booked_at DESC';

    const result = await query(sql, params);
    return res.status(200).json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    next(error);
  }
}

export async function getBookingById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new BadRequestError('ID бронирования должен быть числом');
    }

    const sql = `
      SELECT 
        bk.*,
        t.origin_city,
        t.destination_city,
        t.departure_station,
        t.arrival_station,
        t.departure_time,
        t.arrival_time,
        c.name as carrier_name,
        c.phone as carrier_phone,
        b.model as bus_model,
        b.plate_number as bus_plate_number
      FROM bookings bk
      JOIN trips t ON t.id = bk.trip_id
      JOIN carriers c ON c.id = t.carrier_id
      JOIN buses b ON b.id = t.bus_id
      WHERE bk.id = $1
    `;

    const result = await query(sql, [id]);
    if (result.rowCount === 0) {
      throw new NotFoundError(`Бронирование с ID ${id} не найдено`);
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Create booking with concurrency protection and atomic transaction
 */
export async function createBooking(req, res, next) {
  try {
    // RBAC: перевозчик (и другие служебные роли) не бронируют билеты — это делает пассажир
    if (req.user?.role === 'CARRIER') {
      throw new ForbiddenError('Перевозчик не может бронировать билеты');
    }

    const { tripId, seatNumber, passengerName, passengerPhone, passengerEmail, userId } = req.body;
    // The booking belongs to the authenticated user (unless an Admin passes an explicit userId)
    const effectiveUserId = req.user ? req.user.id : (userId || null);

    let docFileUrl = null;
    if (req.file) {
      docFileUrl = `/uploads/${req.file.filename}`;
    }

    // Execute within atomic transaction with row locking
    const booking = await withTransaction(async (client) => {
      // 1. Verify trip exists and lock trip row
      const tripRes = await client.query(`
        SELECT t.*, b.capacity
        FROM trips t
        JOIN buses b ON b.id = t.bus_id
        WHERE t.id = $1
        FOR UPDATE
      `, [tripId]);

      if (tripRes.rowCount === 0) {
        throw new NotFoundError(`Рейс с ID ${tripId} не найден`);
      }

      const trip = tripRes.rows[0];

      if (trip.status === 'CANCELLED') {
        throw new BadRequestError('Рейс отменен, бронирование невозможно');
      }

      if (seatNumber < 1 || seatNumber > trip.capacity) {
        throw new BadRequestError(`Недопустимый номер места: ${seatNumber}. В автобусе доступно мест: от 1 до ${trip.capacity}.`);
      }

      // 2. Check if seat is already occupied (optimistic concurrency & lock)
      const seatCheckRes = await client.query(`
        SELECT id FROM bookings 
        WHERE trip_id = $1 AND seat_number = $2 AND status = 'CONFIRMED'
        FOR UPDATE
      `, [tripId, seatNumber]);

      if (seatCheckRes.rowCount > 0) {
        throw new ConflictError(`Место №${seatNumber} уже забронировано другим пассажиром. Пожалуйста, выберите другое свободное место.`);
      }

      // 3. Insert booking
      const insertRes = await client.query(`
        INSERT INTO bookings (
          trip_id, user_id, seat_number, passenger_name, 
          passenger_phone, passenger_email, doc_file_url, status, total_price
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'CONFIRMED', $8)
        RETURNING *;
      `, [
        tripId,
        effectiveUserId,
        seatNumber,
        passengerName,
        passengerPhone,
        passengerEmail,
        docFileUrl,
        trip.price,
      ]);

      return insertRes.rows[0];
    });

    logger.info('Booking confirmed', {
      bookingId: booking.id,
      tripId,
      seatNumber,
      passengerEmail,
    });

    return res.status(201).json({
      success: true,
      message: `Билет на место №${seatNumber} успешно забронирован!`,
      data: booking,
    });
  } catch (error) {
    if (error.code === '23505') { // PostgreSQL unique violation
      return next(new ConflictError(`Место №${req.body.seatNumber} уже занято. Пожалуйста, выберите другое место.`));
    }
    next(error);
  }
}

export async function updateBooking(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new BadRequestError('ID бронирования должен быть числом');
    }

    const { passengerName, passengerPhone, passengerEmail, status } = req.body;

    const result = await query(`
      UPDATE bookings
      SET
        passenger_name = COALESCE($1, passenger_name),
        passenger_phone = COALESCE($2, passenger_phone),
        passenger_email = COALESCE($3, passenger_email),
        status = COALESCE($4, status)
      WHERE id = $5
      RETURNING *;
    `, [passengerName, passengerPhone, passengerEmail, status, id]);

    if (result.rowCount === 0) {
      throw new NotFoundError(`Бронирование с ID ${id} не найдено`);
    }

    return res.status(200).json({
      success: true,
      message: 'Бронирование успешно обновлено',
      data: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteBooking(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      throw new BadRequestError('ID бронирования должен быть числом');
    }

    const deleteRes = await query('DELETE FROM bookings WHERE id = $1 RETURNING id, seat_number, trip_id', [id]);
    if (deleteRes.rowCount === 0) {
      throw new NotFoundError(`Бронирование с ID ${id} не найдено`);
    }

    logger.info('Booking cancelled/deleted', { bookingId: id });

    return res.status(200).json({
      success: true,
      message: `Бронирование места №${deleteRes.rows[0].seat_number} успешно отменено`,
      data: { id },
    });
  } catch (error) {
    next(error);
  }
}
