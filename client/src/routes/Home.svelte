<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { monsters } from '../lib/stores/monsters.js';
  import { currentBet, serverRaceState, betShares } from '../lib/stores/game.js';
  import { history } from '../lib/stores/history.js';
  import MonsterCard from '../lib/components/MonsterCard.svelte';
  import RaceTimer from '../lib/components/RaceTimer.svelte';
  import BettingSlip from '../lib/components/BettingSlip.svelte';
  import CrowdWagerBar from '../lib/components/CrowdWagerBar.svelte';
  import CandyStream from '../lib/components/CandyStream.svelte';
  import RichText from '../lib/components/RichText.svelte';

  let selectedMonster = null;
  let canvas;
  let raf;
  let tocOpen = false;
  let candyStream;

  // ── Candy particle stream (idea 2): candies visibly fly from the
  // balance display into the backed horror's card on bet placement. ──
  function handleBetPlaced(event) {
    selectedMonster = null;
    const { monsterId, amount } = event.detail || {};
    if (!monsterId) return;
    const fromEl = document.querySelector('.betting-section .balance-display');
    const toEl = document.getElementById(`monster-${monsterId}`);
    candyStream?.fire(fromEl, toEl, { count: Math.min(16, 4 + Math.round((amount || 0) / 5)) });
  }

  function scrollToMonster(id) {
    document.getElementById(`monster-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    tocOpen = false;
  }

  const RUNES = ['ᛟ', 'ᛦ', 'ᛏ', 'ᚦ', 'ᚷ', 'ᚱ', 'ᚢ', 'ᚠ', 'ᛁ', 'ᛃ', 'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ', 'ᛏ', 'ᛒ', 'ᛖ', 'ᛗ'];
  const COUNT = 60;

  function handleSelectMonster(monster) {
    selectedMonster = monster;
  }

  // Only treat a bet as valid if it matches the current race
  $: validBet = $currentBet && $currentBet.raceId === $serverRaceState.raceId ? $currentBet : null;
  $: selectedMonsterId = selectedMonster?.id || validBet?.monsterId;

  onMount(() => {
    const ctx = canvas.getContext('2d');
    let W = canvas.width = canvas.offsetWidth;
    let H = canvas.height = canvas.offsetHeight;

    const particles = Array.from({ length: COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      rune: RUNES[Math.floor(Math.random() * RUNES.length)],
      size: 20 + Math.random() * 28,
      opacity: 0.02 + Math.random() * 0.07,
      speed: 0.08 + Math.random() * 0.12,
      drift: (Math.random() - 0.5) * 0.04,
    }));

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.font = `${16}px 'Cinzel', serif`;
      ctx.textBaseline = 'middle';

      for (const p of particles) {
        ctx.font = `${p.size}px 'Cinzel', serif`;
        ctx.fillStyle = `rgba(107, 90, 142, ${p.opacity})`;
        ctx.fillText(p.rune, p.x, p.y);

        p.y -= p.speed;
        p.x += p.drift;

        if (p.y < -p.size) {
          p.y = H + p.size;
          p.x = Math.random() * W;
          p.rune = RUNES[Math.floor(Math.random() * RUNES.length)];
        }
        if (p.x < -p.size) p.x = W + p.size;
        if (p.x > W + p.size) p.x = -p.size;
      }

      raf = requestAnimationFrame(draw);
    }

    const ro = new ResizeObserver(() => {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    });
    ro.observe(canvas);

    draw();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  });
</script>

<div class="home-page">
  <canvas bind:this={canvas} class="rune-bg" aria-hidden="true"></canvas>
  <CandyStream bind:this={candyStream} />
  <div class="content">
    <div class="header">
      <h1>UHRB</h1>
      <p class="subtitle">Unspeakable Horrors Race Betting</p>
      {#if $history.length > 0}
        <button class="history-btn" on:click={() => push('/history')}>
          Past Races ({$history.length})
        </button>
      {/if}
      <button class="about-btn" on:click={() => push('/about')}>About</button>
    </div>

    <RaceTimer>
      <button
        slot="action"
        class="horror-toc-toggle"
        aria-label="Jump to a horror"
        aria-expanded={tocOpen}
        on:click={() => (tocOpen = !tocOpen)}
      >
        <span class="bar"></span>
        <span class="bar"></span>
        <span class="bar"></span>
      </button>
    </RaceTimer>

    {#if $serverRaceState.state === 'waiting' || $serverRaceState.state === 'closed'}
      <CrowdWagerBar monsters={$monsters} shares={$betShares} selectedMonsterId={validBet?.monsterId} />
    {/if}

    <div class="main-content">
      <div class="monsters-section">
        <h2>Competing Horrors</h2>

        <div class="monsters-grid">
          {#each $monsters as monster}
            <div id="monster-{monster.id}">
              <MonsterCard
                {monster}
                compact={true}
                selected={monster.id === selectedMonster?.id}
                hasBet={validBet !== null && monster.id === validBet.monsterId}
                betTotal={$serverRaceState.betTotals?.[monster.id] || 0}
                odds={$serverRaceState.odds?.[monster.id]}
                onSelect={handleSelectMonster}
                disabled={validBet !== null && monster.id !== validBet.monsterId}
                on:placed={handleBetPlaced}
              />
            </div>
          {/each}
        </div>
      </div>

      <aside class="betting-section">
        <BettingSlip {selectedMonster} monsters={$monsters} on:placed={handleBetPlaced} />
      </aside>
    </div>
  </div>

  {#if tocOpen}
    <button class="toc-backdrop" aria-label="Close horror list" on:click={() => (tocOpen = false)}></button>
    <nav class="horror-toc">
      <h3 class="toc-title">Jump to Horror</h3>
      <ul>
        {#each $monsters as monster}
          <li>
            <button class="toc-item" on:click={() => scrollToMonster(monster.id)}>
              <RichText text={monster.name} />
            </button>
          </li>
        {/each}
      </ul>
    </nav>
  {/if}
</div>

<style>
  .home-page {
    position: relative;
    padding: 2rem 1.4rem;
    max-width: 1400px;
    margin: 0 auto;
  }

  .rune-bg {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
  }

  .content {
    position: relative;
    z-index: 1;
  }

  .header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .subtitle {
    color: var(--text-secondary);
    font-size: 1.2rem;
    margin-bottom: 0;
  }

  .history-btn {
    margin-top: 1rem;
    background: transparent;
    border: 2px solid var(--border-ancient);
    color: var(--text-secondary);
    font-family: 'Cinzel', serif;
    font-size: 0.7rem;
    letter-spacing: 3px;
    text-transform: uppercase;
    padding: 0.4rem 1.2rem;
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease;
  }

  .history-btn:hover {
    border-color: var(--candy-color);
    color: var(--candy-color);
  }

  .about-btn {
    margin-top: 0.5rem;
    background: transparent;
    border: none;
    color: var(--text-muted, #6b5a8e);
    font-family: 'Cinzel', serif;
    font-size: 0.65rem;
    letter-spacing: 2px;
    text-transform: uppercase;
    padding: 0.2rem 0.6rem;
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.2s ease;
  }

  .about-btn:hover {
    opacity: 1;
  }

  .main-content {
    display: grid;
    grid-template-columns: 1fr 350px;
    gap: 2rem;
    margin-top: 2rem;
  }

  .monsters-section h2 {
    margin-bottom: 1.5rem;
  }

  .monsters-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
    gap: 1.5rem;
  }

  .betting-section {
    position: relative;
  }

  @media (max-width: 1024px) {
    .main-content {
      grid-template-columns: 1fr;
    }

    .betting-section {
      order: -1;
    }
  }

  /* ── Mobile: jump-to-horror table of contents ───────── */
  /* Rendered into RaceTimer's "action" slot, so it shares the timer's
     sticky panel on mobile instead of floating as its own FAB. */
  .horror-toc-toggle {
    display: none;
  }

  @media (max-width: 768px) {
    .horror-toc-toggle {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      width: 40px;
      height: 40px;
      flex-shrink: 0;
      background: var(--bg-secondary);
      border: 2px solid var(--border-ancient);
      cursor: pointer;
      align-self: center;
    }

    .horror-toc-toggle .bar {
      width: 18px;
      height: 2px;
      background: var(--text-accent);
    }
  }

  .toc-backdrop {
    position: fixed;
    inset: 0;
    padding: 0;
    border: none;
    background: rgba(6, 4, 8, 0.7);
    cursor: default;
    z-index: 45;
  }

  .horror-toc {
    position: fixed;
    top: 6rem;
    right: 1rem;
    width: min(280px, calc(100vw - 2rem));
    max-height: 60vh;
    overflow-y: auto;
    background: var(--bg-card);
    border: 3px solid var(--border-ancient);
    padding: 1rem;
    z-index: 46;
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.6);
  }

  .toc-title {
    margin: 0 0 0.75rem 0;
    font-size: 0.75rem;
    letter-spacing: 2px;
    text-transform: uppercase;
    text-align: center;
    color: var(--text-secondary);
  }

  .horror-toc ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .toc-item {
    width: 100%;
    text-align: left;
    background: var(--bg-secondary);
    border: 2px solid var(--border-ancient);
    color: var(--text-primary);
    padding: 0.5rem 0.75rem;
    font-family: 'Cinzel', serif;
    font-size: 0.85rem;
    cursor: pointer;
    transition: border-color 0.2s ease, color 0.2s ease;
  }

  .toc-item:hover,
  .toc-item:active {
    border-color: var(--candy-color);
    color: var(--candy-color);
  }
</style>
