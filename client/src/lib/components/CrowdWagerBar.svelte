<script>
  import RichText from './RichText.svelte';

  export let monsters = [];
  export let shares = []; // [{ monsterId, amount, pct }]
  export let selectedMonsterId = null;

  const SEGMENT_COLORS = [
    'var(--candy-color)',
    'var(--eldritch-purple)',
    'var(--eldritch-green)',
    'var(--eldritch-red)',
    'var(--eldritch-blue)',
    'var(--text-accent)',
  ];

  $: shareById = Object.fromEntries(shares.map(s => [s.monsterId, s]));
  $: pool = shares.reduce((sum, s) => sum + s.amount, 0);
  $: segments = monsters.map((monster, index) => ({
    monster,
    color: SEGMENT_COLORS[index % SEGMENT_COLORS.length],
    ...(shareById[monster.id] || { amount: 0, pct: 0 }),
  }));
</script>

<div class="crowd-wager-bar card">
  <h3 class="title">Crowd Sentiment</h3>

  <div class="bar" role="img" aria-label="Share of candies wagered per horror">
    {#each segments as segment (segment.monster.id)}
      {#if segment.pct > 0}
        <div
          class="segment"
          class:is-mine={segment.monster.id === selectedMonsterId}
          style="width: {segment.pct * 100}%; background: {segment.color};"
          title="{segment.monster.name}: {segment.amount} ✦ ({Math.round(segment.pct * 100)}%)"
        ></div>
      {/if}
    {/each}
  </div>

  <div class="legend">
    {#each segments as segment (segment.monster.id)}
      <div class="legend-item" class:is-mine={segment.monster.id === selectedMonsterId}>
        <span class="swatch" style="background: {segment.color};"></span>
        <span class="legend-name"><RichText text={segment.monster.name} /></span>
        <span class="legend-pct">{pool > 0 ? Math.round(segment.pct * 100) : 0}%</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .crowd-wager-bar {
    padding: 1.25rem 1.5rem;
    margin-top: 1.5rem;
  }

  .title {
    margin: 0 0 1rem 0;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 2px;
    text-align: center;
    color: var(--text-secondary);
  }

  .bar {
    display: flex;
    height: 22px;
    width: 100%;
    overflow: hidden;
    background: var(--bg-secondary);
    border: 2px solid var(--border-ancient);
  }

  .segment {
    height: 100%;
    transition: width 0.4s ease;
    opacity: 0.85;
  }

  .segment.is-mine {
    opacity: 1;
    box-shadow: inset 0 0 12px rgba(0, 0, 0, 0.35), 0 0 10px rgba(201, 169, 97, 0.6);
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.25rem;
    margin-top: 0.9rem;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.78rem;
    color: var(--text-secondary);
  }

  .legend-item.is-mine {
    color: var(--candy-color);
    font-weight: 700;
  }

  .swatch {
    width: 10px;
    height: 10px;
    flex-shrink: 0;
    border-radius: 2px;
  }

  .legend-name {
    white-space: nowrap;
  }

  .legend-pct {
    opacity: 0.75;
  }
</style>
