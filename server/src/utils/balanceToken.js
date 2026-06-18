import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config.js';

function sign(payloadB64) {
  return createHmac('sha256', config.balanceTokenSecret)
    .update(payloadB64)
    .digest('base64url');
}

/**
 * Issue a signed balance token the client can persist and present when creating
 * a new session after the previous one expires.
 * @param {number} balance
 * @returns {string}
 */
export function issueToken(balance) {
  const payload = Buffer.from(
    JSON.stringify({ balance, issuedAt: Date.now() })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/**
 * Verify a balance token and return the encoded balance, or null if invalid /
 * tampered / expired.
 * @param {string|undefined} token
 * @returns {number|null}
 */
export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;

  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;

  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  // Constant-time comparison to prevent timing attacks
  const expected = sign(payloadB64);
  const sigBuf = Buffer.from(sig, 'base64url');
  const expBuf = Buffer.from(expected, 'base64url');
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!Number.isFinite(payload.balance) || payload.balance < 0) return null;
  if (Date.now() - payload.issuedAt > config.balanceTokenMaxAgeMs) return null;

  return Math.floor(payload.balance);
}
