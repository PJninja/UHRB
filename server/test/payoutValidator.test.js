import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));
vi.mock('../src/services/raceScheduler.js', () => ({ getCurrentRace: vi.fn() }));
vi.mock('../src/state/sessionManager.js', () => ({ getCurrentBet: vi.fn() }));

import { validatePayout } from '../src/services/payoutValidator.js';
import { getCurrentRace } from '../src/services/raceScheduler.js';
import { getCurrentBet } from '../src/state/sessionManager.js';

const SESSION = 'session_test';
const RACE_ID = 'race-abc';
const MONSTER_A = { id: 'monster-a', name: 'Monster A' };
const MONSTER_B = { id: 'monster-b', name: 'Monster B' };

function finishedRace(overrides = {}) {
  return {
    id: RACE_ID,
    state: 'finished',
    winner: MONSTER_A,
    rankings: [{ position: 1, monster: MONSTER_A }, { position: 2, monster: MONSTER_B }],
    odds: { [MONSTER_A.id]: 2.5, [MONSTER_B.id]: 1.8 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('validatePayout', () => {
  it('returns valid=false when race is not finished', () => {
    getCurrentRace.mockReturnValue({ ...finishedRace(), state: 'racing' });
    getCurrentBet.mockReturnValue(null);
    const result = validatePayout(SESSION, {});
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns valid=false for waiting state', () => {
    getCurrentRace.mockReturnValue({ ...finishedRace(), state: 'waiting' });
    getCurrentBet.mockReturnValue(null);
    expect(validatePayout(SESSION, {}).valid).toBe(false);
  });

  it('returns valid=true with no payout when no bet was placed', () => {
    getCurrentRace.mockReturnValue(finishedRace());
    getCurrentBet.mockReturnValue(null);
    const result = validatePayout(SESSION, {});
    expect(result.valid).toBe(true);
    expect(result.won).toBe(false);
    expect(result.payout).toBe(0);
  });

  it('returns valid=true with no payout when bet was for a different race', () => {
    getCurrentRace.mockReturnValue(finishedRace());
    getCurrentBet.mockReturnValue({ raceId: 'old-race', monsterId: MONSTER_A.id, amount: 50 });
    const result = validatePayout(SESSION, {});
    expect(result.valid).toBe(true);
    expect(result.won).toBe(false);
    expect(result.payout).toBe(0);
  });

  it('pays out floor(amount × odds) to the winner', () => {
    getCurrentRace.mockReturnValue(finishedRace());
    getCurrentBet.mockReturnValue({ raceId: RACE_ID, monsterId: MONSTER_A.id, amount: 100 });
    const result = validatePayout(SESSION, { monsterId: MONSTER_A.id, amount: 100 });
    expect(result.valid).toBe(true);
    expect(result.won).toBe(true);
    expect(result.payout).toBe(250); // floor(100 × 2.5)
  });

  it('truncates fractional payout with floor', () => {
    getCurrentRace.mockReturnValue(finishedRace({ odds: { [MONSTER_A.id]: 2.7 } }));
    getCurrentBet.mockReturnValue({ raceId: RACE_ID, monsterId: MONSTER_A.id, amount: 10 });
    const result = validatePayout(SESSION, { monsterId: MONSTER_A.id, amount: 10 });
    expect(result.payout).toBe(27); // floor(10 × 2.7) = 27 not 27.0
  });

  it('returns payout=0 for the loser', () => {
    getCurrentRace.mockReturnValue(finishedRace());
    getCurrentBet.mockReturnValue({ raceId: RACE_ID, monsterId: MONSTER_B.id, amount: 100 });
    const result = validatePayout(SESSION, { monsterId: MONSTER_B.id, amount: 100 });
    expect(result.valid).toBe(true);
    expect(result.won).toBe(false);
    expect(result.payout).toBe(0);
  });

  it('uses server bet when claimed monsterId does not match', () => {
    getCurrentRace.mockReturnValue(finishedRace());
    getCurrentBet.mockReturnValue({ raceId: RACE_ID, monsterId: MONSTER_A.id, amount: 100 });
    // Claimed monster B but server says A won and server bet is on A — should still win
    const result = validatePayout(SESSION, { monsterId: MONSTER_B.id, amount: 100 });
    expect(result.won).toBe(true);
    expect(result.payout).toBe(250);
  });

  it('uses server bet amount when claimed amount does not match', () => {
    getCurrentRace.mockReturnValue(finishedRace());
    getCurrentBet.mockReturnValue({ raceId: RACE_ID, monsterId: MONSTER_A.id, amount: 100 });
    // Client claims 9999 but server says 100
    const result = validatePayout(SESSION, { monsterId: MONSTER_A.id, amount: 9999 });
    expect(result.payout).toBe(250); // floor(100 × 2.5), not floor(9999 × 2.5)
  });

  it('defaults to 1.5× odds when monster has no odds entry', () => {
    getCurrentRace.mockReturnValue(finishedRace({ odds: {} }));
    getCurrentBet.mockReturnValue({ raceId: RACE_ID, monsterId: MONSTER_A.id, amount: 100 });
    const result = validatePayout(SESSION, { monsterId: MONSTER_A.id, amount: 100 });
    expect(result.payout).toBe(150); // floor(100 × 1.5)
  });

  it('includes winner and rankings in valid responses', () => {
    getCurrentRace.mockReturnValue(finishedRace());
    getCurrentBet.mockReturnValue({ raceId: RACE_ID, monsterId: MONSTER_A.id, amount: 50 });
    const result = validatePayout(SESSION, { monsterId: MONSTER_A.id, amount: 50 });
    expect(result.winner).toEqual(MONSTER_A);
    expect(result.rankings).toHaveLength(2);
  });
});
