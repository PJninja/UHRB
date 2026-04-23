import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));

import {
  createSession, getSession, validateSession,
  storeBet, getCurrentBet, clearBet,
  getActiveSessions,
} from '../src/state/sessionManager.js';

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-06-01T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── createSession ────────────────────────────────────────────────────────────

describe('createSession', () => {
  it('returns a sessionId and expiresAt', () => {
    const { sessionId, expiresAt } = createSession();
    expect(sessionId).toMatch(/^session_/);
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it('sets expiresAt to 24 hours from now', () => {
    const before = Date.now();
    const { expiresAt } = createSession();
    expect(expiresAt).toBeCloseTo(before + SESSION_TTL_MS, -2);
  });

  it('generates unique session IDs', () => {
    const ids = new Set([
      createSession().sessionId,
      createSession().sessionId,
      createSession().sessionId,
    ]);
    expect(ids.size).toBe(3);
  });
});

// ─── getSession ───────────────────────────────────────────────────────────────

describe('getSession', () => {
  it('returns the session for a valid ID', () => {
    const { sessionId } = createSession();
    const session = getSession(sessionId);
    expect(session).not.toBeNull();
    expect(session.id).toBe(sessionId);
  });

  it('returns null for an unknown ID', () => {
    expect(getSession('session_nonexistent')).toBeNull();
  });

  it('returns null after the session has expired', () => {
    const { sessionId } = createSession();
    vi.advanceTimersByTime(SESSION_TTL_MS + 1);
    expect(getSession(sessionId)).toBeNull();
  });

  it('updates lastSeen on each access', () => {
    const { sessionId } = createSession();
    const first = getSession(sessionId).lastSeen;
    vi.advanceTimersByTime(5000);
    const second = getSession(sessionId).lastSeen;
    expect(second).toBeGreaterThan(first);
  });
});

// ─── validateSession ─────────────────────────────────────────────────────────

describe('validateSession', () => {
  it('returns true for an active session', () => {
    const { sessionId } = createSession();
    expect(validateSession(sessionId)).toBe(true);
  });

  it('returns false for an unknown session', () => {
    expect(validateSession('session_unknown')).toBe(false);
  });

  it('returns false after expiry', () => {
    const { sessionId } = createSession();
    vi.advanceTimersByTime(SESSION_TTL_MS + 1);
    expect(validateSession(sessionId)).toBe(false);
  });
});

// ─── storeBet / getCurrentBet / clearBet ─────────────────────────────────────

describe('storeBet', () => {
  it('returns true and the bet is retrievable', () => {
    const { sessionId } = createSession();
    const ok = storeBet(sessionId, 'race-1', 'monster-a', 100);
    expect(ok).toBe(true);
    const bet = getCurrentBet(sessionId);
    expect(bet).toEqual(expect.objectContaining({
      raceId: 'race-1',
      monsterId: 'monster-a',
      amount: 100,
    }));
  });

  it('overwrites a previous bet', () => {
    const { sessionId } = createSession();
    storeBet(sessionId, 'race-1', 'monster-a', 50);
    storeBet(sessionId, 'race-1', 'monster-b', 75);
    expect(getCurrentBet(sessionId).monsterId).toBe('monster-b');
  });

  it('returns false for an unknown session', () => {
    expect(storeBet('session_ghost', 'race-1', 'monster-a', 10)).toBe(false);
  });
});

describe('getCurrentBet', () => {
  it('returns null when no bet has been placed', () => {
    const { sessionId } = createSession();
    expect(getCurrentBet(sessionId)).toBeNull();
  });

  it('returns null for an unknown session', () => {
    expect(getCurrentBet('session_ghost')).toBeNull();
  });
});

describe('clearBet', () => {
  it('removes the active bet', () => {
    const { sessionId } = createSession();
    storeBet(sessionId, 'race-1', 'monster-a', 100);
    clearBet(sessionId);
    expect(getCurrentBet(sessionId)).toBeNull();
  });

  it('returns true on success', () => {
    const { sessionId } = createSession();
    expect(clearBet(sessionId)).toBe(true);
  });

  it('returns false for an unknown session', () => {
    expect(clearBet('session_ghost')).toBe(false);
  });
});

// ─── getActiveSessions ────────────────────────────────────────────────────────

describe('getActiveSessions', () => {
  it('increases by 1 when a session is created', () => {
    const before = getActiveSessions();
    createSession();
    expect(getActiveSessions()).toBe(before + 1);
  });
});
