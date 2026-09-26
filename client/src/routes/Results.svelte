<script>
  import { tick } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { history } from '../lib/stores/history.js';
  import { candies } from '../lib/stores/game.js';
  import RaceTimer from '../lib/components/RaceTimer.svelte';
  import RichText from '../lib/components/RichText.svelte';
  import CandyStream from '../lib/components/CandyStream.svelte';

  let candyStream;

  // Get the most recent race from history
  $: latestRace = $history.length > 0 ? $history[0] : null;
  $: winner = latestRace?.winner;
  $: rankings = latestRace?.monsters || [];
  $: playerBet = latestRace?.bet;
  $: playerWon = latestRace?.won || false;
  $: payout = latestRace?.payout || 0;
  $: commentaryLog = latestRace?.commentary || [];

  // Calculate net profit/loss
  $: netChange = playerBet ? (playerWon ? payout - playerBet.amount : -playerBet.amount) : 0;

  // The balance shown here is already post-resolution — the server credits payouts
  // before the client ever reaches this screen. Derive the pre-payout value so the
  // count-up animation reflects the real credit instead of an illusion.
  $: balanceCountFrom = playerWon ? $candies - payout : $candies;

  // Ambient ember drift on a win, regenerated per race so the one-shot
  // animation replays even if the page component instance is reused across races.
  function makeParticles(count) {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.7,
      duration: 2.4 + Math.random() * 1.8,
      drift: Math.round((Math.random() - 0.5) * 70),
      size: 3 + Math.random() * 4,
    }));
  }
  $: particles = playerBet && playerWon ? makeParticles(20) : [];

  // Screen-wide loss vignette: a fixed overlay with a gradient hole punched
  // out around the defeat panel's own measured bounds, so the panel reads as
  // the one lit thing on screen before the darkness fades and releases the
  // rest of the page.
  let vignetteStyle = '';
  function spotlightLossPanel(node, isLoss) {
    if (isLoss) {
      const rect = node.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const rx = rect.width / 2 + 70;
      const ry = rect.height / 2 + 70;
      vignetteStyle = `background: radial-gradient(ellipse ${rx}px ${ry}px at ${cx}px ${cy}px, transparent 55%, rgba(6, 4, 8, 0.94) 100%);`;
    }
    return {};
  }

  function formatRaceTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `T+${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function goToHome() {
    // Server handles race scheduling automatically
    push('/');
  }

  function goToHistory() {
    push('/history');
  }

  // ── Candy particle stream (idea 2): on a win, candies visibly fly from
  // the winner banner into the balance readout as the payout lands. ──
  function fireBalanceStream(node, isWin) {
    if (isWin) {
      // The winner banner is a later sibling still being mounted when this
      // action runs — wait a tick so it exists in the live DOM before firing.
      tick().then(() => {
        const fromEl = document.querySelector('.winner-banner .winner-icon');
        const toEl = document.querySelector('.current-balance');
        candyStream?.fire(fromEl, toEl, { count: Math.min(20, 6 + Math.round(payout / 8)) });
      });
    }
    return {};
  }

  // Svelte action: animates a number counting from `from` to `to` as soon as the
  // node mounts. One-shot by nature — it replays only when the node itself is
  // recreated, which the {#key} block below guarantees on every new race.
  function countUp(node, { from = 0, to = 0, duration = 900, prefix = '', suffix = '' } = {}) {
    let raf;
    const startTime = performance.now();
    const delta = to - from;
    const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

    node.textContent = `${prefix}${from}${suffix}`;

    if (delta !== 0) {
      const frame = now => {
        const t = Math.min(1, (now - startTime) / duration);
        const value = Math.round(from + delta * easeOutCubic(t));
        node.textContent = `${prefix}${value}${suffix}`;
        if (t < 1) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }

    return {
      destroy() {
        if (raf) cancelAnimationFrame(raf);
      },
    };
  }
</script>

<div class="results-page">
  <CandyStream bind:this={candyStream} />

  <div class="header">
    <h1>Race Results</h1>
  </div>

  {#if latestRace}
    {#key latestRace.timestamp}
      {#if playerBet && playerWon}
        <div class="ambient-overlay ambient-win">
          {#each particles as p (p.id)}
            <span
              class="ambient-particle"
              style="left: {p.left}%; width: {p.size}px; height: {p.size}px; animation-delay: {p.delay}s; animation-duration: {p.duration}s; --drift: {p.drift}px;"
            ></span>
          {/each}
        </div>
      {/if}

      {#if playerBet && !playerWon}
        <div class="loss-vignette" style={vignetteStyle}></div>
      {/if}

      <!-- Player Result -->
      {#if playerBet}
        <div
          class="player-result card reveal-1"
          class:won={playerWon}
          class:lost={!playerWon}
          use:spotlightLossPanel={!playerWon}
          use:fireBalanceStream={playerWon}
        >
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
                <span
                  class="value text-candy"
                  use:countUp={{ from: 0, to: payout, duration: Math.min(1800, 600 + payout * 4), suffix: ' ✦' }}
                >0 ✦</span>
              </div>
              <div class="detail-row profit">
                <span class="label">Net Profit:</span>
                <span
                  class="value profit-value"
                  use:countUp={{ from: 0, to: netChange, duration: 900, prefix: '+', suffix: ' ✦' }}
                >+0 ✦</span>
              </div>
            </div>
          {:else}
            <h3 class="result-title lose-title">Defeat</h3>
            <p class="result-message">The void claims your candies...</p>
            <div class="result-details">
              <div class="detail-row">
                <span class="label">Lost:</span>
                <span
                  class="value loss-value"
                  use:countUp={{ from: 0, to: playerBet.amount, duration: 700, prefix: '-', suffix: ' ✦' }}
                >-0 ✦</span>
              </div>
            </div>
          {/if}
          <div class="current-balance">
            <span class="label">Current Balance:</span>
            {#if latestRace.mercyRescued}
              <span class="value text-candy mercy-value">
                <RichText text="<cosmic>An unseen patron intervenes</cosmic>" />
              </span>
            {:else}
              <span
                class="value text-candy"
                use:countUp={{ from: balanceCountFrom, to: $candies, duration: 1000, suffix: ' ✦' }}
              >{balanceCountFrom} ✦</span>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Winner Banner -->
      <div class="winner-banner card" class:reveal-1={!playerBet} class:reveal-2={playerBet}>
        <div class="winner-icon">👑</div>
        <div class="winner-info">
          <p class="winner-label">Winner</p>
          <h2 class="winner-name">{winner.name}</h2>
          <p class="winner-location text-muted">{winner.location}</p>
          <p class="champion-note">This horror shall return to face the next summoning.</p>
        </div>
      </div>

      {#if !playerBet}
        <div class="no-bet-message card reveal-2">
          <p class="text-muted">You did not bet on this race</p>
        </div>
      {/if}

      <!-- Rankings Table -->
      <div class="rankings card reveal-3">
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

      <!-- Commentary Log -->
      {#if commentaryLog.length > 0}
        <div class="commentary-log card reveal-4">
          <h3>Race Commentary</h3>
          <div class="commentary-scroll">
            {#each commentaryLog as entry}
              <div class="commentary-entry">
                <span class="time-code">[{formatRaceTime(entry.raceTime)}]</span>
                <span class="comment-text"><RichText text={entry.text} /></span>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Next Race Timer -->
      <div class="next-race-section reveal-5">
        <h3>Next Race</h3>
        <RaceTimer />
      </div>

      <!-- Actions -->
      <div class="actions reveal-6">
        <button class="button button-primary" on:click={goToHome}>
          Next Race
        </button>
        <button class="button button-secondary" on:click={goToHistory}>
          View History
        </button>
      </div>
    {/key}
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
    padding: 2rem 1.4rem;
    max-width: 900px;
    margin: 0 auto;
    min-height: 100vh;
  }

  .header {
    text-align: center;
    margin-bottom: 2rem;
  }

  /* ── Staggered reveal ───────────────────────────────── */
  @keyframes reveal-in {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .reveal-1 { animation: reveal-in 0.5s ease-out backwards; }
  .reveal-2 { animation: reveal-in 0.5s ease-out 0.28s backwards; }
  .reveal-3 { animation: reveal-in 0.5s ease-out 0.56s backwards; }
  .reveal-4 { animation: reveal-in 0.5s ease-out 0.84s backwards; }
  .reveal-5 { animation: reveal-in 0.5s ease-out 1.05s backwards; }
  .reveal-6 { animation: reveal-in 0.5s ease-out 1.2s backwards; }

  @media (prefers-reduced-motion: reduce) {
    .reveal-1, .reveal-2, .reveal-3, .reveal-4, .reveal-5, .reveal-6,
    .player-result.won, .player-result.lost {
      animation: none;
    }
  }

  /* ── Ambient win/loss overlay ───────────────────────── */
  .ambient-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 5;
  }

  .ambient-overlay::before {
    content: '';
    position: absolute;
    inset: 0;
  }

  .ambient-win::before {
    background: radial-gradient(circle at 50% 40%, rgba(201, 169, 97, 0.28) 0%, transparent 65%);
    animation: ambient-pulse-win 2s ease-out forwards;
  }

  @keyframes ambient-pulse-win {
    0%   { opacity: 0; }
    25%  { opacity: 1; }
    100% { opacity: 0; }
  }

  .ambient-particle {
    position: absolute;
    bottom: -10px;
    left: 0;
    border-radius: 50%;
    opacity: 0;
  }

  .ambient-win .ambient-particle {
    background: radial-gradient(circle, #fff3c4 0%, var(--candy-color) 60%, transparent 100%);
    box-shadow: 0 0 6px rgba(201, 169, 97, 0.8);
    animation-name: ember-rise;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
  }

  @keyframes ember-rise {
    0%   { opacity: 0; transform: translate(0, 0); }
    10%  { opacity: 0.9; }
    100% { opacity: 0; transform: translate(var(--drift, 0px), -100vh); }
  }

  @media (prefers-reduced-motion: reduce) {
    .ambient-overlay { display: none; }
  }

  /* ── Loss vignette: screen-wide dark field with a hole punched out
     around the defeat panel, so the panel is the one lit thing on
     screen — then it fades to release the rest of the page ─────────── */
  .loss-vignette {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 50;
    opacity: 0;
    animation: vignette-hold-fade 3s ease-out 0.28s forwards;
  }

  @keyframes vignette-hold-fade {
    0%   { opacity: 0; }
    12%  { opacity: 1; }
    55%  { opacity: 1; }
    100% { opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .loss-vignette { display: none; }
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

  /* ── Distinct win/loss entrances ────────────────────── */
  @keyframes banner-in-won {
    0%   { opacity: 0; transform: scale(0.55) translateY(20px); }
    55%  { opacity: 1; transform: scale(1.08) translateY(-4px); }
    75%  { transform: scale(0.97) translateY(1px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }

  @keyframes banner-in-lost {
    0%   { opacity: 0; transform: scale(1.05) translateY(-14px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }

  .player-result.won {
    animation: banner-in-won 0.75s cubic-bezier(0.22, 1, 0.36, 1) 0.28s backwards;
    background: linear-gradient(
      135deg,
      var(--bg-card) 0%,
      rgba(61, 122, 92, 0.2) 100%
    );
    border-color: var(--eldritch-green);
  }

  .player-result.lost {
    animation: banner-in-lost 0.9s ease-out 0.28s backwards;
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

  .no-bet-message {
    text-align: center;
    padding: 2rem;
    margin-bottom: 2rem;
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

  .current-balance .value.mercy-value {
    font-size: 0.95rem;
    font-style: italic;
    font-weight: 400;
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

  .commentary-log {
    margin-bottom: 2rem;
  }

  .commentary-log h3 {
    margin: 0 0 1rem 0;
    text-align: center;
    font-family: 'Cinzel', serif;
    font-size: 1.5rem;
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  .commentary-scroll {
    max-height: 400px;
    overflow-y: auto;
    padding: 1rem;
    background: var(--bg-secondary);
    border: 2px solid var(--border-ancient);
    font-family: 'Cinzel', serif;
    font-size: 0.95rem;
    line-height: 1.6;
  }

  .commentary-scroll::-webkit-scrollbar {
    width: 8px;
  }

  .commentary-scroll::-webkit-scrollbar-track {
    background: var(--bg-card);
  }

  .commentary-scroll::-webkit-scrollbar-thumb {
    background: var(--border-ancient);
    border-radius: 4px;
  }

  .commentary-scroll::-webkit-scrollbar-thumb:hover {
    background: var(--eldritch-purple);
  }

  .commentary-entry {
    display: flex;
    gap: 0.75rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid rgba(107, 90, 142, 0.15);
    transition: background 0.2s ease;
  }

  .commentary-entry:last-child {
    border-bottom: none;
  }

  .commentary-entry:hover {
    background: rgba(107, 90, 142, 0.08);
  }

  .time-code {
    color: var(--text-muted);
    font-weight: bold;
    flex-shrink: 0;
    min-width: 70px;
    font-family: 'Courier New', monospace;
    opacity: 0.7;
  }

  .comment-text {
    color: var(--text-secondary);
    flex: 1;
    font-style: normal;
    font-family: 'Cinzel', serif;
  }

  .next-race-section {
    margin-bottom: 2rem;
  }

  .next-race-section h3 {
    margin: 0 0 1rem 0;
    text-align: center;
    font-family: 'Cinzel', serif;
    font-size: 1.5rem;
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  @media (max-width: 768px) {
    .results-page {
      padding: 1rem 0.7rem;
    }

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
