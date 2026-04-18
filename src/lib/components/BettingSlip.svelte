<script>
  import { candies, currentBet, serverRaceState } from '../stores/game.js';
  import { placeBet, clearBet } from '../stores/game.js';

  export let selectedMonster = null;
  export let monsters = [];

  let betAmount = 10;

  $: maxBet = $candies;
  $: canPlaceBet = selectedMonster && betAmount >= 1 && betAmount <= maxBet;
  $: hasActiveBet = $currentBet !== null;

  $: odds = $serverRaceState.odds ?? {};
  $: selectedOdds = selectedMonster ? (odds[selectedMonster.id] ?? 0) : 0;
  $: potentialPayout = selectedMonster ? Math.floor(betAmount * selectedOdds) : 0;

  function handlePlaceBet() {
    if (canPlaceBet && selectedMonster) {
      placeBet(selectedMonster.id, betAmount);
    }
  }

  function handleClearBet() {
    clearBet();
    betAmount = 10;
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

<div class="betting-slip card">
  <h3>Betting Slip</h3>

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
            <span class="value">{selectedOdds}x</span>
          </div>
          <div class="odds-row">
            <span class="label">Potential Payout:</span>
            <span class="value text-candy">{potentialPayout} ✦</span>
          </div>
        </div>
      {:else}
        <p class="no-selection text-muted">Select a horror to begin</p>
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

  .no-selection {
    text-align: center;
    padding: 1rem;
    font-style: italic;
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

  .place-bet {
    width: 100%;
    padding: 1rem;
    font-size: 1rem;
  }
</style>
