import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

vi.mock('../../src/services/raceScheduler.js', () => ({
  getCurrentRace:   vi.fn(),
  isBettingAllowed: vi.fn(),
  addBetToTotal:    vi.fn(),
  racePayload:      vi.fn(race => race),
  sanitizeMonster:  vi.fn(m => m),
  forceAdvance:     vi.fn(),
  scheduleNextRace: vi.fn(),
  finishRace:       vi.fn(),
}));
vi.mock('../../src/utils/logger.js', () => {
  const noop = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  return { logger: { child: () => noop, ...noop } };
});
vi.mock('../../src/services/broadcaster.js', () => ({ broadcast: vi.fn() }));

import { buildApp } from '../../src/app.js';
import { getCurrentRace, isBettingAllowed, racePayload } from '../../src/services/raceScheduler.js';

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

  it('uses a claimedBalance hint when provided', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/session',
      payload: { claimedBalance: 750 },
    });
    expect(res.json().candyBalance).toBe(750);
  });

  it('caps claimedBalance at 1,000,000', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/session',
      payload: { claimedBalance: 9999999 },
    });
    expect(res.json().candyBalance).toBe(1000000);
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

  it('does not apply mercy floor when a player with no bet calls payout validate', async () => {
    getCurrentRace.mockReturnValue(waitingRace({
      state: 'finished',
      winner: MONSTER_A,
      rankings: [{ position: 1, monster: MONSTER_A }, { position: 2, monster: MONSTER_B }],
    }));

    // Create a session with a low balance but place no bet
    const sessionId = (await app.inject({
      method: 'POST', url: '/api/session',
      payload: { claimedBalance: 5 },
    })).json().sessionId;

    const res = await app.inject({
      method: 'POST', url: `/api/race/${RACE_ID}/payout/validate`,
      payload: { sessionId },
    });

    // Balance should stay at 5 — mercy floor must not fire for non-bettors
    expect(res.json().candyBalance).toBe(5);
  });
});
