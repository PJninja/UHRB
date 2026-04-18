// Shared Pino logger instance — import this in service/state files
// so all output goes through the same stream and respects LOG_LEVEL.
import pino from 'pino';
import { config } from '../config.js';

export const logger = pino({
  level: config.logLevel,
  transport: config.isDevelopment
    ? {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
      }
    : undefined,
});
