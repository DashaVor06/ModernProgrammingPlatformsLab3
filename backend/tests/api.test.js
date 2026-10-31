import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool } from '../src/db/db.js';
import { initializeDatabase } from '../src/db/initDb.js';

// Seeded demo credentials (see src/db/seedData.js) — password for all: password123
const USERS = {
  ADMIN: 'admin@bus.by',
  CARRIER: 'carrier@atlas.by',
  PASSENGER: 'passenger@example.com',
};

async function loginAs(email) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'password123' });
  assert.equal(res.statusCode, 200, `Login should succeed for ${email}`);
  return res.body.data.accessToken;
}

describe('Bus Aggregator REST API Tests', () => {
  let adminToken;
  let carrierToken;
  let passengerToken;
  let createdTripId;
  let createdBookingId;
  let testCarrierId;
  let testBusId;

  before(async () => {
    await initializeDatabase();

    // Get an existing carrier and bus for tests
    const carrierRes = await pool.query('SELECT id FROM carriers LIMIT 1');
    testCarrierId = carrierRes.rows[0].id;
    const busRes = await pool.query('SELECT id FROM buses WHERE carrier_id = $1 LIMIT 1', [testCarrierId]);
    testBusId = busRes.rows[0].id;

    // Authenticate as each role to exercise the RBAC model (temporary JWT keys)
    adminToken = await loginAs(USERS.ADMIN);
    carrierToken = await loginAs(USERS.CARRIER);
    passengerToken = await loginAs(USERS.PASSENGER);
  });

  after(async () => {
    // Clean up created entities
    if (createdBookingId) {
      await pool.query('DELETE FROM bookings WHERE id = $1', [createdBookingId]);
    }
    if (createdTripId) {
      await pool.query('DELETE FROM trips WHERE id = $1', [createdTripId]);
    }
    await pool.end();
  });

  it('GET /api/health - should return UP status', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'UP');
  });

  it('GET /api/trips - should list trips publicly', async () => {
    const res = await request(app).get('/api/trips');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length > 0);

    const trip = res.body.data[0];
    assert.ok(trip.origin_city);
    assert.ok(trip.destination_city);
    assert.ok(trip.bus_capacity > 0);
    assert.ok(Array.isArray(trip.occupied_seats));
  });

  it('POST /api/trips - should return 401 without a token', async () => {
    const res = await request(app).post('/api/trips').send({});
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
  });

  it('POST /api/trips - should return 403 for PASSENGER (insufficient role)', async () => {
    const res = await request(app)
      .post('/api/trips')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send({});
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  it('POST /api/trips - should create a new trip as ADMIN (CRUD: Create)', async () => {
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    const arrival = new Date(tomorrow.getTime() + 4 * 3600 * 1000);

    const newTrip = {
      carrierId: testCarrierId,
      busId: testBusId,
      originCity: 'Минск',
      destinationCity: 'Полоцк',
      departureStation: 'АВ Центральный',
      arrivalStation: 'АВ Полоцк',
      departureTime: tomorrow.toISOString(),
      arrivalTime: arrival.toISOString(),
      price: 26.50,
      status: 'SCHEDULED',
    };

    const res = await request(app)
      .post('/api/trips')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(newTrip);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.destination_city, 'Полоцк');
    createdTripId = res.body.data.id;
  });

  it('POST /api/trips - should return 400 when validation fails', async () => {
    const invalidTrip = {
      carrierId: testCarrierId,
      busId: testBusId,
      originCity: 'М',
      destinationCity: '',
      departureTime: 'invalid-date',
      arrivalTime: 'invalid-date',
      price: -10,
    };

    const res = await request(app)
      .post('/api/trips')
      .set('Authorization', `Bearer ${carrierToken}`)
      .send(invalidTrip);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(Array.isArray(res.body.error.details));
  });

  it('PUT /api/trips/:id - should update trip as CARRIER (CRUD: Update)', async () => {
    const res = await request(app)
      .put(`/api/trips/${createdTripId}`)
      .set('Authorization', `Bearer ${carrierToken}`)
      .send({ price: 28.00 });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(parseFloat(res.body.data.price), 28.00);
  });

  it('GET /api/bookings - should return 401 without a token', async () => {
    const res = await request(app).get('/api/bookings');
    assert.equal(res.statusCode, 401);
  });

  it('POST /api/bookings - should create booking for a free seat as PASSENGER', async () => {
    const bookingPayload = {
      tripId: createdTripId,
      seatNumber: 5,
      passengerName: 'Тестовый Пассажир',
      passengerPhone: '+375 (29) 999-88-77',
      passengerEmail: 'test@passenger.by',
    };

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send(bookingPayload);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.seat_number, 5);
    createdBookingId = res.body.data.id;
  });

  it('POST /api/bookings - should return 409 on double-booking the same seat', async () => {
    const duplicateBookingPayload = {
      tripId: createdTripId,
      seatNumber: 5,
      passengerName: 'Другой Пассажир',
      passengerPhone: '+375 (29) 111-11-11',
      passengerEmail: 'other@passenger.by',
    };

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${passengerToken}`)
      .send(duplicateBookingPayload);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'CONFLICT');
  });

  it('GET /api/bookings - PASSENGER sees only their own bookings', async () => {
    const res = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${passengerToken}`);

    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.some((b) => b.id === createdBookingId));
  });

  it('DELETE /api/bookings/:id - should cancel booking (CRUD: Delete)', async () => {
    const res = await request(app)
      .delete(`/api/bookings/${createdBookingId}`)
      .set('Authorization', `Bearer ${passengerToken}`);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    createdBookingId = null;
  });

  it('GET /api/carriers - should return list of carriers publicly', async () => {
    const res = await request(app).get('/api/carriers');
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.data.length > 0);
  });

  it('DELETE /api/trips/:id - should delete trip as ADMIN (CRUD: Delete)', async () => {
    const res = await request(app)
      .delete(`/api/trips/${createdTripId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    createdTripId = null;
  });

  it('GET /api/trips/999999 - should return 404 Not Found', async () => {
    const res = await request(app).get('/api/trips/999999');
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);
  });
});
