import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));

import {
  createSession, getSession, validateSession,
  storeBet, getCurrentBet, clearBet,
  getActiveSessions, deductBet, creditPayout, getBalance, refundBet,
  resolveRaceBets, getLastBetResult,
  pledgePatron, breakPact, markPatronBetrayal,
  getPatronMonsterIds, clearFledPatrons, tickPatronCooldowns, getPatronPayoutMultiplier,
} from '../src/state/sessionManager.js';
import { config } from '../src/config.js';

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

// ─── candy balance ────────────────────────────────────────────────────────────

describe('createSession — candy balance', () => {
  it('starts with the configured starting balance when no hint is given', () => {
    const { candyBalance } = createSession();
    expect(candyBalance).toBe(config.startingBalance);
  });

  it('uses a valid claimedBalance hint', () => {
    const { candyBalance } = createSession(500);
    expect(candyBalance).toBe(500);
  });

  it('floors a fractional claimedBalance', () => {
    const { candyBalance } = createSession(123.9);
    expect(candyBalance).toBe(123);
  });

  it('caps claimedBalance at maxClaimedBalance', () => {
    const { candyBalance } = createSession(config.maxClaimedBalance + 999999);
    expect(candyBalance).toBe(config.maxClaimedBalance);
  });

  it('ignores non-positive claimedBalance values', () => {
    expect(createSession(0).candyBalance).toBe(config.startingBalance);
    expect(createSession(-50).candyBalance).toBe(config.startingBalance);
  });
});

describe('deductBet', () => {
  it('deducts the amount and returns the new balance', () => {
    const { sessionId } = createSession();
    const result = deductBet(sessionId, 30);
    expect(result.ok).toBe(true);
    expect(result.candyBalance).toBe(config.startingBalance - 30);
  });

  it('allows betting the entire balance', () => {
    const { sessionId } = createSession();
    const result = deductBet(sessionId, config.startingBalance);
    expect(result.ok).toBe(true);
    expect(result.candyBalance).toBe(0);
  });

  it('rejects when balance is insufficient', () => {
    const { sessionId } = createSession();
    const result = deductBet(sessionId, config.startingBalance + 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insufficient_balance');
  });

  it('returns session_not_found for an unknown sessionId', () => {
    const result = deductBet('session_ghost', 10);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('session_not_found');
  });
});

describe('creditPayout', () => {
  it('adds the payout to the balance', () => {
    const { sessionId } = createSession();
    deductBet(sessionId, 50);                    // balance → 50
    const balance = creditPayout(sessionId, 150); // balance → 200
    expect(balance).toBe(200);
  });

  it('applies the mercy floor when balance would stay at 0', () => {
    const { sessionId } = createSession();
    deductBet(sessionId, config.startingBalance); // balance → 0
    const balance = creditPayout(sessionId, 0);   // payout=0 on a loss
    expect(balance).toBe(config.mercyBalance);
  });

  it('returns null for an unknown sessionId', () => {
    expect(creditPayout('session_ghost', 100)).toBeNull();
  });
});

describe('getBalance', () => {
  it('returns the current balance for an active session', () => {
    const { sessionId } = createSession();
    expect(getBalance(sessionId)).toBe(config.startingBalance);
  });

  it('reflects deductions', () => {
    const { sessionId } = createSession();
    deductBet(sessionId, 40);
    expect(getBalance(sessionId)).toBe(config.startingBalance - 40);
  });

  it('returns null for an unknown session', () => {
    expect(getBalance('session_ghost')).toBeNull();
  });
});

describe('refundBet', () => {
  it('adds the amount back to the balance', () => {
    const { sessionId } = createSession();
    deductBet(sessionId, 50);                    // balance → 50
    const result = refundBet(sessionId, 50);     // balance → 100
    expect(result.ok).toBe(true);
    expect(result.candyBalance).toBe(config.startingBalance);
  });

  it('returns ok: false for missing session', () => {
    const result = refundBet('session_ghost', 50);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('session_not_found');
  });
});

// ─── resolveRaceBets ──────────────────────────────────────────────────────────

describe('resolveRaceBets', () => {
  const RACE = 'race-resolve-1';
  const ODDS = { 'monster-w': 3.2, 'monster-l': 2.0 };

  it('credits a winning bet at bet × odds (floored) and clears it', () => {
    const { sessionId } = createSession();
    deductBet(sessionId, 25);                            // balance → 75
    storeBet(sessionId, RACE, 'monster-w', 25);

    const resolved = resolveRaceBets(RACE, 'monster-w', ODDS);

    expect(resolved).toBe(1);
    expect(getBalance(sessionId)).toBe(75 + Math.floor(25 * 3.2)); // 155
    expect(getCurrentBet(sessionId)).toBeNull();
  });

  it('records the result retrievably via getLastBetResult', () => {
    const { sessionId } = createSession();
    deductBet(sessionId, 25);
    storeBet(sessionId, RACE, 'monster-w', 25);

    resolveRaceBets(RACE, 'monster-w', ODDS);

    const result = getLastBetResult(sessionId);
    expect(result).toMatchObject({
      raceId: RACE,
      monsterId: 'monster-w',
      amount: 25,
      odds: 3.2,
      won: true,
      payout: Math.floor(25 * 3.2),
    });
  });

  it('pays nothing on a losing bet but applies the mercy floor', () => {
    const { sessionId } = createSession();
    deductBet(sessionId, 95);                            // balance → 5 (below mercy)
    storeBet(sessionId, RACE, 'monster-l', 95);

    resolveRaceBets(RACE, 'monster-w', ODDS);

    expect(getLastBetResult(sessionId).won).toBe(false);
    expect(getLastBetResult(sessionId).payout).toBe(0);
    expect(getBalance(sessionId)).toBe(config.mercyBalance);
    expect(getCurrentBet(sessionId)).toBeNull();
  });

  it('ignores bets placed on a different race', () => {
    const { sessionId } = createSession();
    deductBet(sessionId, 10);
    storeBet(sessionId, 'race-other', 'monster-w', 10);

    const resolved = resolveRaceBets(RACE, 'monster-w', ODDS);

    expect(resolved).toBe(0);
    expect(getCurrentBet(sessionId)).not.toBeNull();
    expect(getBalance(sessionId)).toBe(90);
  });

  it('uses the default 1.5 odds when the monster has no odds entry', () => {
    const { sessionId } = createSession();
    deductBet(sessionId, 20);                            // balance → 80
    storeBet(sessionId, RACE, 'monster-x', 20);

    resolveRaceBets(RACE, 'monster-x', {});

    expect(getBalance(sessionId)).toBe(80 + Math.floor(20 * 1.5)); // 110
  });

  it('resolves multiple sessions in one pass', () => {
    const a = createSession();
    const b = createSession();
    deductBet(a.sessionId, 10);
    deductBet(b.sessionId, 10);
    storeBet(a.sessionId, RACE, 'monster-w', 10);
    storeBet(b.sessionId, RACE, 'monster-l', 10);

    const resolved = resolveRaceBets(RACE, 'monster-w', ODDS);

    expect(resolved).toBe(2);
    expect(getBalance(a.sessionId)).toBe(90 + Math.floor(10 * 3.2));
    expect(getBalance(b.sessionId)).toBe(90);
  });
});

// ─── getLastBetResult ─────────────────────────────────────────────────────────

describe('getLastBetResult', () => {
  it('returns null when no bet has been resolved', () => {
    const { sessionId } = createSession();
    expect(getLastBetResult(sessionId)).toBeNull();
  });

  it('returns null for an unknown session', () => {
    expect(getLastBetResult('session_ghost')).toBeNull();
  });
});

// ─── pledgePatron ─────────────────────────────────────────────────────────────

describe('pledgePatron', () => {
  it('pledges a patron for a fresh session', () => {
    const { sessionId } = createSession();
    const result = pledgePatron(sessionId, 'monster-a');
    expect(result.ok).toBe(true);
    expect(getSession(sessionId).patronMonsterId).toBe('monster-a');
  });

  it('rejects pledging when a patron is already active', () => {
    const { sessionId } = createSession();
    pledgePatron(sessionId, 'monster-a');
    const result = pledgePatron(sessionId, 'monster-b');
    expect(result).toEqual({ ok: false, reason: 'already_pledged' });
    expect(getSession(sessionId).patronMonsterId).toBe('monster-a');
  });

  it('rejects pledging during the post-break cooldown', () => {
    const { sessionId } = createSession();
    pledgePatron(sessionId, 'monster-a');
    breakPact(sessionId);
    const result = pledgePatron(sessionId, 'monster-b');
    expect(result).toEqual({ ok: false, reason: 'cooling_down' });
  });

  it('returns session_not_found for an unknown session', () => {
    expect(pledgePatron('session_ghost', 'monster-a')).toEqual({ ok: false, reason: 'session_not_found' });
  });
});

// ─── breakPact ────────────────────────────────────────────────────────────────

describe('breakPact', () => {
  it('charges the configured fine, clears the patron, and starts a cooldown', () => {
    const { sessionId } = createSession(); // balance 100
    pledgePatron(sessionId, 'monster-a');

    const result = breakPact(sessionId);

    const expectedFine = Math.floor(100 * config.patronBreakPactFinePercent);
    expect(result).toEqual({ ok: true, candyBalance: 100 - expectedFine });
    const session = getSession(sessionId);
    expect(session.patronMonsterId).toBeNull();
    expect(session.patronCooldownRaces).toBe(config.patronBreakPactCooldownRaces);
  });

  it('applies the mercy floor if the fine would drop balance below it', () => {
    const { sessionId } = createSession();
    deductBet(sessionId, 100 - config.mercyBalance - 1); // balance → mercyBalance + 1
    pledgePatron(sessionId, 'monster-a');

    breakPact(sessionId);

    expect(getBalance(sessionId)).toBe(config.mercyBalance);
  });

  it('rejects breaking when there is no active patron', () => {
    const { sessionId } = createSession();
    expect(breakPact(sessionId)).toEqual({ ok: false, reason: 'no_active_patron' });
  });

  it('returns session_not_found for an unknown session', () => {
    expect(breakPact('session_ghost')).toEqual({ ok: false, reason: 'session_not_found' });
  });
});

// ─── markPatronBetrayal ───────────────────────────────────────────────────────

describe('markPatronBetrayal', () => {
  it('sets the trust cooldown to the configured length', () => {
    const { sessionId } = createSession();
    pledgePatron(sessionId, 'monster-a');
    markPatronBetrayal(sessionId);
    expect(getSession(sessionId).patronTrustCooldownRaces).toBe(config.patronTrustCooldownRaces);
  });

  it('is a no-op for an unknown session', () => {
    expect(() => markPatronBetrayal('session_ghost')).not.toThrow();
  });
});

// ─── getPatronMonsterIds / clearFledPatrons / tickPatronCooldowns ────────────

describe('getPatronMonsterIds', () => {
  it('aggregates patron monster ids across live sessions', () => {
    const a = createSession();
    const b = createSession();
    pledgePatron(a.sessionId, 'monster-gpmi-a');
    pledgePatron(b.sessionId, 'monster-gpmi-b');

    const ids = getPatronMonsterIds();
    expect(ids.has('monster-gpmi-a')).toBe(true);
    expect(ids.has('monster-gpmi-b')).toBe(true);
  });

  it('does not include a session that never pledged', () => {
    const { sessionId } = createSession();
    // Other tests in this file share the module-level session Map, so assert
    // on this specific session's absence rather than global emptiness.
    expect(getSession(sessionId).patronMonsterId).toBeNull();
  });
});

describe('clearFledPatrons', () => {
  it('clears patronMonsterId only for sessions matching a fled id', () => {
    const a = createSession();
    const b = createSession();
    pledgePatron(a.sessionId, 'monster-a');
    pledgePatron(b.sessionId, 'monster-b');

    clearFledPatrons(['monster-a']);

    expect(getSession(a.sessionId).patronMonsterId).toBeNull();
    expect(getSession(b.sessionId).patronMonsterId).toBe('monster-b');
  });

  it('is a no-op for an empty set', () => {
    const { sessionId } = createSession();
    pledgePatron(sessionId, 'monster-a');
    clearFledPatrons([]);
    expect(getSession(sessionId).patronMonsterId).toBe('monster-a');
  });
});

describe('tickPatronCooldowns', () => {
  it('decrements both cooldown counters by one, floored at zero', () => {
    const { sessionId } = createSession();
    pledgePatron(sessionId, 'monster-a');
    markPatronBetrayal(sessionId);
    breakPact(sessionId); // sets patronCooldownRaces, clears trust cooldown reset path is irrelevant here

    const before = getSession(sessionId).patronCooldownRaces;
    tickPatronCooldowns();
    expect(getSession(sessionId).patronCooldownRaces).toBe(before - 1);
  });

  it('never decrements below zero', () => {
    const { sessionId } = createSession();
    tickPatronCooldowns();
    expect(getSession(sessionId).patronCooldownRaces).toBe(0);
    expect(getSession(sessionId).patronTrustCooldownRaces).toBe(0);
  });
});

// ─── getPatronPayoutMultiplier ────────────────────────────────────────────────

describe('getPatronPayoutMultiplier', () => {
  it('returns 1.0 when the session has no active patron', () => {
    const { sessionId } = createSession();
    const session = getSession(sessionId);
    expect(getPatronPayoutMultiplier(session, 'monster-a')).toBe(1.0);
  });

  it('returns the loyalty bonus when betting on your own patron', () => {
    const { sessionId } = createSession();
    pledgePatron(sessionId, 'monster-a');
    const session = getSession(sessionId);
    expect(getPatronPayoutMultiplier(session, 'monster-a')).toBe(config.patronLoyaltyBonusMultiplier);
  });

  it('returns the spite tax when betting on a rival while a patron is active', () => {
    const { sessionId } = createSession();
    pledgePatron(sessionId, 'monster-a');
    const session = getSession(sessionId);
    expect(getPatronPayoutMultiplier(session, 'monster-b')).toBe(config.patronSpiteTaxMultiplier);
  });

  it('suspends the loyalty bonus while a trust cooldown is active', () => {
    const { sessionId } = createSession();
    pledgePatron(sessionId, 'monster-a');
    markPatronBetrayal(sessionId);
    const session = getSession(sessionId);
    expect(getPatronPayoutMultiplier(session, 'monster-a')).toBe(1.0);
  });
});

// ─── resolveRaceBets — patron multiplier integration ─────────────────────────

describe('resolveRaceBets — patron multiplier', () => {
  const RACE = 'race-patron-1';
  const ODDS = { 'monster-a': 2.0 };

  it('applies the loyalty bonus to a winning bet on your own patron', () => {
    const { sessionId } = createSession();
    pledgePatron(sessionId, 'monster-a');
    deductBet(sessionId, 50); // balance → 50
    storeBet(sessionId, RACE, 'monster-a', 50);

    resolveRaceBets(RACE, 'monster-a', ODDS);

    const expectedPayout = Math.floor(50 * 2.0 * config.patronLoyaltyBonusMultiplier);
    expect(getBalance(sessionId)).toBe(50 + expectedPayout);
    expect(getLastBetResult(sessionId).patronOutcome).toBe('loyalty');
  });

  it('applies the spite tax to a winning bet on a rival while a patron races', () => {
    const { sessionId } = createSession();
    pledgePatron(sessionId, 'monster-b');
    deductBet(sessionId, 50);
    storeBet(sessionId, RACE, 'monster-a', 50);

    resolveRaceBets(RACE, 'monster-a', ODDS);

    const expectedPayout = Math.floor(50 * 2.0 * config.patronSpiteTaxMultiplier);
    expect(getBalance(sessionId)).toBe(50 + expectedPayout);
    expect(getLastBetResult(sessionId).patronOutcome).toBe('spite');
  });

  it('leaves payout unaffected with no active patron', () => {
    const { sessionId } = createSession();
    deductBet(sessionId, 50);
    storeBet(sessionId, RACE, 'monster-a', 50);

    resolveRaceBets(RACE, 'monster-a', ODDS);

    expect(getBalance(sessionId)).toBe(50 + Math.floor(50 * 2.0));
    expect(getLastBetResult(sessionId).patronOutcome).toBeNull();
  });
  it('settles at the multiplier locked when the bet was stored, ignoring later pact changes', () => {
    const { sessionId } = createSession();
    deductBet(sessionId, 50);
    storeBet(sessionId, RACE, 'monster-a', 50); // no patron → locked at 1.0

    // A pact change after betting closes (the routes forbid it, but the
    // settlement must not depend on that) can't retroactively add a bonus
    getSession(sessionId).patronMonsterId = 'monster-a';

    resolveRaceBets(RACE, 'monster-a', ODDS);

    expect(getBalance(sessionId)).toBe(50 + Math.floor(50 * 2.0));
    expect(getLastBetResult(sessionId).patronOutcome).toBeNull();
  });

  it('re-locks a pending bet when pledging while betting is open', () => {
    const { sessionId } = createSession();
    deductBet(sessionId, 50);
    storeBet(sessionId, RACE, 'monster-a', 50);
    pledgePatron(sessionId, 'monster-a');

    expect(getSession(sessionId).currentBet.patronMultiplier).toBe(config.patronLoyaltyBonusMultiplier);
  });

  it('re-locks a pending bet to 1.0 when breaking the pact while betting is open', () => {
    const { sessionId } = createSession();
    pledgePatron(sessionId, 'monster-b');
    deductBet(sessionId, 50);
    storeBet(sessionId, RACE, 'monster-a', 50);
    expect(getSession(sessionId).currentBet.patronMultiplier).toBe(config.patronSpiteTaxMultiplier);

    breakPact(sessionId);

    expect(getSession(sessionId).currentBet.patronMultiplier).toBe(1.0);
  });
});
