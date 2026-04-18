<script>
  import { push } from 'svelte-spa-router';
  import { monsterHistory } from '../stores/history.js';
  import RichText from './RichText.svelte';

  export let monster;
  export let compact = true;
  export let selected = false;
  export let hasBet = false;
  export let betTotal = 0;  // Total candies bet on this monster
  export let onSelect = null;
  export let disabled = false;

  $: record = $monsterHistory[monster.id];
  $: isChampion = monster.isReturningChampion === true;

  function viewBio() {
    push(`/bio/${monster.id}`);
  }

  function handleSelect() {
    if (onSelect && !disabled) {
      onSelect(monster);
    }
  }
</script>

<div class="monster-card card" class:selected class:has-bet={hasBet} class:compact class:is-champion={isChampion}>
  <div class="monster-header">
    <h3><RichText text={monster.name} /></h3>
    <div class="monster-origin">
      <span class="origin-label">Origin</span>
      <span class="origin-value"><RichText text={monster.location} /></span>
    </div>
    {#if isChampion}
      <div class="champion-badge">ᛟ Returning Champion</div>
    {/if}
  </div>

  {#if betTotal > 0}
    <div class="bet-total-indicator">
      <span class="bet-icon">💰</span>
      <span class="bet-amount">{betTotal} ✦ bet</span>
    </div>
  {/if}

  {#if compact}
    <div class="monster-compact-info">
      <div class="description"><RichText text={monster.description} tag="p" /></div>

      <div class="quick-info">
        <div class="info-row">
          <span class="label">Racing Style:</span>
          <span class="value">{monster.racingStyle}</span>
        </div>
        <div class="info-row">
          <span class="label">Body Type:</span>
          <span class="value">{monster.bodyType}</span>
        </div>
        <div class="info-row">
          <span class="label">Temperament:</span>
          <span class="value"><RichText text={monster.temperament} /></span>
        </div>
      </div>

      {#if record?.appearances > 0}
        <div class="veteran-record">
          <span class="veteran-glyph">ᛟ</span>
          <span>VETERAN</span>
          <span class="veteran-sep">·</span>
          <span>{record.appearances} races</span>
          <span class="veteran-sep">·</span>
          <span>{record.wins} {record.wins === 1 ? 'win' : 'wins'}</span>
        </div>
      {/if}

      <div class="actions">
        <button class="button button-secondary" on:click={viewBio}>
          View Details
        </button>
        {#if onSelect}
          <button class="button button-primary" on:click={handleSelect} disabled={disabled}>
            {selected ? 'Selected' : 'Select'}
          </button>
        {/if}
      </div>
    </div>
  {:else}
    <!-- Full view for Bio page - NO STATS SHOWN -->
    <div class="monster-full-info">
      <div class="info-section">
        <h4>Description</h4>
        <RichText text={monster.description} tag="p" />
      </div>

      <div class="info-section">
        <h4>Background</h4>
        <RichText text={monster.blurb} tag="p" />
      </div>

      <div class="info-section">
        <h4>Physical Characteristics</h4>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">Body Type:</span>
            <span class="value">{monster.bodyType}</span>
          </div>
          <div class="info-item">
            <span class="label">Distinctive Features:</span>
            <span class="value">{monster.features}</span>
          </div>
          <div class="info-item">
            <span class="label">Height:</span>
            <span class="value">{monster.height} meters</span>
          </div>
          <div class="info-item">
            <span class="label">Weight:</span>
            <span class="value">{monster.weight} tons</span>
          </div>
        </div>
      </div>

      <div class="info-section">
        <h4>Behavioral Analysis</h4>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">Racing Style:</span>
            <span class="value">{monster.racingStyle}</span>
          </div>
          <div class="info-item">
            <span class="label">Temperament:</span>
            <span class="value"><RichText text={monster.temperament} /></span>
          </div>
        </div>
      </div>

      {#if record?.appearances > 0}
        <div class="info-section">
          <h4>Racing Record</h4>
          <div class="info-grid">
            <div class="info-item">
              <span class="label">Appearances</span>
              <span class="value">{record.appearances}</span>
            </div>
            <div class="info-item">
              <span class="label">Victories</span>
              <span class="value">{record.wins}</span>
            </div>
          </div>
        </div>
      {/if}

      <div class="disclaimer">
        <p><em>Those who study these horrors carefully may discern patterns. Hidden forces also shape every outcome.</em></p>
      </div>
    </div>
  {/if}
</div>

<style>
  .monster-card {
    position: relative;
    transition: all 0.2s ease;
  }

  .monster-card.is-champion {
    border-color: rgba(201, 169, 97, 0.45);
  }

  .champion-badge {
    display: inline-block;
    margin-top: 0.4rem;
    font-family: 'Cinzel', serif;
    font-size: 0.65rem;
    color: var(--candy-color);
    letter-spacing: 3px;
    text-transform: uppercase;
  }

  .veteran-record {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-family: 'Cinzel', serif;
    font-size: 0.72rem;
    color: var(--text-secondary);
    letter-spacing: 1px;
    margin: 0.75rem 0 0;
  }

  .veteran-glyph {
    color: var(--candy-color);
    font-size: 0.8rem;
  }

  .veteran-sep {
    opacity: 0.5;
  }

  .monster-card.selected {
    border-color: var(--border-glow) !important;
    box-shadow:
      0 0 20px rgba(122, 106, 142, 0.4),
      var(--shadow);
  }

  .monster-card.has-bet {
    border-color: var(--candy-color) !important;
    border-width: 6px !important;
    box-shadow:
      0 0 30px rgba(201, 169, 97, 0.6),
      0 0 60px rgba(201, 169, 97, 0.3),
      var(--shadow) !important;
    animation: betGlow 2s ease-in-out infinite;
    transform: scale(1.02);
  }

  @keyframes betGlow {
    0%, 100% {
      box-shadow:
        0 0 20px rgba(201, 169, 97, 0.5),
        0 0 40px rgba(201, 169, 97, 0.2),
        var(--shadow);
    }
    50% {
      box-shadow:
        0 0 40px rgba(201, 169, 97, 0.8),
        0 0 80px rgba(201, 169, 97, 0.4),
        var(--shadow);
    }
  }

  .monster-header h3 {
    color: var(--eldritch-purple);
    margin: 0 0 0.5rem 0;
    font-size: 1.3rem;
    letter-spacing: 2px;
  }

  .monster-origin {
    display: inline-flex;
    align-items: baseline;
    gap: 0.5rem;
    margin-top: 0.4rem;
    padding: 0.3rem 0.6rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-ancient);
  }

  .origin-label {
    font-family: 'Cinzel', serif;
    font-size: 0.55rem;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .origin-value {
    font-size: 0.9rem;
    font-style: italic;
    font-weight: 600;
    color: var(--text-primary);
  }

  .bet-total-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    margin-top: 0.75rem;
    background: linear-gradient(135deg, rgba(201, 169, 97, 0.1) 0%, rgba(201, 169, 97, 0.05) 100%);
    border: 2px solid var(--candy-color);
    border-radius: 4px;
    font-weight: 600;
    font-size: 0.95rem;
  }

  .bet-icon {
    font-size: 1.2rem;
  }

  .bet-amount {
    color: var(--candy-color);
    font-weight: 700;
  }

  .description {
    margin: 1rem 0;
    line-height: 1.6;
    font-size: 0.95rem;
  }

  .quick-info {
    background: var(--bg-secondary);
    padding: 1rem;
    margin: 1rem 0;
    border: 2px solid var(--border-ancient);
  }

  .info-row {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid rgba(74, 69, 56, 0.3);
  }

  .info-row:last-child {
    border-bottom: none;
  }

  .info-row .label {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .info-row .value {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .actions button {
    flex: 1;
    font-size: 0.75rem;
    padding: 0.6rem 1rem;
  }

  /* Full view styles */
  .monster-full-info {
    padding: 1rem 0;
  }

  .info-section {
    margin: 1.5rem 0;
  }

  .info-section h4 {
    color: var(--text-accent);
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 0.75rem;
    font-size: 1rem;
    border-bottom: 2px solid var(--border-ancient);
    padding-bottom: 0.5rem;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin: 1.5rem 0;
  }

  .info-item {
    background: var(--bg-secondary);
    padding: 0.75rem;
    border: 2px solid var(--border-ancient);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .info-item .label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-secondary);
  }

  .info-item .value {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .disclaimer {
    margin-top: 2rem;
    padding: 1rem;
    background: rgba(139, 58, 58, 0.1);
    border: 2px solid rgba(139, 58, 58, 0.3);
    border-left: 4px solid var(--eldritch-red);
  }

  .disclaimer p {
    margin: 0;
    font-size: 0.85rem;
    font-style: italic;
    color: var(--text-secondary);
    line-height: 1.5;
  }
</style>
