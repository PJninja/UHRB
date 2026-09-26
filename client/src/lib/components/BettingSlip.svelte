<script>
  import { createEventDispatcher } from 'svelte';
  import { candies, currentBet, serverRaceState, MERCY_BALANCE } from '../stores/game.js';
  import { placeBet, clearBet } from '../stores/game.js';
  import { formatOdds } from '../utils/odds.js';
  import RichText from './RichText.svelte';

  const dispatch = createEventDispatcher();

  export let selectedMonster = null;
  export let monsters = [];

  let betAmount = 10;
  let betError = null;

  $: hasActiveBet = $currentBet !== null && $currentBet.raceId === $serverRaceState.raceId;
  // A pending bet hasn't been lost yet — count it back into the balance so
  // the player isn't branded broke while it could still win.
  $: isBroke = $candies + (hasActiveBet ? $currentBet.amount : 0) <= MERCY_BALANCE;
  $: maxBet = $candies;
  $: canPlaceBet = selectedMonster && betAmount >= 1 && betAmount <= maxBet;
  $: if (selectedMonster) betError = null;

  $: odds = $serverRaceState.odds ?? {};
  $: selectedOdds = selectedMonster ? (odds[selectedMonster.id] ?? 0) : 0;
  $: potentialPayout = selectedMonster ? Math.floor(betAmount * selectedOdds) : 0;

  async function handlePlaceBet() {
    if (canPlaceBet && selectedMonster) {
      betError = null;
      try {
        const amount = Math.floor(Number(betAmount));
        await placeBet(selectedMonster.id, amount);
        dispatch('placed', { monsterId: selectedMonster.id, amount });
      } catch {
        betError = 'Bet failed — please try again.';
      }
    }
  }

  async function handleClearBet() {
    betError = null;
    try {
      await clearBet();
      betAmount = 10;
    } catch (error) {
      console.error('Failed to clear bet:', error);
      betError = 'Failed to cancel bet — please try again.';
    }
  }

  function setBetPercentage(percentage) {
    betAmount = Math.floor($candies * percentage);
    if (betAmount < 1) betAmount = 1;
  }

  // Get horror name from current bet
  $: currentBetMonster = hasActiveBet && monsters.length > 0
    ? monsters.find(m => m.id === $currentBet.monsterId)
    : null;
</script>

<div class="betting-slip card" class:beggars-wager={isBroke}>
  <h3>{isBroke ? "Beggar's Wager" : 'Betting Slip'}</h3>

  {#if isBroke}
    <div class="void-ledger">
      <span class="seal">🕮</span>
      <p class="ledger-text">
        <RichText text="The <ancient>Hollow Ledger</ancient> has marked you. <madness>You are given pity... at what cost</madness>" />
      </p>
    </div>
  {/if}

  <div class="balance-display">
    <span class="label">Your Candies:</span>
    <span class="value text-candy">✦ {$candies}</span>
  </div>

  {#if hasActiveBet}
    <div class="active-bet">
      <div class="bet-info">
        <p class="bet-label">Current Bet</p>
        <p class="bet-monster">{currentBetMonster?.name || 'Unknown Horror'}</p>
        <p class="bet-amount text-candy">{$currentBet.amount} Candies</p>
      </div>
      <button class="button button-danger" on:click={handleClearBet}>
        Clear Bet
      </button>
    </div>
  {:else}
    <div class="bet-form">
      {#if selectedMonster}
        <div class="selected-monster">
          <span class="label">Selected:</span>
          <span class="value">{selectedMonster.name}</span>
        </div>
        <div class="odds-display">
          <div class="odds-row">
            <span class="label">Odds:</span>
            <span class="value">{formatOdds(selectedOdds)}</span>
          </div>
          <div class="odds-row">
            <span class="label">Potential Payout:</span>
            <span class="value text-candy">{potentialPayout} ✦</span>
          </div>
        </div>
      {/if}

      <div class="bet-amount-input">
        <label for="bet-amount">Bet Amount:</label>
        <input
          type="number"
          id="bet-amount"
          bind:value={betAmount}
          min="1"
          max={maxBet}
          disabled={!selectedMonster}
        />
      </div>

      <div class="quick-bet-buttons">
        <button
          class="button button-secondary quick-bet"
          on:click={() => setBetPercentage(0.25)}
          disabled={!selectedMonster || $candies < 4}
        >
          25%
        </button>
        <button
          class="button button-secondary quick-bet"
          on:click={() => setBetPercentage(0.5)}
          disabled={!selectedMonster || $candies < 2}
        >
          50%
        </button>
        <button
          class="button button-secondary quick-bet"
          on:click={() => setBetPercentage(1)}
          disabled={!selectedMonster}
        >
          All In
        </button>
      </div>

      {#if betError}
        <p class="bet-error">{betError}</p>
      {/if}

      <button
        class="button button-primary place-bet"
        on:click={handlePlaceBet}
        disabled={!canPlaceBet}
      >
        Place Bet
      </button>
    </div>
  {/if}
</div>

<style>
  .betting-slip {
    background: linear-gradient(180deg, var(--bg-card) 0%, #1a1e28 100%);
    position: sticky;
    top: 1rem;
  }

  .betting-slip h3 {
    margin: 0 0 1rem 0;
    text-align: center;
  }

  /* ── Beggar's Wager (idea 3): desaturated, tattered skin at the mercy floor ── */
  .betting-slip.beggars-wager {
    border-color: #5a5a62;
    border-style: dashed;
    filter: saturate(0.55);
  }

  .betting-slip.beggars-wager h3 {
    color: #8a8a90;
    letter-spacing: 2px;
  }

  /* ── Void Ledger (idea 1): flavor banner while broke ── */
  .void-ledger {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.75rem;
    margin-bottom: 1rem;
    background: rgba(10, 6, 8, 0.4);
    border: 2px solid #5a5a62;
  }

  .void-ledger .seal {
    font-size: 1.3rem;
    line-height: 1;
    opacity: 0.7;
    flex-shrink: 0;
  }

  .void-ledger .ledger-text {
    margin: 0;
    font-size: 0.85rem;
    font-style: italic;
    line-height: 1.4;
  }

  .balance-display {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: var(--bg-secondary);
    border: 2px solid var(--border-ancient);
    margin-bottom: 1.5rem;
  }

  .balance-display .label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-secondary);
  }

  .balance-display .value {
    font-size: 1.5rem;
    font-weight: 700;
  }

  .active-bet {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .bet-info {
    background: var(--bg-secondary);
    padding: 1rem;
    border: 3px solid var(--eldritch-purple);
    text-align: center;
  }

  .bet-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--text-secondary);
    margin: 0 0 0.5rem 0;
  }

  .bet-monster {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--eldritch-purple);
    margin: 0 0 0.5rem 0;
  }

  .bet-amount {
    font-size: 1.3rem;
    font-weight: 700;
    margin: 0;
  }

  .bet-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .selected-monster {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border: 2px solid var(--border-ancient);
  }

  .selected-monster .label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-secondary);
  }

  .selected-monster .value {
    font-weight: 700;
    color: var(--eldritch-purple);
  }

  .odds-display {
    background: var(--bg-secondary);
    border: 2px solid var(--border-ancient);
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .odds-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .odds-row .label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-secondary);
  }

  .odds-row .value {
    font-weight: 700;
    font-size: 1.1rem;
  }

  .bet-amount-input {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .bet-amount-input label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-secondary);
    font-weight: 600;
  }

  .bet-amount-input input {
    width: 100%;
    font-size: 1.2rem;
    font-weight: 700;
    text-align: center;
  }

  .quick-bet-buttons {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .quick-bet {
    padding: 0.5rem;
    font-size: 0.75rem;
  }

  .bet-error {
    color: var(--eldritch-red);
    font-size: 0.8rem;
    font-style: italic;
    text-align: center;
    margin: 0;
  }

  .place-bet {
    width: 100%;
    padding: 1rem;
    font-size: 1rem;
  }
</style>
