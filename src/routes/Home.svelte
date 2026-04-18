<script>
  import { onMount } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { monsters } from '../lib/stores/monsters.js';
  import { currentBet, serverRaceState } from '../lib/stores/game.js';
  import { history } from '../lib/stores/history.js';
  import MonsterCard from '../lib/components/MonsterCard.svelte';
  import RaceTimer from '../lib/components/RaceTimer.svelte';
  import BettingSlip from '../lib/components/BettingSlip.svelte';

  let selectedMonster = null;
  let canvas;
  let raf;

  const RUNES = ['ᛟ', 'ᛦ', 'ᛏ', 'ᚦ', 'ᚷ', 'ᚱ', 'ᚢ', 'ᚠ', 'ᛁ', 'ᛃ', 'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ', 'ᛏ', 'ᛒ', 'ᛖ', 'ᛗ'];
  const COUNT = 60;

  function handleSelectMonster(monster) {
    selectedMonster = monster;
  }

  $: if ($currentBet) {
    selectedMonster = null;
  }

  $: selectedMonsterId = selectedMonster?.id || $currentBet?.monsterId;

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
  <div class="content">
    <div class="header">
      <h1>UHRB</h1>
      <p class="subtitle">Unspeakable Horrors Race Betting</p>
      {#if $history.length > 0}
        <button class="history-btn" on:click={() => push('/history')}>
          Past Races ({$history.length})
        </button>
      {/if}
    </div>

    <RaceTimer />

    <div class="main-content">
      <div class="monsters-section">
        <h2>Competing Horrors</h2>

        <div class="monsters-grid">
          {#each $monsters as monster}
            <MonsterCard
              {monster}
              compact={true}
              selected={monster.id === selectedMonster?.id}
              hasBet={$currentBet !== null && monster.id === $currentBet.monsterId}
              betTotal={$serverRaceState.betTotals?.[monster.id] || 0}
              onSelect={handleSelectMonster}
              disabled={$currentBet !== null && monster.id !== $currentBet.monsterId}
            />
          {/each}
        </div>
      </div>

      <aside class="betting-section">
        <BettingSlip {selectedMonster} monsters={$monsters} />
      </aside>
    </div>
  </div>
</div>

<style>
  .home-page {
    position: relative;
    padding: 2rem;
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
</style>
