import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('../../src/lib/services/api.js', () => ({
  pledgePatron: vi.fn(),
  breakPact: vi.fn(),
  validateSession: vi.fn(() => Promise.resolve({ patron: null })),
  placeBet: vi.fn(),
  cancelBet: vi.fn(),
  validatePayout: vi.fn(),
}));

import {
  patron, handleRaceUpdate, patronFledEvent, clearPatronFledEvent,
  isBonded, isDistrusted, isOathbreakerCooldown, pledgePatron, breakPact,
} from '../../src/lib/stores/patron.js';
import { candies, confirmedBet } from '../../src/lib/stores/game.js';
import { sessionId, balanceToken } from '../../src/lib/stores/session.js';
import {
  pledgePatron as apiPledgePatron,
  breakPact as apiBreakPact,
} from '../../src/lib/services/api.js';

function makeRaceData(overrides = {}) {
  return {
    raceId: 'race-1',
    monsters: [
      { id: 'monster-a', name: 'Monster A' },
      { id: 'monster-b', name: 'Monster B' },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  patron.set({ monsterId: null, monsterName: null, cooldownRaces: 0, trustCooldownRaces: 0, lastSeenRaceId: null, racesSincePledged: 0 });
  clearPatronFledEvent();
  confirmedBet.set(null);
  sessionId.set('session-test');
  vi.clearAllMocks();
});

// ─── handleRaceUpdate — once-per-raceId gating ────────────────────────────────

describe('handleRaceUpdate', () => {
  it('updates lastSeenRaceId on a new race', () => {
    handleRaceUpdate(makeRaceData({ raceId: 'race-1' }));
    expect(get(patron).lastSeenRaceId).toBe('race-1');
  });

  it('does nothing on a repeated broadcast for the same raceId', () => {
    patron.set({ monsterId: 'monster-a', monsterName: 'Monster A', cooldownRaces: 0, trustCooldownRaces: 0, lastSeenRaceId: 'race-1' });

    // Same raceId, roster no longer contains the patron — should NOT be treated
    // as fled since this is still "the same race" from the store's perspective.
    handleRaceUpdate(makeRaceData({ raceId: 'race-1', monsters: [{ id: 'monster-b', name: 'Monster B' }] }));

    expect(get(patron).monsterId).toBe('monster-a');
    expect(get(patronFledEvent)).toBeNull();
  });

  it('ignores a payload with no raceId', () => {
    handleRaceUpdate({ monsters: [] });
    expect(get(patron).lastSeenRaceId).toBeNull();
  });
});

// ─── handleRaceUpdate — fled detection ─────────────────────────────────────────

describe('handleRaceUpdate — fled detection', () => {
  it('fires patronFledEvent and clears the pledge when the patron is missing from a new race roster', () => {
    patron.set({ monsterId: 'monster-a', monsterName: 'Monster A', cooldownRaces: 0, trustCooldownRaces: 0, lastSeenRaceId: 'race-0' });

    handleRaceUpdate(makeRaceData({ raceId: 'race-1', monsters: [{ id: 'monster-b', name: 'Monster B' }] }));

    expect(get(patronFledEvent)).toBe('Monster A');
    expect(get(patron).monsterId).toBeNull();
    expect(get(patron).monsterName).toBeNull();
  });

  it('does not fire fled when the patron is still in the new roster', () => {
    patron.set({ monsterId: 'monster-a', monsterName: 'Monster A', cooldownRaces: 0, trustCooldownRaces: 0, lastSeenRaceId: 'race-0' });

    handleRaceUpdate(makeRaceData({ raceId: 'race-1', monsters: [{ id: 'monster-a', name: 'Monster A' }] }));

    expect(get(patronFledEvent)).toBeNull();
    expect(get(patron).monsterId).toBe('monster-a');
  });

  it('does nothing when there is no active patron', () => {
    handleRaceUpdate(makeRaceData({ raceId: 'race-1' }));
    expect(get(patronFledEvent)).toBeNull();
  });

  it('falls back to a generic label when monsterName was never recorded', () => {
    patron.set({ monsterId: 'monster-a', monsterName: null, cooldownRaces: 0, trustCooldownRaces: 0, lastSeenRaceId: 'race-0' });

    handleRaceUpdate(makeRaceData({ raceId: 'race-1', monsters: [{ id: 'monster-b', name: 'Monster B' }] }));

    expect(get(patronFledEvent)).toBe('Your patron');
  });
});

// ─── handleRaceUpdate — racesSincePledged ──────────────────────────────────────

describe('handleRaceUpdate — racesSincePledged', () => {
  it('increments once per new race while the patron survives', () => {
    patron.set({ monsterId: 'monster-a', monsterName: 'Monster A', cooldownRaces: 0, trustCooldownRaces: 0, lastSeenRaceId: 'race-0', racesSincePledged: 1 });

    handleRaceUpdate(makeRaceData({ raceId: 'race-1', monsters: [{ id: 'monster-a', name: 'Monster A' }] }));
    expect(get(patron).racesSincePledged).toBe(2);

    handleRaceUpdate(makeRaceData({ raceId: 'race-2', monsters: [{ id: 'monster-a', name: 'Monster A' }] }));
    expect(get(patron).racesSincePledged).toBe(3);
  });

  it('does not increment again for a repeated broadcast of the same race', () => {
    patron.set({ monsterId: 'monster-a', monsterName: 'Monster A', cooldownRaces: 0, trustCooldownRaces: 0, lastSeenRaceId: 'race-1', racesSincePledged: 2 });

    handleRaceUpdate(makeRaceData({ raceId: 'race-1', monsters: [{ id: 'monster-a', name: 'Monster A' }] }));

    expect(get(patron).racesSincePledged).toBe(2);
  });

  it('resets to 0 when the patron flees', () => {
    patron.set({ monsterId: 'monster-a', monsterName: 'Monster A', cooldownRaces: 0, trustCooldownRaces: 0, lastSeenRaceId: 'race-0', racesSincePledged: 4 });

    handleRaceUpdate(makeRaceData({ raceId: 'race-1', monsters: [{ id: 'monster-b', name: 'Monster B' }] }));

    expect(get(patron).racesSincePledged).toBe(0);
  });
});

// ─── clearPatronFledEvent ──────────────────────────────────────────────────────

describe('clearPatronFledEvent', () => {
  it('resets patronFledEvent to null', () => {
    patronFledEvent.set('Monster A');
    clearPatronFledEvent();
    expect(get(patronFledEvent)).toBeNull();
  });
});

// ─── derived status stores ─────────────────────────────────────────────────────

describe('derived patron status stores', () => {
  it('isBonded is true with an active patron and no trust cooldown', () => {
    patron.set({ monsterId: 'monster-a', monsterName: 'Monster A', cooldownRaces: 0, trustCooldownRaces: 0, lastSeenRaceId: null });
    expect(get(isBonded)).toBe(true);
    expect(get(isDistrusted)).toBe(false);
    expect(get(isOathbreakerCooldown)).toBe(false);
  });

  it('isDistrusted is true with an active patron and a trust cooldown', () => {
    patron.set({ monsterId: 'monster-a', monsterName: 'Monster A', cooldownRaces: 0, trustCooldownRaces: 2, lastSeenRaceId: null });
    expect(get(isBonded)).toBe(false);
    expect(get(isDistrusted)).toBe(true);
    expect(get(isOathbreakerCooldown)).toBe(false);
  });

  it('isOathbreakerCooldown is true with no patron and a pending cooldown', () => {
    patron.set({ monsterId: null, monsterName: null, cooldownRaces: 3, trustCooldownRaces: 0, lastSeenRaceId: null });
    expect(get(isBonded)).toBe(false);
    expect(get(isDistrusted)).toBe(false);
    expect(get(isOathbreakerCooldown)).toBe(true);
  });

  it('all three are false with no patron and no cooldowns', () => {
    expect(get(isBonded)).toBe(false);
    expect(get(isDistrusted)).toBe(false);
    expect(get(isOathbreakerCooldown)).toBe(false);
  });
});

// ─── pledgePatron / breakPact ─────────────────────────────────────────────────

describe('pledgePatron', () => {
  it('records the patron and keeps its name after applying the server state', async () => {
    apiPledgePatron.mockResolvedValue({
      success: true,
      patron: { monsterId: 'monster-a', cooldownRaces: 0, trustCooldownRaces: 0 },
    });

    await pledgePatron({ id: 'monster-a', name: 'Monster A' });

    const state = get(patron);
    expect(state.monsterId).toBe('monster-a');
    expect(state.monsterName).toBe('Monster A');
    expect(state.racesSincePledged).toBe(1);
  });

  it('maps server reason codes to in-world text', async () => {
    apiPledgePatron.mockRejectedValue(new Error('betting_closed'));
    await expect(pledgePatron({ id: 'monster-a', name: 'Monster A' }))
      .rejects.toThrow('The rites are sealed until the next race is called.');
  });

  it('passes through messages it has no mapping for', async () => {
    apiPledgePatron.mockRejectedValue(new Error('Invalid or expired session'));
    await expect(pledgePatron({ id: 'monster-a', name: 'Monster A' }))
      .rejects.toThrow('Invalid or expired session');
  });
});

describe('breakPact', () => {
  it('applies the fined balance, its token, and the cooldown from the server', async () => {
    patron.update(p => ({ ...p, monsterId: 'monster-a', monsterName: 'Monster A' }));
    apiBreakPact.mockResolvedValue({
      success: true,
      candyBalance: 88,
      balanceToken: 'token-after-fine',
      patron: { monsterId: null, cooldownRaces: 3, trustCooldownRaces: 0 },
    });

    await breakPact();

    expect(get(candies)).toBe(88);
    expect(get(balanceToken)).toBe('token-after-fine');
    expect(get(patron).monsterId).toBeNull();
    expect(get(patron).cooldownRaces).toBe(3);
    expect(get(isOathbreakerCooldown)).toBe(true);
  });

  it('maps server reason codes to in-world text', async () => {
    apiBreakPact.mockRejectedValue(new Error('no_active_patron'));
    await expect(breakPact()).rejects.toThrow('There is no pact left to break.');
  });
});

// ─── confirmedBet sync ────────────────────────────────────────────────────────

describe('confirmed bet sync', () => {
  it('turns the patron distrusted as soon as a betrayal bet is confirmed', () => {
    patron.update(p => ({ ...p, monsterId: 'monster-a', monsterName: 'Monster A' }));
    expect(get(isBonded)).toBe(true);

    confirmedBet.set({
      success: true,
      patron: { monsterId: 'monster-a', cooldownRaces: 0, trustCooldownRaces: 2 },
    });

    expect(get(isDistrusted)).toBe(true);
    expect(get(patron).monsterName).toBe('Monster A');
  });

  it('ignores a bet response without patron state', () => {
    patron.update(p => ({ ...p, monsterId: 'monster-a' }));
    confirmedBet.set({ success: true });
    expect(get(patron).monsterId).toBe('monster-a');
  });
});
