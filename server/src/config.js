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

  // Candy balance
  startingBalance: 100,
  mercyBalance: 10,
  maxClaimedBalance: 1000000,

  // Balance carry-over tokens (HMAC-SHA256 signed, client-persisted)
  // Set BALANCE_TOKEN_SECRET to a long random string in production.
  balanceTokenSecret: process.env.BALANCE_TOKEN_SECRET || 'dev-insecure-secret-change-in-production',
  balanceTokenMaxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Race timing — collapsed in TEST_MODE for fast manual testing
  raceIntervalMin:      testMode ?   2000 :  30000,
  raceIntervalMax:      testMode ?   5000 : 300000,
  raceDurationMin:      testMode ?   3000 :  20000,
  raceDurationMax:      testMode ?   5000 :  30000,
  bettingCloseBeforeMs: testMode ?    500 :   5000,
  legendaryChance:      testMode ?    100 :      5,

  // Performance events — rare, guaranteed-outcome margins layered on top of
  // the natural stat+chaos result. Surge only ever applies to the monster
  // that would already win (widens their margin); collapse only ever
  // applies to a random non-winner (crushes them to dead last). Both are
  // payout-neutral — payouts key off winnerId only, never finish position.
  surgeChance:          testMode ?    100 :      8,
  legendarySurgeChance: testMode ?    100 :     20,
  collapseChance:       testMode ?    100 :     10,

  // Ambient "crowd" bets — cosmetic phantom wagers applied server-side to the
  // race's crowd-favorite horror(s) so the bet-total display feels alive even
  // with few or no real players connected. Never affects odds/payout.
  phantomBetMin:        10,
  phantomBetMax:        300,
  phantomBetChunksMin:  2,
  phantomBetChunksMax:  5,
  // Rolled independently per crowd-favorite horror — each one has this % chance
  // of getting no ghost bet at all, so a tie doesn't always light up both.
  phantomBetSkipChance: 10,
};
