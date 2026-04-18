// Server configuration
export const config = {
  // Server
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0',

  // Environment
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV !== 'production',

  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Session
  sessionTtlMs: parseInt(process.env.SESSION_TTL_MS || '86400000'), // 24 hours

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
};
