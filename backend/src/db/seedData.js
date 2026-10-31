import bcrypt from 'bcryptjs';
import { query } from './db.js';
import { logger } from '../utils/logger.js';

export async function seedDatabase() {
  logger.info('Seeding initial data...');

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Insert Users (Admin, Carrier, Passenger)
  const usersRes = await query(`
    INSERT INTO users (email, password_hash, name, phone, role)
    VALUES 
      ('admin@bus.by', $1, 'Администратор Системы', '+375 (29) 000-00-01', 'ADMIN'),
      ('carrier@atlas.by', $1, 'Диспетчер Атлас', '+375 (29) 111-22-33', 'CARRIER'),
      ('passenger@example.com', $1, 'Иван Иванов', '+375 (29) 123-45-67', 'PASSENGER')
    RETURNING id, email, role;
  `, [passwordHash]);

  const carrierUserId = usersRes.rows.find(u => u.role === 'CARRIER').id;
  const passengerUserId = usersRes.rows.find(u => u.role === 'PASSENGER').id;

  // 2. Insert Carriers
  const carriersRes = await query(`
    INSERT INTO carriers (name, description, phone, email, rating, owner_id)
    VALUES 
      ('Атлас Бас', 'Регулярные междугородние рейсы повышенной комфортности по всей Беларуси.', '+375 (29) 111-22-33', 'info@atlasbus.by', 4.90, $1),
      ('Минсктранс Экспресс', 'Государственный транспортный оператор, пунктуальность и надежность.', '+375 (17) 222-33-44', 'support@minsktrans.by', 4.75, NULL),
      ('ЕвроТранс Линия', 'Скоростные микроавтобусы с бесплатным Wi-Fi и мультимедиа.', '+375 (33) 333-44-55', 'office@eurotrans.by', 4.85, NULL)
    RETURNING id, name;
  `, [carrierUserId]);

  const atlasId = carriersRes.rows[0].id;
  const minsktransId = carriersRes.rows[1].id;
  const eurotransId = carriersRes.rows[2].id;

  // 3. Insert Buses
  const busesRes = await query(`
    INSERT INTO buses (carrier_id, plate_number, model, capacity, features)
    VALUES 
      ($1, '7788-7', 'Mercedes-Benz Sprinter 519', 19, ARRAY['Wi-Fi', 'Кондиционер', 'Розетки 220V', 'Багаж']),
      ($2, '1920-7', 'Neoplan Tourliner', 45, ARRAY['Кондиционер', 'Wi-Fi', 'Туалет', 'Мультимедиа', 'Большой багаж']),
      ($3, '4412-4', 'Volkswagen Crafter', 15, ARRAY['Кондиционер', 'USB-зарядки', 'Багаж'])
    RETURNING id, model;
  `, [atlasId, minsktransId, eurotransId]);

  const sprinterId = busesRes.rows[0].id;
  const neoplanId = busesRes.rows[1].id;
  const crafterId = busesRes.rows[2].id;

  // 4. Insert Trips (Scheduled relative to today)
  const now = new Date();
  
  function addHours(date, h) {
    const d = new Date(date);
    d.setHours(d.getHours() + h);
    return d.toISOString();
  }

  function addDays(date, days, hours = 8, minutes = 0) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    d.setHours(hours, minutes, 0, 0);
    return d;
  }

  const trip1Dep = addDays(now, 0, 9, 30);
  const trip1Arr = new Date(trip1Dep.getTime() + 4 * 3600 * 1000);

  const trip2Dep = addDays(now, 0, 14, 0);
  const trip2Arr = new Date(trip2Dep.getTime() + 4 * 3600 * 1000);

  const trip3Dep = addDays(now, 1, 8, 0);
  const trip3Arr = new Date(trip3Dep.getTime() + 4.5 * 3600 * 1000);

  const trip4Dep = addDays(now, 1, 11, 30);
  const trip4Arr = new Date(trip4Dep.getTime() + 3.5 * 3600 * 1000);

  const trip5Dep = addDays(now, 2, 16, 0);
  const trip5Arr = new Date(trip5Dep.getTime() + 4 * 3600 * 1000);

  const tripsData = [
    [atlasId, sprinterId, 'Минск', 'Гродно', 'АС Юго-Западная', 'АВ Гродно', trip1Dep.toISOString(), trip1Arr.toISOString(), 25.00, 'SCHEDULED'],
    [eurotransId, crafterId, 'Минск', 'Гродно', 'АВ Центральный', 'АВ Гродно', trip2Dep.toISOString(), trip2Arr.toISOString(), 27.00, 'SCHEDULED'],
    [minsktransId, neoplanId, 'Минск', 'Брест', 'АВ Центральный', 'АВ Брест', trip3Dep.toISOString(), trip3Arr.toISOString(), 32.00, 'SCHEDULED'],
    [atlasId, sprinterId, 'Минск', 'Витебск', 'АВ Центральный', 'АВ Витебск', trip4Dep.toISOString(), trip4Arr.toISOString(), 29.50, 'SCHEDULED'],
    [eurotransId, crafterId, 'Гродно', 'Минск', 'АВ Гродно', 'АВ Центральный', trip5Dep.toISOString(), trip5Arr.toISOString(), 25.00, 'SCHEDULED'],
  ];

  const tripIds = [];
  for (const t of tripsData) {
    const res = await query(`
      INSERT INTO trips (carrier_id, bus_id, origin_city, destination_city, departure_station, arrival_station, departure_time, arrival_time, price, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id;
    `, t);
    tripIds.push(res.rows[0].id);
  }

  const firstTripId = tripIds[0];
  const secondTripId = tripIds[1];

  // 5. Insert Initial Bookings
  await query(`
    INSERT INTO bookings (trip_id, user_id, seat_number, passenger_name, passenger_phone, passenger_email, status, total_price)
    VALUES 
      ($1, $2, 3, 'Иван Иванов', '+375 (29) 123-45-67', 'passenger@example.com', 'CONFIRMED', 25.00),
      ($1, NULL, 4, 'Алексей Иванов', '+375 (44) 123-45-67', 'alex@example.com', 'CONFIRMED', 25.00),
      ($1, NULL, 7, 'Елена Смирнова', '+375 (33) 987-65-43', 'elena@example.com', 'CONFIRMED', 25.00),
      ($3, $2, 1, 'Иван Иванов', '+375 (29) 123-45-67', 'passenger@example.com', 'CONFIRMED', 27.00)
    ON CONFLICT DO NOTHING;
  `, [firstTripId, passengerUserId, secondTripId]);

  logger.info('Database seeded successfully with demo users, carriers, buses, trips and bookings.');
}
