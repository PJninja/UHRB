<script>
  import { push } from 'svelte-spa-router';
  import { history } from '../lib/stores/history.js';
  import { candies } from '../lib/stores/game.js';

  // Get the most recent race from history
  $: latestRace = $history.length > 0 ? $history[0] : null;
  $: winner = latestRace?.winner;
  $: rankings = latestRace?.monsters || [];
  $: playerBet = latestRace?.bet;
  $: playerWon = latestRace?.won || false;
  $: payout = latestRace?.payout || 0;

  function goToHome() {
    // Server handles race scheduling automatically
    push('/');
  }

  function goToHistory() {
    push('/history');
  }

  // Calculate net profit/loss
  $: netChange = playerBet ? (playerWon ? payout - playerBet.amount : -playerBet.amount) : 0;
</script>

<div class="results-page">
  <div class="header">
    <h1>Race Results</h1>
  </div>

  {#if latestRace}
    <!-- Winner Banner -->
    <div class="winner-banner card">
      <div class="winner-icon">👑</div>
      <div class="winner-info">
        <p class="winner-label">Winner</p>
        <h2 class="winner-name">{winner.name}</h2>
        <p class="winner-location text-muted">{winner.location}</p>
        <p class="champion-note">This horror shall return to face the next summoning.</p>
      </div>
    </div>

    <!-- Player Result -->
    {#if playerBet}
      <div class="player-result card" class:won={playerWon} class:lost={!playerWon}>
        {#if playerWon}
          <h3 class="result-title win-title">Victory!</h3>
          <p class="result-message">Your horror triumphed over the competition!</p>
          <div class="result-details">
            <div class="detail-row">
              <span class="label">Bet Amount:</span>
              <span class="value">{playerBet.amount} ✦</span>
            </div>
            <div class="detail-row">
              <span class="label">Payout:</span>
              <span class="value text-candy">{payout} ✦</span>
            </div>
            <div class="detail-row profit">
              <span class="label">Net Profit:</span>
              <span class="value profit-value">+{netChange} ✦</span>
            </div>
          </div>
        {:else}
          <h3 class="result-title lose-title">Defeat</h3>
          <p class="result-message">The void claims your candies...</p>
          <div class="result-details">
            <div class="detail-row">
              <span class="label">Lost:</span>
              <span class="value loss-value">-{playerBet.amount} ✦</span>
            </div>
          </div>
        {/if}
        <div class="current-balance">
          <span class="label">Current Balance:</span>
          <span class="value text-candy">{$candies} ✦</span>
        </div>
      </div>
    {:else}
      <div class="no-bet-message card">
        <p class="text-muted">You did not bet on this race</p>
      </div>
    {/if}

    <!-- Rankings Table -->
    <div class="rankings card">
      <h3>Final Rankings</h3>
      <div class="rankings-list">
        {#each rankings as monster, index}
          <div class="ranking-row" class:winner-row={index === 0} class:player-bet={playerBet && monster.id === playerBet.monsterId}>
            <span class="position">#{index + 1}</span>
            <span class="horror-name">{monster.name}</span>
            {#if index === 0}
              <span class="trophy">👑</span>
            {/if}
            {#if playerBet && monster.id === playerBet.monsterId}
              <span class="bet-marker">★</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Actions -->
    <div class="actions">
      <button class="button button-primary" on:click={goToHome}>
        Next Race
      </button>
      <button class="button button-secondary" on:click={goToHistory}>
        View History
      </button>
    </div>
  {:else}
    <div class="no-results card">
      <p class="text-muted">No race results available</p>
      <button class="button button-primary" on:click={goToHome}>
        Return to Home
      </button>
    </div>
  {/if}
</div>

<style>
  .results-page {
    padding: 2rem;
    max-width: 900px;
    margin: 0 auto;
    min-height: 100vh;
  }

  .header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .winner-banner {
    display: flex;
    align-items: center;
    gap: 2rem;
    padding: 2rem;
    margin-bottom: 2rem;
    background: linear-gradient(
      135deg,
      var(--bg-card) 0%,
      rgba(201, 169, 97, 0.1) 100%
    );
    border-color: var(--candy-color);
  }

  .winner-icon {
    font-size: 4rem;
    line-height: 1;
  }

  .winner-info {
    flex: 1;
  }

  .winner-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--text-secondary);
    margin: 0 0 0.5rem 0;
  }

  .winner-name {
    font-size: 2.5rem;
    color: var(--candy-color);
    margin: 0 0 0.5rem 0;
    line-height: 1.1;
  }

  .winner-location {
    font-size: 1rem;
    margin: 0;
  }

  .champion-note {
    margin: 0.5rem 0 0;
    font-size: 0.8rem;
    font-style: italic;
    color: var(--candy-color);
    opacity: 0.8;
  }

  .player-result {
    padding: 2rem;
    margin-bottom: 2rem;
    text-align: center;
  }

  .player-result.won {
    background: linear-gradient(
      135deg,
      var(--bg-card) 0%,
      rgba(61, 122, 92, 0.2) 100%
    );
    border-color: var(--eldritch-green);
  }

  .player-result.lost {
    background: linear-gradient(
      135deg,
      var(--bg-card) 0%,
      rgba(139, 58, 58, 0.2) 100%
    );
    border-color: var(--eldritch-red);
  }

  .result-title {
    font-size: 2.5rem;
    margin: 0 0 1rem 0;
    text-transform: uppercase;
    letter-spacing: 6px;
  }

  .win-title {
    color: var(--eldritch-green);
  }

  .lose-title {
    color: var(--eldritch-red);
  }

  .result-message {
    font-size: 1.2rem;
    margin: 0 0 2rem 0;
    color: var(--text-secondary);
  }

  .result-details {
    background: var(--bg-secondary);
    border: 2px solid var(--border-ancient);
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 1.1rem;
  }

  .detail-row.profit {
    border-top: 2px solid var(--border-ancient);
    padding-top: 1rem;
    margin-top: 0.5rem;
  }

  .detail-row .label {
    color: var(--text-secondary);
    text-transform: uppercase;
    font-size: 0.85rem;
    letter-spacing: 1px;
  }

  .detail-row .value {
    font-weight: 700;
    font-size: 1.2rem;
  }

  .profit-value {
    color: var(--eldritch-green);
    font-size: 1.5rem;
  }

  .loss-value {
    color: var(--eldritch-red);
    font-size: 1.3rem;
  }

  .current-balance {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: var(--bg-secondary);
    border: 2px solid var(--border-ancient);
    font-size: 1.1rem;
  }

  .current-balance .label {
    color: var(--text-secondary);
    text-transform: uppercase;
    font-size: 0.85rem;
    letter-spacing: 1px;
  }

  .current-balance .value {
    font-weight: 700;
    font-size: 1.3rem;
  }

  .no-bet-message {
    text-align: center;
    padding: 2rem;
    margin-bottom: 2rem;
  }

  .rankings {
    margin-bottom: 2rem;
  }

  .rankings h3 {
    margin: 0 0 1.5rem 0;
    text-align: center;
  }

  .rankings-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .ranking-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--bg-secondary);
    border: 2px solid var(--border-ancient);
    transition: all 0.2s ease;
  }

  .ranking-row.winner-row {
    border-color: var(--candy-color);
    background: linear-gradient(
      90deg,
      rgba(201, 169, 97, 0.1) 0%,
      var(--bg-secondary) 100%
    );
  }

  .ranking-row.player-bet {
    border-color: var(--eldritch-purple);
  }

  .ranking-row .position {
    font-family: 'Cinzel', serif;
    font-weight: 900;
    font-size: 1.5rem;
    color: var(--text-accent);
    min-width: 50px;
  }

  .ranking-row .horror-name {
    flex: 1;
    font-weight: 700;
    font-size: 1.1rem;
  }

  .ranking-row .trophy {
    font-size: 1.5rem;
  }

  .ranking-row .bet-marker {
    color: var(--candy-color);
    font-size: 1.5rem;
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .actions .button {
    width: 100%;
    padding: 1rem;
    font-size: 1rem;
  }

  .no-results {
    text-align: center;
    padding: 3rem 2rem;
  }

  .no-results p {
    margin-bottom: 2rem;
    font-size: 1.1rem;
  }

  @media (max-width: 768px) {
    .winner-banner {
      flex-direction: column;
      text-align: center;
    }

    .actions {
      grid-template-columns: 1fr;
    }

    .winner-name {
      font-size: 2rem;
    }

    .result-title {
      font-size: 2rem;
    }
  }
</style>
