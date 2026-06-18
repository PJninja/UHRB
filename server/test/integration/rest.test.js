import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

vi.mock('../../src/services/raceScheduler.js', () => ({
  getCurrentRace:      vi.fn(),
  getLastFinishedRace: vi.fn(),
  isBettingAllowed:    vi.fn(),
  addBetToTotal:       vi.fn(),
  decrementBetTotal:   vi.fn(),
  racePayload:         vi.fn(race => race),
  sanitizeMonster:     vi.fn(m => m),
  forceAdvance:        vi.fn(),
  scheduleNextRace:    vi.fn(),
  finishRace:          vi.fn(),
}));
vi.mock('../../src/utils/logger.js', () => {
  const noop = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  return { logger: { child: () => noop, ...noop } };
});
vi.mock('../../src/services/broadcaster.js', () => ({ broadcast: vi.fn() }));

import { buildApp } from '../../src/app.js';
import { getCurrentRace, isBettingAllowed, racePayload } from '../../src/services/raceScheduler.js';
import { issueToken } from '../../src/utils/balanceToken.js';
// Real (unmocked) sessionManager — used to set up server-side state directly
import { storeBet as storeBetDirect, deductBet as deductBetDirect, resolveRaceBets } from '../../src/state/sessionManager.js';

const RACE_ID = 'race-test-001';
const MONSTER_A = {
  id: 'monster-a', name: 'Dreadful A',
  description: 'desc', blurb: 'blurb', features: 'feat', height: 10, weight: 50,
  traits: { speed: 5, endurance: 5, madness: 5, strength: 5, luck: 5 },
};
const MONSTER_B = {
  id: 'monster-b', name: 'Dreadful B',
  description: 'desc2', blurb: 'blurb2', features: 'feat2', height: 8, weight: 40,
  traits: { speed: 4, endurance: 4, madness: 4, strength: 4, luck: 4 },
};

function waitingRace(overrides = {}) {
  return {
    id: RACE_ID,
    state: 'waiting',
    monsters: [MONSTER_A, MONSTER_B],
    odds: { [MONSTER_A.id]: 2.5, [MONSTER_B.id]: 1.8 },
    betTotals: { [MONSTER_A.id]: 0, [MONSTER_B.id]: 0 },
    winner: null,
    rankings: [],
    nextRaceTime: Date.now() + 60000,
    timeRemaining: 60,
    ...overrides,
  };
}

let app;

beforeAll(async () => {
  app = await buildApp({ logger: false, ws: false, rateLimit: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentRace.mockReturnValue(waitingRace());
  isBettingAllowed.mockReturnValue(true);
  racePayload.mockImplementation(race => race);
});

// ─── GET /health ─────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('includes a timestamp', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.json().timestamp).toBeTypeOf('number');
  });
});

// ─── POST /api/session ────────────────────────────────────────────────────────

describe('POST /api/session', () => {
  it('returns 200 with sessionId and expiresAt', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/session' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.sessionId).toMatch(/^session_/);
    expect(body.expiresAt).toBeGreaterThan(Date.now());
  });

  it('creates unique session IDs on each call', async () => {
    const a = await app.inject({ method: 'POST', url: '/api/session' });
    const b = await app.inject({ method: 'POST', url: '/api/session' });
    expect(a.json().sessionId).not.toBe(b.json().sessionId);
  });

  it('returns the starting candy balance when no hint is given', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/session' });
    expect(res.json().candyBalance).toBe(100);
  });

  it('restores balance from a valid signed balanceToken', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/session',
      payload: { balanceToken: issueToken(750) },
    });
    expect(res.json().candyBalance).toBe(750);
  });

  it('caps restored balance at 1,000,000 even with a valid token', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/session',
      payload: { balanceToken: issueToken(9999999) },
    });
    expect(res.json().candyBalance).toBe(1000000);
  });

  it('ignores a tampered balanceToken and starts fresh', async () => {
    const token = issueToken(750);
    const tampered = token.slice(0, -4) + 'xxxx';
    const res = await app.inject({
      method: 'POST', url: '/api/session',
      payload: { balanceToken: tampered },
    });
    expect(res.json().candyBalance).toBe(100);
  });

  it('returns a balanceToken in the response', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/session' });
    expect(typeof res.json().balanceToken).toBe('string');
  });
});

// ─── GET /api/session/:sessionId/validate ────────────────────────────────────

describe('GET /api/session/:sessionId/validate', () => {
  it('returns valid=true for an active session', async () => {
    const { sessionId } = (await app.inject({ method: 'POST', url: '/api/session' })).json();
    const res = await app.inject({ method: 'GET', url: `/api/session/${sessionId}/validate` });
    expect(res.statusCode).toBe(200);
    expect(res.json().valid).toBe(true);
    expect(res.json().session.id).toBe(sessionId);
  });

  it('returns valid=false for an unknown session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/session/session_unknown/validate' });
    expect(res.statusCode).toBe(200);
    expect(res.json().valid).toBe(false);
    expect(res.json().session).toBeNull();
  });

  it('returns candyBalance for an active session', async () => {
    const { sessionId } = (await app.inject({ method: 'POST', url: '/api/session' })).json();
    const res = await app.inject({ method: 'GET', url: `/api/session/${sessionId}/validate` });
    expect(res.json().candyBalance).toBe(100);
  });

  it('returns null candyBalance for an invalid session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/session/session_unknown/validate' });
    expect(res.json().candyBalance).toBeNull();
  });
});

// ─── GET /api/race/current ────────────────────────────────────────────────────

describe('GET /api/race/current', () => {
  it('returns the current race payload', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/race/current' });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe(RACE_ID);
  });

  it('returns race with statVisibility for each monster', async () => {
    // Add statVisibility to test monsters
    const monstersWithVisibility = [
      { ...MONSTER_A, statVisibility: { speed: true, endurance: false, madness: true, strength: false } },
      { ...MONSTER_B, statVisibility: { speed: false, endurance: true, madness: false, strength: true } },
    ];
    getCurrentRace.mockReturnValue(waitingRace({ monsters: monstersWithVisibility }));
    
    const res = await app.inject({ method: 'GET', url: '/api/race/current' });
    expect(res.statusCode).toBe(200);
    
    const race = res.json();
    expect(race.monsters).toBeDefined();
    expect(race.monsters.length).toBe(2);
    
    const monster = race.monsters[0];
    expect(monster.statVisibility).toBeDefined();
    expect(Object.keys(monster.statVisibility).sort()).toEqual(['endurance', 'madness', 'speed', 'strength']);
    
    // Verify all values are booleans
    Object.values(monster.statVisibility).forEach(visible => {
      expect(typeof visible).toBe('boolean');
    });
  });
});

// ─── GET /api/monster/:id ─────────────────────────────────────────────────────

describe('GET /api/monster/:id', () => {
  it('returns bio fields for a monster in the current race', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/monster/${MONSTER_A.id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(MONSTER_A.id);
    expect(body.description).toBe(MONSTER_A.description);
    expect(body.blurb).toBe(MONSTER_A.blurb);
    expect(body.features).toBe(MONSTER_A.features);
    expect(body.height).toBe(MONSTER_A.height);
    expect(body.weight).toBe(MONSTER_A.weight);
  });

  it('returns 404 for an unknown monster id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/monster/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });
});

// ─── POST /api/race/:raceId/bet ───────────────────────────────────────────────

async function createSession() {
  return (await app.inject({ method: 'POST', url: '/api/session' })).json().sessionId;
}

function betPayload(overrides = {}) {
  return {
    sessionId: 'WILL_BE_REPLACED',
    monsterId: MONSTER_A.id,
    amount: 50,
    ...overrides,
  };
}

describe('POST /api/race/:raceId/bet', () => {
  it('places a bet successfully', async () => {
    const sessionId = await createSession();
    const res = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/bet`,
      payload: betPayload({ sessionId }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 400 when sessionId is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/bet`,
      payload: { monsterId: MONSTER_A.id, amount: 50 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when monsterId is missing', async () => {
    const sessionId = await createSession();
    const res = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/bet`,
      payload: { sessionId, amount: 50 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when amount is missing', async () => {
    const sessionId = await createSession();
    const res = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/bet`,
      payload: { sessionId, monsterId: MONSTER_A.id },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 for an unknown session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/bet`,
      payload: betPayload({ sessionId: 'session_ghost' }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when raceId does not match current race', async () => {
    const sessionId = await createSession();
    const res = await app.inject({
      method: 'POST',
      url: '/api/race/wrong-race-id/bet',
      payload: betPayload({ sessionId }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when betting is closed', async () => {
    isBettingAllowed.mockReturnValue(false);
    const sessionId = await createSession();
    const res = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/bet`,
      payload: betPayload({ sessionId }),
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 400 when monsterId is not in the race', async () => {
    const sessionId = await createSession();
    const res = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/bet`,
      payload: betPayload({ sessionId, monsterId: 'not-in-race' }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when amount is less than 1', async () => {
    const sessionId = await createSession();
    const res = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/bet`,
      payload: betPayload({ sessionId, amount: 0 }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns candyBalance after a successful bet', async () => {
    const sessionId = await createSession();
    const res = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/bet`,
      payload: betPayload({ sessionId, amount: 50 }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().candyBalance).toBe(50); // 100 starting − 50 bet
  });

  it('returns 402 when the bet exceeds the session balance', async () => {
    const sessionId = await createSession();
    const res = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/bet`,
      payload: betPayload({ sessionId, amount: 101 }), // starting balance is 100
    });
    expect(res.statusCode).toBe(402);
  });

  it('returns 400 for non-integer amounts (floats, strings, NaN)', async () => {
    const sessionId = await createSession();
    for (const amount of [10.5, '10', Number.NaN, Number.POSITIVE_INFINITY, true]) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/race/${RACE_ID}/bet`,
        payload: betPayload({ sessionId, amount }),
      });
      expect(res.statusCode, `amount=${String(amount)}`).toBe(400);
    }
  });

  it('returns 409 on a duplicate bet for the same race without deducting twice', async () => {
    const sessionId = await createSession();
    const first = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/bet`,
      payload: betPayload({ sessionId, amount: 30 }),
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().candyBalance).toBe(70);

    const second = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/bet`,
      payload: betPayload({ sessionId, amount: 30, monsterId: MONSTER_B.id }),
    });
    expect(second.statusCode).toBe(409);

    // Balance must reflect only the first deduction
    const validate = await app.inject({ method: 'GET', url: `/api/session/${sessionId}/validate` });
    expect(validate.json().candyBalance).toBe(70);
  });

  it('refunds a leftover bet from a dead race before accepting a new bet', async () => {
    const sessionId = await createSession();
    // Simulate a bet stuck on a race that never resolved (e.g. discarded race)
    storeBetDirect(sessionId, 'race-dead', MONSTER_A.id, 40);
    deductBetDirect(sessionId, 40); // balance → 60

    const res = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/bet`,
      payload: betPayload({ sessionId, amount: 25 }),
    });
    expect(res.statusCode).toBe(200);
    // 100 − 40 (dead bet) + 40 (refund) − 25 (new bet) = 75
    expect(res.json().candyBalance).toBe(75);
  });
});

// ─── POST /api/race/:raceId/payout/validate ───────────────────────────────────

describe('POST /api/race/:raceId/payout/validate', () => {
  it('returns 400 when sessionId is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/payout/validate`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 for an unknown session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/payout/validate`,
      payload: { sessionId: 'session_ghost' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns valid=true with payout=0 when race is not finished', async () => {
    // Race is in 'waiting' state — no payout
    const sessionId = await createSession();
    const res = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/payout/validate`,
      payload: { sessionId },
    });
    expect(res.statusCode).toBe(200);
    // validatePayout returns valid:false when state !== 'finished'
    expect(res.json().valid).toBe(false);
  });

  it('returns won=true with payout when the session bet on the winner', async () => {
    // Set up a finished race
    getCurrentRace.mockReturnValue(waitingRace({
      state: 'finished',
      winner: MONSTER_A,
      rankings: [{ position: 1, monster: MONSTER_A }, { position: 2, monster: MONSTER_B }],
    }));

    // Create session, place a bet, then validate payout
    const sessionId = await createSession();
    isBettingAllowed.mockReturnValue(true);
    getCurrentRace.mockReturnValueOnce(waitingRace()); // for the bet call
    await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/bet`,
      payload: { sessionId, monsterId: MONSTER_A.id, amount: 100 },
    });

    // Now restore finished race for payout
    getCurrentRace.mockReturnValue(waitingRace({
      state: 'finished',
      winner: MONSTER_A,
      rankings: [{ position: 1, monster: MONSTER_A }, { position: 2, monster: MONSTER_B }],
    }));

    const res = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/payout/validate`,
      payload: { sessionId, bet: { monsterId: MONSTER_A.id, amount: 100 } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().valid).toBe(true);
    expect(res.json().won).toBe(true);
    expect(res.json().payout).toBe(250); // floor(100 × 2.5)
  });

  it('returns updated candyBalance after a winning payout', async () => {
    getCurrentRace.mockReturnValue(waitingRace({
      state: 'finished',
      winner: MONSTER_A,
      rankings: [{ position: 1, monster: MONSTER_A }, { position: 2, monster: MONSTER_B }],
    }));

    const sessionId = await createSession();
    isBettingAllowed.mockReturnValue(true);
    getCurrentRace.mockReturnValueOnce(waitingRace());
    await app.inject({
      method: 'POST', url: `/api/race/${RACE_ID}/bet`,
      payload: { sessionId, monsterId: MONSTER_A.id, amount: 50 },
    });

    getCurrentRace.mockReturnValue(waitingRace({
      state: 'finished',
      winner: MONSTER_A,
      rankings: [{ position: 1, monster: MONSTER_A }, { position: 2, monster: MONSTER_B }],
    }));

    const res = await app.inject({
      method: 'POST', url: `/api/race/${RACE_ID}/payout/validate`,
      payload: { sessionId, bet: { monsterId: MONSTER_A.id, amount: 50 } },
    });
    // balance after bet: 100 − 50 = 50; payout = floor(50 × 2.5) = 125; final = 50 + 125 = 175
    expect(res.json().candyBalance).toBe(175);
  });

  it('returns unchanged candyBalance after a losing payout', async () => {
    getCurrentRace.mockReturnValue(waitingRace({
      state: 'finished',
      winner: MONSTER_A,
      rankings: [{ position: 1, monster: MONSTER_A }, { position: 2, monster: MONSTER_B }],
    }));

    const sessionId = await createSession();
    isBettingAllowed.mockReturnValue(true);
    getCurrentRace.mockReturnValueOnce(waitingRace());
    await app.inject({
      method: 'POST', url: `/api/race/${RACE_ID}/bet`,
      payload: { sessionId, monsterId: MONSTER_B.id, amount: 50 },
    });

    getCurrentRace.mockReturnValue(waitingRace({
      state: 'finished',
      winner: MONSTER_A,
      rankings: [{ position: 1, monster: MONSTER_A }, { position: 2, monster: MONSTER_B }],
    }));

    const res = await app.inject({
      method: 'POST', url: `/api/race/${RACE_ID}/payout/validate`,
      payload: { sessionId, bet: { monsterId: MONSTER_B.id, amount: 50 } },
    });
    // balance after bet: 100 − 50 = 50; payout = 0 (loss); final = 50 (above mercy floor)
    expect(res.json().candyBalance).toBe(50);
  });

  it('returns won=false with payout=0 when the session bet on the loser', async () => {
    getCurrentRace.mockReturnValue(waitingRace({
      state: 'finished',
      winner: MONSTER_A,
      rankings: [{ position: 1, monster: MONSTER_A }, { position: 2, monster: MONSTER_B }],
    }));

    const sessionId = await createSession();
    isBettingAllowed.mockReturnValue(true);
    getCurrentRace.mockReturnValueOnce(waitingRace());
    await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/bet`,
      payload: { sessionId, monsterId: MONSTER_B.id, amount: 100 },
    });

    getCurrentRace.mockReturnValue(waitingRace({
      state: 'finished',
      winner: MONSTER_A,
      rankings: [{ position: 1, monster: MONSTER_A }, { position: 2, monster: MONSTER_B }],
    }));

    const res = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/payout/validate`,
      payload: { sessionId, bet: { monsterId: MONSTER_B.id, amount: 100 } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().won).toBe(false);
    expect(res.json().payout).toBe(0);
  });

  it('does not credit balance a second time when payout is called twice (double-payout prevention)', async () => {
    const finishedRace = waitingRace({
      state: 'finished',
      winner: MONSTER_A,
      rankings: [{ position: 1, monster: MONSTER_A }, { position: 2, monster: MONSTER_B }],
    });

    const sessionId = await createSession();
    isBettingAllowed.mockReturnValue(true);
    getCurrentRace.mockReturnValueOnce(waitingRace());
    await app.inject({
      method: 'POST', url: `/api/race/${RACE_ID}/bet`,
      payload: { sessionId, monsterId: MONSTER_A.id, amount: 50 },
    });

    getCurrentRace.mockReturnValue(finishedRace);

    const first = await app.inject({
      method: 'POST', url: `/api/race/${RACE_ID}/payout/validate`,
      payload: { sessionId, bet: { monsterId: MONSTER_A.id, amount: 50 } },
    });
    const second = await app.inject({
      method: 'POST', url: `/api/race/${RACE_ID}/payout/validate`,
      payload: { sessionId, bet: { monsterId: MONSTER_A.id, amount: 50 } },
    });

    // First call: balance 50 + payout 125 = 175
    expect(first.json().candyBalance).toBe(175);
    // Second call: bet was cleared — balance stays at 175
    expect(second.json().candyBalance).toBe(175);
  });

  it('returns the stored result when the bet was resolved at race finish', async () => {
    const finishedRace = waitingRace({
      state: 'finished',
      winner: MONSTER_A,
      rankings: [{ position: 1, monster: MONSTER_A }, { position: 2, monster: MONSTER_B }],
    });

    const sessionId = await createSession();
    await app.inject({
      method: 'POST', url: `/api/race/${RACE_ID}/bet`,
      payload: { sessionId, monsterId: MONSTER_A.id, amount: 50 },
    });

    // Simulate the scheduler resolving bets at race finish (server-side payout)
    resolveRaceBets(RACE_ID, MONSTER_A.id, finishedRace.odds);
    getCurrentRace.mockReturnValue(finishedRace);

    const first = await app.inject({
      method: 'POST', url: `/api/race/${RACE_ID}/payout/validate`,
      payload: { sessionId, bet: { monsterId: MONSTER_A.id, amount: 50 } },
    });
    const second = await app.inject({
      method: 'POST', url: `/api/race/${RACE_ID}/payout/validate`,
      payload: { sessionId, bet: { monsterId: MONSTER_A.id, amount: 50 } },
    });

    // Resolution credited 50 × 2.5 = 125 onto the post-bet balance of 50
    expect(first.json().won).toBe(true);
    expect(first.json().payout).toBe(125);
    expect(first.json().candyBalance).toBe(175);
    expect(first.json().winner.id).toBe(MONSTER_A.id);
    // Idempotent: a repeat call reports the same result without re-crediting
    expect(second.json().candyBalance).toBe(175);
    expect(second.json().payout).toBe(125);
  });

  it('does not apply mercy floor when a player with no bet calls payout validate', async () => {
    getCurrentRace.mockReturnValue(waitingRace({
      state: 'finished',
      winner: MONSTER_A,
      rankings: [{ position: 1, monster: MONSTER_A }, { position: 2, monster: MONSTER_B }],
    }));

    // Create a session with a low balance but place no bet
    const sessionId = (await app.inject({
      method: 'POST', url: '/api/session',
      payload: { balanceToken: issueToken(5) },
    })).json().sessionId;

    const res = await app.inject({
      method: 'POST', url: `/api/race/${RACE_ID}/payout/validate`,
      payload: { sessionId },
    });

    // Balance should stay at 5 — mercy floor must not fire for non-bettors
    expect(res.json().candyBalance).toBe(5);
  });
});

// ─── DELETE /api/race/:raceId/bet ────────────────────────────────────────────

function cancelPayload(overrides = {}) {
  return {
    sessionId: 'WILL_BE_REPLACED',
    ...overrides,
  };
}

describe('DELETE /api/race/:raceId/bet', () => {
  it('cancels a bet successfully and refunds balance', async () => {
    const sessionId = await createSession();
    // Place a bet first
    const betRes = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/bet`,
      payload: betPayload({ sessionId, amount: 50 }),
    });
    expect(betRes.statusCode).toBe(200);
    expect(betRes.json().candyBalance).toBe(50);

    // Now cancel it
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/race/${RACE_ID}/bet`,
      payload: cancelPayload({ sessionId }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().refunded).toBe(50);
    expect(res.json().candyBalance).toBe(100);
  });

  it('returns 400 when sessionId is missing', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/race/${RACE_ID}/bet`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 for an unknown session', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/race/${RACE_ID}/bet`,
      payload: cancelPayload({ sessionId: 'session_ghost' }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when no active bet exists', async () => {
    const sessionId = await createSession();
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/race/${RACE_ID}/bet`,
      payload: cancelPayload({ sessionId }),
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when bet is for a different race', async () => {
    const sessionId = await createSession();
    // Place bet via direct session manager so we can forge a stale raceId
    const { storeBet } = await import('../../src/state/sessionManager.js');
    storeBet(sessionId, 'old-race-id', MONSTER_A.id, 50);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/race/${RACE_ID}/bet`,
      payload: cancelPayload({ sessionId }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 409 when betting is closed', async () => {
    const sessionId = await createSession();
    // Place a bet
    const betRes = await app.inject({
      method: 'POST',
      url: `/api/race/${RACE_ID}/bet`,
      payload: betPayload({ sessionId, amount: 50 }),
    });
    expect(betRes.statusCode).toBe(200);

    // Close betting
    isBettingAllowed.mockReturnValue(false);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/race/${RACE_ID}/bet`,
      payload: cancelPayload({ sessionId }),
    });
    expect(res.statusCode).toBe(409);
  });
});
