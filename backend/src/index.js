import { app } from './app.js';
import { config } from './config/index.js';
import { initializeDatabase } from './db/initDb.js';
import { pool } from './db/db.js';
import { logger } from './utils/logger.js';

async function bootstrap() {
  try {
    // 1. Initialize PostgreSQL schema and seed data
    await initializeDatabase();

    // 2. Start Express server
    const server = app.listen(config.port, () => {
      logger.info(`Server successfully started and listening on http://localhost:${config.port}`, {
        port: config.port,
        environment: config.nodeEnv,
      });
      console.log(`\n🚍 ===============================================`);
      console.log(`🚍 Intercity Bus Aggregator REST API`);
      console.log(`🚍 Server running on: http://localhost:${config.port}`);
      console.log(`🚍 Healthcheck:       http://localhost:${config.port}/api/health`);
      console.log(`🚍 Trips endpoint:    http://localhost:${config.port}/api/trips`);
      console.log(`🚍 ===============================================\n`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        await pool.end();
        logger.info('Database pool closed. Process terminated.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (error) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

bootstrap();
