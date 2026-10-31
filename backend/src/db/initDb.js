import { query } from './db.js';
import { logger } from '../utils/logger.js';
import { seedDatabase } from './seedData.js';

export async function initializeDatabase() {
  logger.info('Initializing PostgreSQL database schema...');

  const schemaSql = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(50),
      role VARCHAR(50) NOT NULL DEFAULT 'PASSENGER',
      avatar_url TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS carriers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      phone VARCHAR(50) NOT NULL,
      email VARCHAR(255) NOT NULL,
      rating NUMERIC(3,2) DEFAULT 4.80,
      logo_url TEXT,
      license_number VARCHAR(100),
      license_file_url TEXT,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS buses (
      id SERIAL PRIMARY KEY,
      carrier_id INTEGER NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
      plate_number VARCHAR(50) NOT NULL,
      model VARCHAR(255) NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 19,
      features TEXT[] DEFAULT ARRAY['Кондиционер', 'Wi-Fi', 'Багажное отделение'],
      photo_url TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS trips (
      id SERIAL PRIMARY KEY,
      carrier_id INTEGER NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
      bus_id INTEGER NOT NULL REFERENCES buses(id) ON DELETE RESTRICT,
      origin_city VARCHAR(100) NOT NULL,
      destination_city VARCHAR(100) NOT NULL,
      departure_station VARCHAR(255) DEFAULT 'Автовокзал Центральный',
      arrival_station VARCHAR(255) DEFAULT 'Автовокзал',
      departure_time TIMESTAMP WITH TIME ZONE NOT NULL,
      arrival_time TIMESTAMP WITH TIME ZONE NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'SCHEDULED',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      seat_number INTEGER NOT NULL,
      passenger_name VARCHAR(255) NOT NULL,
      passenger_phone VARCHAR(50) NOT NULL,
      passenger_email VARCHAR(255) NOT NULL,
      doc_file_url TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED',
      total_price NUMERIC(10,2) NOT NULL,
      booked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_trip_seat UNIQUE (trip_id, seat_number)
    );

    CREATE TABLE IF NOT EXISTS active_sessions (
      id VARCHAR(100) PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      refresh_token_hash VARCHAR(255) NOT NULL,
      ip_address VARCHAR(100),
      user_agent TEXT,
      is_revoked BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token VARCHAR(255) UNIQUE NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_trips_search ON trips(origin_city, destination_city, departure_time);
    CREATE INDEX IF NOT EXISTS idx_bookings_trip ON bookings(trip_id);
    CREATE INDEX IF NOT EXISTS idx_buses_carrier ON buses(carrier_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON active_sessions(user_id);
  `;

  await query(schemaSql);
  logger.info('Database schema initialized successfully.');

  // Check if initial seeding is needed
  const userCountRes = await query('SELECT COUNT(*) as count FROM users');
  const count = parseInt(userCountRes.rows[0].count, 10);
  if (count === 0) {
    logger.info('Database is empty. Populating with initial seed data...');
    await seedDatabase();
  }
}
