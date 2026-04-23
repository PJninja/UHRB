// Server configuration
const testMode = process.env.TEST_MODE === 'true';

export const config = {
  // Server
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0',

  // Environment
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV !== 'production',
  testMode,

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Session
  sessionTtlMs: parseInt(process.env.SESSION_TTL_MS || '86400000'), // 24 hours

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Race timing — collapsed in TEST_MODE for fast manual testing
  raceIntervalMin:      testMode ?   2000 :  30000,
  raceIntervalMax:      testMode ?   5000 : 300000,
  raceDurationMin:      testMode ?   3000 :  20000,
  raceDurationMax:      testMode ?   5000 :  30000,
  bettingCloseBeforeMs: testMode ?    500 :   5000,
  legendaryChance:      testMode ?    100 :      5,
};
