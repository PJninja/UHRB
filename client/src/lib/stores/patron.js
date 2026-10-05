// Patron system store — pledging, breaking the pact, and fled-patron detection.
import { writable, derived, get } from 'svelte/store';
import { persistedStore } from './persistence.js';
import {
  pledgePatron as apiPledgePatron,
  breakPact as apiBreakPact,
  validateSession as apiValidateSession,
} from '../services/api.js';
import { sessionId } from './session.js';
import { setCandyBalance, confirmedBet } from './game.js';

const initialPatronState = {
  monsterId: null,
  monsterName: null,
  cooldownRaces: 0,
  trustCooldownRaces: 0,
  lastSeenRaceId: null,
  racesSincePledged: 0,
};

export const patron = persistedStore('patron', initialPatronState);

// Set to the fled patron's name whenever handleRaceUpdate detects a patron
// failed to return this race — components subscribe to show a toast, then
// should call clearPatronFledEvent() once shown.
export const patronFledEvent = writable(null);

export function clearPatronFledEvent() {
  patronFledEvent.set(null);
}

// Server reason codes → in-world text. Anything unmapped (network failures,
// 401s) falls through with its original message.
const PATRON_ERROR_TEXT = {
  already_pledged: 'You are already bound to another horror.',
  cooling_down: 'The horrors will not hear your oath yet.',
  no_active_patron: 'There is no pact left to break.',
  betting_closed: 'The rites are sealed until the next race is called.',
};

function patronError(err) {
  return new Error(PATRON_ERROR_TEXT[err?.message] || err?.message || 'The ritual failed.');
}

/**
 * Pledge patronage to a monster in the current race.
 * @param {{ id: string, name: string }} monster
 */
export async function pledgePatron(monster) {
  const session = get(sessionId);
  if (!session) throw new Error('No session ID');

  let response;
  try {
    response = await apiPledgePatron(session, monster.id);
  } catch (err) {
    // A rejection usually means the server's view differs from ours (another
    // tab pledged, a cooldown we missed) — resync so the UI stops offering it.
    reconcilePatronState();
    throw patronError(err);
  }
  patron.update(p => ({ ...p, monsterId: monster.id, monsterName: monster.name, racesSincePledged: 1 }));
  applyServerPatron(response.patron);
  return response;
}

/**
 * Break an active patron pact early — costs a candy fine and starts a cooldown.
 * @returns {Promise<{success: boolean, candyBalance: number, balanceToken: string, patron: object}>}
 */
export async function breakPact() {
  const session = get(sessionId);
  if (!session) throw new Error('No session ID');

  let response;
  try {
    response = await apiBreakPact(session);
  } catch (err) {
    reconcilePatronState();
    throw patronError(err);
  }
  // The fine is charged server-side — take the new balance and its signed
  // token so the displayed candies and persisted token both reflect it.
  setCandyBalance(response.candyBalance, response.balanceToken);
  applyServerPatron(response.patron);
  return response;
}

/**
 * Handle a WebSocket race:update payload. Runs its per-race logic exactly
 * once per new raceId, not once per broadcast within the same race.
 * @param {object} raceData
 */
export function handleRaceUpdate(raceData) {
  const state = get(patron);
  if (!raceData?.raceId || raceData.raceId === state.lastSeenRaceId) return;

  if (state.monsterId) {
    const stillInRoster = (raceData.monsters || []).some(m => m.id === state.monsterId);
    if (!stillInRoster) {
      patronFledEvent.set(state.monsterName || 'Your patron');
      patron.update(p => ({ ...p, monsterId: null, monsterName: null, racesSincePledged: 0 }));
    } else {
      patron.update(p => ({ ...p, racesSincePledged: p.racesSincePledged + 1 }));
    }
  }

  patron.update(p => ({ ...p, lastSeenRaceId: raceData.raceId }));

  // The local roster diff above is an optimistic immediate signal; reconcile
  // against the server's authoritative cooldown counters right after.
  reconcilePatronState();
}

/**
 * Refetch authoritative patron state from the server (cooldown counters can't
 * be derived from the public race broadcast — they're per-session).
 */
async function reconcilePatronState() {
  const session = get(sessionId);
  if (!session) return;

  try {
    const result = await apiValidateSession(session);
    applyServerPatron(result?.patron);
  } catch {
    // Best-effort — local optimistic state stands until the next reconcile.
  }
}

/**
 * Overwrite local patron state with the server's authoritative view. Keeps
 * the display name and pledge counter only while the patron is unchanged.
 * @param {{ monsterId: string|null, cooldownRaces: number, trustCooldownRaces: number }|null|undefined} serverPatron
 */
function applyServerPatron(serverPatron) {
  if (!serverPatron) return;

  patron.update(p => {
    const monsterId = serverPatron.monsterId;
    const stillSamePatron = monsterId && monsterId === p.monsterId;
    return {
      ...p,
      monsterId,
      monsterName: stillSamePatron ? p.monsterName : null,
      cooldownRaces: serverPatron.cooldownRaces,
      trustCooldownRaces: serverPatron.trustCooldownRaces,
      racesSincePledged: stillSamePatron ? p.racesSincePledged : 0,
    };
  });
}

// A bet on a rival marks a betrayal server-side; the bet response carries the
// updated counters so the chip and card turn distrusted right away instead of
// on the next race.
confirmedBet.subscribe(response => applyServerPatron(response?.patron));

// Derived convenience stores for the status chip.
export const isBonded = derived(patron, $p => !!$p.monsterId && $p.trustCooldownRaces === 0);
export const isDistrusted = derived(patron, $p => !!$p.monsterId && $p.trustCooldownRaces > 0);
export const isOathbreakerCooldown = derived(patron, $p => !$p.monsterId && $p.cooldownRaces > 0);
