<script>
  import { push } from 'svelte-spa-router';
  import { serverRaceState, currentBet } from '../stores/game.js';
  import { history } from '../stores/history.js';
  import { formatOdds } from '../utils/odds.js';
  import { patron, pledgePatron } from '../stores/patron.js';
  import ConfirmDialog from './ConfirmDialog.svelte';

  export let monster;

  $: odds = $serverRaceState.odds?.[monster.id];
  $: bettingOpen = $serverRaceState.state === 'waiting';
  $: hasBetOnThis = $currentBet?.monsterId === monster.id;
  $: raceFinished = $serverRaceState.state === 'finished';

  // Latest history entry — written by Race.svelte after payout validation
  $: latestResult = $history[0];
  $: resultIsForThisMonster = latestResult?.bet?.monsterId === monster.id;
  $: won = raceFinished && resultIsForThisMonster && latestResult?.won;
  $: lost = raceFinished && resultIsForThisMonster && !latestResult?.won;

  // Pledging is only offered for a horror currently in the live roster, while
  // betting is open, the player has no other active patron, and isn't cooling
  // down from breaking one. The server enforces the same rules.
  $: inLiveRoster = $serverRaceState.monsters.some(m => m.id === monster.id);
  $: bettingOpen = $serverRaceState.state === 'waiting';
  $: canPledge = inLiveRoster && bettingOpen && !monster.isLegendary && !$patron.monsterId && $patron.cooldownRaces === 0;
  $: isCurrentPatron = $patron.monsterId === monster.id;

  let showPledgeConfirm = false;
  let pledging = false;
  let pledgeError = null;

  async function confirmPledge() {
    showPledgeConfirm = false;
    pledging = true;
    pledgeError = null;
    try {
      await pledgePatron(monster);
    } catch (err) {
      pledgeError = err.message;
    } finally {
      pledging = false;
    }
  }
</script>

<div class="betting-context card" class:state-bet={hasBetOnThis} class:state-won={won} class:state-lost={lost}>
  {#if won}
    <div class="context-state victory">
      <div class="state-icon">✦</div>
      <h3 class="state-title">Victory</h3>
      <p class="state-msg">The void favoured your wager.</p>
      <div class="result-line">
        <span class="label">Payout</span>
        <span class="value gold">{latestResult.payout} ✦</span>
      </div>
      <div class="result-line">
        <span class="label">Bet</span>
        <span class="value">{latestResult.bet.amount} ✦</span>
      </div>
    </div>

  {:else if lost}
    <div class="context-state defeat">
      <div class="state-icon">✦</div>
      <h3 class="state-title">Defeat</h3>
      <p class="state-msg">The void claims your candies.</p>
      <div class="result-line">
        <span class="label">Lost</span>
        <span class="value red">−{latestResult.bet.amount} ✦</span>
      </div>
    </div>

  {:else if hasBetOnThis}
    <div class="context-state pending">
      <div class="state-icon pending-pulse">⧖</div>
      <h3 class="state-title">Bet Placed</h3>
      <p class="state-msg">Awaiting the race...</p>
      <div class="result-line">
        <span class="label">Wagered</span>
        <span class="value gold">{$currentBet.amount} ✦</span>
      </div>
      {#if odds}
        <div class="result-line">
          <span class="label">Odds</span>
          <span class="value">{formatOdds(odds)}</span>
        </div>
      {/if}
    </div>

  {:else}
    <div class="context-state default">
      <div class="odds-label">Current Odds</div>
      {#if odds}
        <div class="odds-value">{formatOdds(odds)}</div>
      {:else}
        <div class="odds-value">—</div>
      {/if}
    </div>
  {/if}

  {#if isCurrentPatron}
    <div class="patron-note" class:distrusted={$patron.trustCooldownRaces > 0}>
      <p class="patron-note-title">⛧ Your Patron</p>
      <p class="patron-note-detail">
        Pledged for {$patron.racesSincePledged} {$patron.racesSincePledged === 1 ? 'race' : 'races'}
      </p>
      {#if $patron.trustCooldownRaces > 0}
        <p class="patron-note-detail distrusted">
          Trust wavers — favor returns in {$patron.trustCooldownRaces} {$patron.trustCooldownRaces === 1 ? 'race' : 'races'}
        </p>
      {/if}
    </div>
  {:else if canPledge}
    <button
      class="button button-primary pledge-btn"
      on:click={() => (showPledgeConfirm = true)}
      disabled={pledging}
    >
      {pledging ? 'Pledging…' : 'Pledge Patronage'}
    </button>
    {#if pledgeError}
      <p class="pledge-error">{pledgeError}</p>
    {/if}
  {/if}

  <button class="button button-secondary back-btn" on:click={() => push('/')}>
    ← Back to Race
  </button>
</div>

{#if showPledgeConfirm}
  <ConfirmDialog
    message={`Are you sure you want to pledge patronage to ${monster.name}? While they are in the race pool they will not take kindly to you betting on rivals or breaking this pact.`}
    confirmLabel="Pledge Patronage"
    on:confirm={confirmPledge}
    on:cancel={() => (showPledgeConfirm = false)}
  />
{/if}

<style>
  .betting-context {
    position: sticky;
    top: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 1.5rem;
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
  }

  /* State-driven card borders */
  .betting-context.state-bet {
    border-color: var(--candy-color);
    box-shadow: 0 0 20px rgba(201, 169, 97, 0.25), var(--shadow);
  }

  .betting-context.state-won {
    border-color: var(--eldritch-green);
    box-shadow: 0 0 24px rgba(61, 122, 92, 0.35), var(--shadow);
  }

  .betting-context.state-lost {
    border-color: var(--eldritch-red);
    box-shadow: 0 0 20px rgba(139, 58, 58, 0.3), var(--shadow);
  }

  /* ── State containers ── */
  .context-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.5rem;
  }

  .state-icon {
    font-size: 2rem;
    line-height: 1;
    margin-bottom: 0.25rem;
  }

  .state-title {
    font-family: 'Cinzel', serif;
    font-size: 1.5rem;
    letter-spacing: 4px;
    text-transform: uppercase;
    margin: 0;
  }

  .victory .state-icon  { color: var(--eldritch-green); }
  .victory .state-title { color: var(--eldritch-green); }

  .defeat .state-icon  { color: var(--eldritch-red); }
  .defeat .state-title { color: var(--eldritch-red); }

  .pending .state-title { color: var(--candy-color); }

  .pending-pulse {
    animation: icon-pulse 1.5s ease-in-out infinite;
    color: var(--candy-color);
  }

  @keyframes icon-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.6; transform: scale(0.9); }
  }

  .state-msg {
    color: var(--text-secondary);
    font-size: 0.9rem;
    font-style: italic;
    margin: 0.25rem 0 0.75rem;
  }

  /* ── Result lines ── */
  .result-line {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-ancient);
    font-size: 0.95rem;
  }

  .result-line .label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-secondary);
  }

  .result-line .value { font-weight: 700; }
  .result-line .value.gold { color: var(--candy-color); }
  .result-line .value.red  { color: var(--eldritch-red); }

  /* ── Default odds display ── */
  .default {
    gap: 0.25rem;
  }

  .odds-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--text-secondary);
  }

  .odds-value {
    font-family: 'Cinzel', serif;
    font-size: 3rem;
    font-weight: 900;
    color: var(--candy-color);
    line-height: 1;
    margin: 0.25rem 0;
  }

  /* ── Patronage ── */
  .patron-note {
    padding: 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--eldritch-green);
    text-align: center;
  }

  .patron-note.distrusted {
    border-color: var(--eldritch-red);
  }

  .patron-note-title {
    font-family: 'Cinzel', serif;
    letter-spacing: 1px;
    color: var(--eldritch-green);
    margin: 0 0 0.25rem;
  }

  .patron-note.distrusted .patron-note-title {
    color: var(--eldritch-red);
  }

  .patron-note-detail {
    font-size: 0.8rem;
    color: var(--text-secondary);
    margin: 0;
  }

  .patron-note-detail.distrusted {
    color: var(--eldritch-red);
    margin-top: 0.25rem;
  }

  .pledge-btn {
    width: 100%;
    font-size: 0.8rem;
    padding: 0.6rem 1rem;
  }

  .pledge-error {
    color: var(--eldritch-red);
    font-size: 0.85rem;
    font-style: italic;
    text-align: center;
    margin: -0.5rem 0 0;
  }

  /* ── Back button ── */
  .back-btn {
    width: 100%;
    font-size: 0.85rem;
    padding: 0.6rem 1rem;
    margin-top: 0.25rem;
  }

  @media (max-width: 768px) {
    .betting-context {
      position: static;
    }
  }
</style>
