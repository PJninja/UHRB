<script>
  import { push } from 'svelte-spa-router';
  import { history, historyStats, clearHistory } from '../lib/stores/history.js';

  let confirmingClear = false;

  function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60)  return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)  return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)    return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function formatNet(n) {
    return n >= 0 ? `+${n}` : `${n}`;
  }

  function betMonsterName(race) {
    if (!race.bet) return null;
    const m = race.monsters?.find(m => m.id === race.bet.monsterId);
    return m?.name ?? '—';
  }

  function netChange(race) {
    if (!race.bet) return null;
    return race.won ? race.payout - race.bet.amount : -race.bet.amount;
  }

  function handleClear() {
    if (confirmingClear) {
      clearHistory();
      confirmingClear = false;
    } else {
      confirmingClear = true;
    }
  }

  function cancelClear() {
    confirmingClear = false;
  }
</script>

<div class="history-page">
  <div class="header">
    <h1>The Chronicle</h1>
  </div>

  {#if $history.length === 0}
    <div class="empty-state card">
      <div class="empty-icon">ᛟ</div>
      <p class="empty-title">The ledger is empty.</p>
      <p class="empty-sub text-muted">Your wagers will be recorded here for eternity — or until you clear them.</p>
      <button class="button button-primary" on:click={() => push('/')}>
        Return to the Track
      </button>
    </div>

  {:else}
    <!-- Stats Grid -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">{$historyStats.totalRaces}</div>
        <div class="stat-label">Races Bet On</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{$historyStats.racesWithBet > 0 ? $historyStats.winRate : '—'}
          {#if $historyStats.racesWithBet > 0}<span class="stat-unit">%</span>{/if}
        </div>
        <div class="stat-label">Win Rate</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{$historyStats.wins}<span class="stat-sep">/</span>{$historyStats.losses}</div>
        <div class="stat-label">Wins / Losses</div>
      </div>
      <div class="stat-card" class:positive={$historyStats.netProfit > 0} class:negative={$historyStats.netProfit < 0}>
        <div class="stat-value net-value">
          {$historyStats.racesWithBet > 0 ? formatNet($historyStats.netProfit) : '—'}
        </div>
        <div class="stat-label">Net Candies</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{$historyStats.totalWagered || '—'}</div>
        <div class="stat-label">Total Wagered</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{$historyStats.biggestWin || '—'}</div>
        <div class="stat-label">Biggest Win</div>
      </div>
    </div>

    <!-- Race Log -->
    <div class="log-section">
      <div class="log-header">
        <h2>Race Log</h2>
        <span class="log-count text-muted">{$history.length} / 50</span>
      </div>

      <div class="log-list">
        {#each $history as race, i}
          {@const net = netChange(race)}
          {@const betName = betMonsterName(race)}
          <div class="log-row"
               class:row-won={race.won}
               class:row-lost={race.bet && !race.won}
               class:row-nobet={!race.bet}>

            <!-- Index + time -->
            <div class="log-meta">
              <span class="log-index text-muted">#{$history.length - i}</span>
              <span class="log-time text-muted">{timeAgo(race.timestamp)}</span>
            </div>

            <!-- Winner -->
            <div class="log-winner">
              <span class="winner-glyph">ᛟ</span>
              <span class="winner-name">{race.winner?.name ?? '—'}</span>
            </div>

            <!-- Bet info -->
            <div class="log-bet">
              {#if race.bet}
                <span class="bet-on">
                  {#if race.bet.monsterId === race.winner?.id}
                    <span class="bet-star">★</span>
                  {/if}
                  {betName}
                </span>
                <span class="bet-amount text-muted">{race.bet.amount}c</span>
              {:else}
                <span class="no-bet text-muted">—</span>
              {/if}
            </div>

            <!-- Result -->
            <div class="log-result">
              {#if race.bet}
                {#if race.won}
                  <span class="result-badge result-win">WIN</span>
                  <span class="result-net positive">{formatNet(net)}</span>
                {:else}
                  <span class="result-badge result-loss">LOSS</span>
                  <span class="result-net negative">{formatNet(net)}</span>
                {/if}
              {:else}
                <span class="result-badge result-watch">WATCHED</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Footer actions -->
    <div class="footer-actions">
      <button class="button button-secondary" on:click={() => push('/')}>
        Return to Track
      </button>

      {#if confirmingClear}
        <div class="confirm-clear">
          <span class="confirm-text text-muted">Erase all records?</span>
          <button class="button button-danger" on:click={handleClear}>Confirm</button>
          <button class="button button-secondary" on:click={cancelClear}>Cancel</button>
        </div>
      {:else}
        <button class="button button-danger" on:click={handleClear}>
          Clear Chronicle
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .history-page {
    padding: 2rem;
    max-width: 1000px;
    margin: 0 auto;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .header {
    text-align: center;
  }

  /* ── Empty State ─────────────────────────────────────── */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 4rem 2rem;
    text-align: center;
  }

  .empty-icon {
    font-size: 4rem;
    color: var(--border-ancient);
    line-height: 1;
  }

  .empty-title {
    font-family: 'Cinzel', serif;
    font-size: 1.3rem;
    letter-spacing: 3px;
    color: var(--text-secondary);
    margin: 0;
  }

  .empty-sub {
    max-width: 360px;
    font-size: 0.95rem;
    margin: 0 0 1rem 0;
  }

  /* ── Stats Grid ──────────────────────────────────────── */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: var(--border-ancient);
    border: 3px solid var(--border-ancient);
  }

  .stat-card {
    background: var(--bg-card);
    padding: 1.25rem 1rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    transition: background 0.2s ease;
  }

  .stat-card.positive { background: rgba(61, 122, 92, 0.12); }
  .stat-card.negative { background: rgba(139, 58, 58, 0.12); }

  .stat-value {
    font-family: 'Cinzel', serif;
    font-size: 1.8rem;
    font-weight: 900;
    color: var(--text-accent);
    line-height: 1;
    letter-spacing: 2px;
  }

  .stat-unit {
    font-size: 1rem;
    opacity: 0.7;
  }

  .stat-sep {
    color: var(--border-ancient);
    margin: 0 2px;
  }

  .net-value {
    font-size: 1.8rem;
  }

  .stat-card.positive .stat-value { color: var(--eldritch-green); }
  .stat-card.negative .stat-value { color: var(--eldritch-red); }

  .stat-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--text-secondary);
  }

  /* ── Log Section ─────────────────────────────────────── */
  .log-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .log-header {
    display: flex;
    align-items: baseline;
    gap: 1rem;
  }

  .log-header h2 {
    margin: 0;
  }

  .log-count {
    font-size: 0.8rem;
    letter-spacing: 1px;
  }

  .log-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* ── Log Row ─────────────────────────────────────────── */
  .log-row {
    display: grid;
    grid-template-columns: 90px 1fr 1fr 110px;
    align-items: center;
    gap: 0;
    background: var(--bg-card);
    border: 2px solid var(--border-ancient);
    border-left-width: 4px;
    border-left-color: var(--border-ancient);
    transition: border-color 0.2s ease, background 0.2s ease;
  }

  .log-row.row-won {
    border-left-color: var(--eldritch-green);
  }

  .log-row.row-lost {
    border-left-color: var(--eldritch-red);
  }

  .log-row.row-nobet {
    border-left-color: var(--border-ancient);
    opacity: 0.7;
  }

  .log-row > * {
    padding: 0.7rem 0.85rem;
    border-right: 1px solid var(--border-ancient);
  }

  .log-row > *:last-child {
    border-right: none;
  }

  /* Meta: index + time */
  .log-meta {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .log-index {
    font-family: 'Cinzel', serif;
    font-size: 0.7rem;
    letter-spacing: 1px;
  }

  .log-time {
    font-size: 0.7rem;
  }

  /* Winner */
  .log-winner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    overflow: hidden;
  }

  .winner-glyph {
    font-size: 1rem;
    color: var(--candy-color);
    opacity: 0.6;
    flex-shrink: 0;
  }

  .winner-name {
    font-family: 'Cinzel', serif;
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--text-accent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Bet info */
  .log-bet {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    overflow: hidden;
  }

  .bet-on {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-primary);
  }

  .bet-star {
    color: var(--candy-color);
    font-size: 0.8rem;
    flex-shrink: 0;
  }

  .bet-amount {
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .no-bet {
    font-size: 0.85rem;
  }

  /* Result */
  .log-result {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .result-badge {
    font-family: 'Cinzel', serif;
    font-size: 0.6rem;
    letter-spacing: 2px;
    padding: 0.2rem 0.4rem;
    border: 1px solid currentColor;
  }

  .result-win {
    color: var(--eldritch-green);
  }

  .result-loss {
    color: var(--eldritch-red);
  }

  .result-watch {
    color: var(--border-ancient);
  }

  .result-net {
    font-family: 'Cinzel', serif;
    font-size: 0.9rem;
    font-weight: 900;
    min-width: 40px;
    text-align: right;
  }

  .positive { color: var(--eldritch-green); }
  .negative { color: var(--eldritch-red); }

  /* ── Footer ──────────────────────────────────────────── */
  .footer-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .confirm-clear {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .confirm-text {
    font-size: 0.85rem;
    letter-spacing: 1px;
  }

  /* ── Responsive ──────────────────────────────────────── */
  @media (max-width: 700px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .log-row {
      grid-template-columns: 72px 1fr 90px;
      grid-template-rows: auto auto;
    }

    .log-bet {
      display: none;
    }

    .footer-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .confirm-clear {
      flex-wrap: wrap;
    }
  }
</style>
