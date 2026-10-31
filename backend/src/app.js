import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config/index.js';
import { requestLogger } from './middleware/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { NotFoundError } from './errors/appErrors.js';

import carrierRoutes from './routes/carrierRoutes.js';
import busRoutes from './routes/busRoutes.js';
import tripRoutes from './routes/tripRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import authRoutes from './routes/authRoutes.js';

export const app = express();

// Trust proxy for Docker / reverse proxy environments
app.set('trust proxy', 1);

// CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
}));

// Body parsers for JSON and URL-encoded payloads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving for uploaded documents, photos and logos
app.use('/uploads', express.static(config.uploadDir));

// Structured logging for every incoming request
app.use(requestLogger);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    service: 'Intercity Bus Aggregator REST API',
    uptime: process.uptime(),
  });
});

// REST API route modules
app.use('/api/auth', authRoutes);
app.use('/api/carriers', carrierRoutes);
app.use('/api/buses', busRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/upload', uploadRoutes);

// Catch 404 for any unhandled routes
app.use((req, res, next) => {
  next(new NotFoundError(`Маршрут не найден: ${req.method} ${req.originalUrl}`));
});

// Centralized semantic HTTP error handler
app.use(errorHandler);
