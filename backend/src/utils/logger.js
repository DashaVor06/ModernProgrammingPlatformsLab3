/**
 * Structured Logger adhering to JSON logging specifications (Lab 3 Point 4)
 */
class Logger {
  constructor() {
    this.levels = {
      DEBUG: 10,
      INFO: 20,
      WARN: 30,
      ERROR: 40,
    };
    this.currentLevel = process.env.LOG_LEVEL || 'INFO';
  }

  format(level, message, meta = {}) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    });
  }

  debug(message, meta) {
    if (this.levels[this.currentLevel] <= this.levels.DEBUG) {
      console.debug(this.format('DEBUG', message, meta));
    }
  }

  info(message, meta) {
    if (this.levels[this.currentLevel] <= this.levels.INFO) {
      console.log(this.format('INFO', message, meta));
    }
  }

  warn(message, meta) {
    if (this.levels[this.currentLevel] <= this.levels.WARN) {
      console.warn(this.format('WARN', message, meta));
    }
  }

  error(message, meta) {
    if (this.levels[this.currentLevel] <= this.levels.ERROR) {
      console.error(this.format('ERROR', message, meta));
    }
  }
}

export const logger = new Logger();
