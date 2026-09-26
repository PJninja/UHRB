<script>
  import { createEventDispatcher } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { monsterHistory } from '../stores/history.js';
  import { candies, placeBet } from '../stores/game.js';
  import RichText from './RichText.svelte';
  import FavorMeter from './FavorMeter.svelte';

  export let monster;
  export let compact = true;
  export let selected = false;
  export let hasBet = false;
  export let betTotal = 0;  // Total candies bet on this monster
  export let odds = null;   // Payout multiplier for this monster, e.g. 3.5
  export let onSelect = null;
  export let disabled = false;

  const dispatch = createEventDispatcher();

  $: record = $monsterHistory[monster.id];
  $: isChampion = monster.isReturningChampion === true;
  $: isLegendary = monster.isLegendary === true;

  // ── Sigil burn (idea 1): a one-shot occult sigil flashes over the card
  // whenever hasBet flips on, regardless of which flow placed the bet. ──
  let sigilActive = false;
  let prevHasBet = hasBet;
  // Combined into one reactive block so the comparison always runs against
  // the PRE-update value of prevHasBet — as two separate `$:` statements,
  // Svelte reorders them by dependency (the assignment runs first since the
  // if-check reads what it writes), which silently defeats the edge check.
  $: {
    if (hasBet && !prevHasBet) sigilActive = true;
    prevHasBet = hasBet;
  }

  function handleSigilAnimEnd(event) {
    if (event.animationName === 'sigil-fade') sigilActive = false;
  }

  function viewBio() {
    push(`/bio/${monster.id}`);
  }

  function handleSelect() {
    if (onSelect && !disabled) {
      onSelect(monster);
    }
  }

  // ── Mobile mini betting slip — replaces View Details/Select on the
  // selected card so betting doesn't require jumping to the full slip. ──
  let miniBetAmount = 10;
  let miniBetError = null;
  let wasSelected = false;

  // Reset the form whenever this card transitions into the selected state.
  $: if (selected && !wasSelected) {
    miniBetAmount = 10;
    miniBetError = null;
  }
  $: wasSelected = selected;

  $: miniCanBet = miniBetAmount >= 1 && miniBetAmount <= $candies;

  function setMiniPercentage(percentage) {
    miniBetAmount = Math.max(1, Math.floor($candies * percentage));
  }

  async function handleMiniApply() {
    if (!miniCanBet) return;
    miniBetError = null;
    try {
      const amount = Math.floor(Number(miniBetAmount));
      await placeBet(monster.id, amount);
      dispatch('placed', { monsterId: monster.id, amount });
    } catch {
      miniBetError = 'Bet failed — try again.';
    }
  }

  function handleMiniCancel() {
    miniBetError = null;
    if (onSelect) onSelect(null);
  }
</script>

<div class="monster-card card" class:selected class:has-bet={hasBet} class:compact class:is-champion={isChampion} class:is-legendary={isLegendary}>
  {#if sigilActive}
    <div class="sigil-burn" aria-hidden="true" on:animationend={handleSigilAnimEnd}>
      <svg viewBox="0 0 200 200">
        <circle class="sigil-ring" cx="100" cy="100" r="80" />
        <polygon class="sigil-tri" points="100,30 165,150 35,150" />
        <circle class="sigil-core" cx="100" cy="100" r="6" />
      </svg>
    </div>
  {/if}

  {#if isLegendary || isChampion || record?.appearances > 0}
    <div class="status-strip">
      {#if isLegendary}
        <span class="status-chip status-legendary">⚝ Legendary</span>
      {/if}
      {#if isChampion}
        <span class="status-chip status-champion">ᛟ Champion</span>
      {/if}
      {#if record?.appearances > 0}
        <span class="status-chip status-veteran">
          {record.appearances} {record.appearances === 1 ? 'race' : 'races'} · {record.wins} {record.wins === 1 ? 'win' : 'wins'}
        </span>
      {/if}
    </div>
  {/if}

  <div class="monster-header">
    <h3><RichText text={monster.name} /></h3>
    <p class="monster-origin"><RichText text={monster.location} /></p>
  </div>

  {#if monster.audienceFavor}
    <FavorMeter audienceFavor={monster.audienceFavor} variant="compact" {odds} />
  {/if}

  {#if betTotal > 0}
    <div class="bet-total-indicator">{betTotal} ✦ wagered</div>
  {/if}

  {#if compact}
    <div class="monster-compact-info">
      <div class="description"><RichText text={monster.description} tag="p" /></div>

      <div class="trait-pills">
        <span class="trait-pill"><RichText text={monster.racingStyle} /></span>
        <span class="trait-pill"><RichText text={monster.temperament} /></span>
        <span class="trait-pill">{monster.bodyType}</span>
      </div>

      <div class="actions">
        <button
          class="button button-secondary dossier-btn"
          on:click={viewBio}
          aria-label="View {monster.name}'s dossier"
          title="View Dossier"
        >
          <svg class="dossier-eye" viewBox="0 0 32 20" aria-hidden="true">
            <path class="eye-lid" d="M1,10 Q16,-3 31,10 Q16,23 1,10 Z" />
            <circle class="eye-iris" cx="16" cy="10" r="5.5" />
            <circle class="eye-pupil" cx="16" cy="10" r="2.1" />
          </svg>
        </button>
        {#if onSelect}
          <button class="button button-primary" on:click={handleSelect} disabled={disabled}>
            {selected ? 'Selected' : 'Select'}
          </button>
        {/if}
      </div>

      {#if selected && onSelect}
        <div class="mini-bet-slip" role="group" aria-label="Quick bet on {monster.name}">
          <div class="mini-bet-row">
            <input
              type="number"
              class="mini-bet-input"
              bind:value={miniBetAmount}
              min="1"
              max={$candies}
              aria-label="Bet amount"
            />
            <button
              class="button button-primary mini-icon-btn"
              aria-label="Place bet"
              title="Place bet"
              on:click={handleMiniApply}
              disabled={!miniCanBet}
            >✓</button>
            <button
              class="button button-danger mini-icon-btn"
              aria-label="Cancel"
              title="Cancel"
              on:click={handleMiniCancel}
            >✕</button>
          </div>
          <div class="mini-bet-shortcuts">
            <button class="button button-secondary mini-shortcut" on:click={() => setMiniPercentage(0.25)} disabled={$candies < 4}>1/4</button>
            <button class="button button-secondary mini-shortcut" on:click={() => setMiniPercentage(0.5)} disabled={$candies < 2}>1/2</button>
            <button class="button button-secondary mini-shortcut" on:click={() => setMiniPercentage(1)}>ALL</button>
          </div>
          {#if miniBetError}
            <p class="mini-bet-error">{miniBetError}</p>
          {/if}
        </div>
      {/if}
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
            <span class="value">{monster.weight} lbs</span>
          </div>
        </div>
      </div>

      <div class="info-section">
        <h4>Behavioral Analysis</h4>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">Racing Style:</span>
            <span class="value"><RichText text={monster.racingStyle} /></span>
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
    /* Grid rows stretch each card's wrapper to match the tallest sibling in
       the row (CSS Grid's default align-items: stretch); fill that height
       here so the visible card border grows to match, not just the wrapper. */
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  /* ── Sigil burn (idea 1): occult sigil flashes over the card on bet ── */
  .sigil-burn {
    position: absolute;
    inset: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .sigil-burn svg {
    width: 65%;
    height: 65%;
    overflow: visible;
    animation: sigil-fade 1.3s ease-out forwards;
  }

  .sigil-ring {
    fill: none;
    stroke: var(--candy-color);
    stroke-width: 2;
    stroke-dasharray: 503;
    stroke-dashoffset: 503;
    animation: sigil-draw 0.7s ease-out forwards;
    filter: drop-shadow(0 0 6px rgba(201, 169, 97, 0.8));
  }

  .sigil-tri {
    fill: none;
    stroke: var(--eldritch-purple);
    stroke-width: 2;
    stroke-dasharray: 400;
    stroke-dashoffset: 400;
    animation: sigil-draw 0.7s ease-out 0.15s forwards;
    filter: drop-shadow(0 0 6px rgba(155, 135, 197, 0.7));
  }

  .sigil-core {
    fill: var(--candy-color);
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    animation: sigil-flash 0.5s ease-out 0.6s forwards;
  }

  @keyframes sigil-draw {
    to { stroke-dashoffset: 0; }
  }

  @keyframes sigil-flash {
    0%   { opacity: 0; transform: scale(1); }
    40%  { opacity: 1; transform: scale(2.2); }
    100% { opacity: 0; transform: scale(0.8); }
  }

  @keyframes sigil-fade {
    0%, 55% { opacity: 1; transform: scale(1); }
    100%    { opacity: 0; transform: scale(1.15); }
  }

  @media (prefers-reduced-motion: reduce) {
    .sigil-burn svg,
    .sigil-ring,
    .sigil-tri,
    .sigil-core {
      animation: none;
    }
    .sigil-burn {
      display: none;
    }
  }

  .monster-card.is-champion {
    border-color: rgba(201, 169, 97, 0.45);
  }

  /* Legendary horrors — the unique, one-off spawns — get a distinct shimmering
     border so they read as rarer than an ordinary returning champion. */
  .monster-card.is-legendary {
    border-color: var(--eldritch-purple);
    animation: legendary-shimmer 3.5s ease-in-out infinite;
  }

  .monster-card.is-legendary::before {
    border-color: rgba(155, 135, 197, 0.5);
  }

  .monster-card.is-legendary::after {
    background: var(--eldritch-purple);
    box-shadow: 0 0 8px rgba(155, 135, 197, 0.7);
  }

  @keyframes legendary-shimmer {
    0%, 100% {
      box-shadow: 0 0 14px rgba(155, 135, 197, 0.25), var(--shadow);
    }
    50% {
      box-shadow: 0 0 28px rgba(155, 135, 197, 0.5), var(--shadow);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .monster-card.is-legendary {
      animation: none;
      box-shadow: 0 0 16px rgba(155, 135, 197, 0.35), var(--shadow);
    }
  }

  /* Legendary name — larger and rendered in the same metallic-gold shimmer
     used by the <gold> RichText tag, so it reads as a title, not just a label. */
  .monster-card.is-legendary .monster-header h3 {
    font-size: 1.6rem;
    background: linear-gradient(
      90deg,
      #8a6e2a 0%,
      #c9a961 30%,
      #f0d080 50%,
      #c9a961 70%,
      #8a6e2a 100%
    );
    background-size: 200% auto;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
    text-shadow: 0 0 16px rgba(201, 169, 97, 0.5);
    animation: legendary-name-shimmer 4s linear infinite;
  }

  @keyframes legendary-name-shimmer {
    0%   { background-position: 200% center; }
    100% { background-position: -200% center; }
  }

  @media (prefers-reduced-motion: reduce) {
    .monster-card.is-legendary .monster-header h3 {
      animation: none;
      background-position: 0% center;
    }
  }

  /* ── Status strip — champion/legendary/veteran collapsed into one row
     of small chips instead of three separately-styled blocks ── */
  .status-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 0.6rem;
  }

  .status-chip {
    font-family: 'Cinzel', serif;
    font-size: 0.62rem;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    padding: 0.2rem 0.55rem;
    border: 1px solid var(--border-ancient);
    background: var(--bg-secondary);
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .status-legendary {
    color: var(--eldritch-purple);
    border-color: var(--eldritch-purple);
  }

  .status-champion {
    color: var(--candy-color);
    border-color: var(--candy-color);
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

  .monster-header {
    margin-bottom: 0.6rem;
  }

  .monster-header h3 {
    color: var(--eldritch-purple);
    margin: 0;
    font-size: 1.3rem;
    letter-spacing: 2px;
  }

  .monster-origin {
    margin: 0.2rem 0 0;
    font-size: 0.82rem;
    font-style: italic;
    color: var(--text-secondary);
  }

  .bet-total-indicator {
    padding: 0.35rem 0.6rem;
    margin-bottom: 0.6rem;
    border-left: 3px solid var(--candy-color);
    background: rgba(201, 169, 97, 0.08);
    color: var(--candy-color);
    font-weight: 600;
    font-size: 0.85rem;
  }

  .description {
    margin: 0 0 0.9rem;
    line-height: 1.6;
    font-size: 0.95rem;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* ── Trait pills — Racing Style / Temperament / Body Type read as lore
     tags to decode over time, not a stat table. Color comes from each
     field's own RichText tag, so no extra styling is needed here. ── */
  .trait-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 1rem;
  }

  .trait-pill {
    font-size: 0.75rem;
    padding: 0.25rem 0.6rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-ancient);
    color: var(--text-secondary);
  }

  /* Grows to absorb the leftover height when a card is stretched to match
     a taller sibling in its grid row, so the actions row still lines up
     across cards instead of leaving a gap at the very bottom. */
  .monster-compact-info {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: auto;
    padding-top: 1rem;
  }

  .actions .button-primary {
    flex: 1;
    font-size: 0.75rem;
    padding: 0.6rem 1rem;
  }

  /* ── Dossier eye — an idly-watching eye that invites a click rather than
     a labeled button, in keeping with "details live on the Bio page." ── */
  .dossier-btn {
    flex-shrink: 0;
    width: 48px;
    height: 44px;
    padding: 0.4rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dossier-eye {
    width: 100%;
    height: auto;
    overflow: visible;
    animation: eye-blink 5s ease-in-out infinite;
  }

  .eye-lid {
    fill: var(--bg-primary);
    stroke: var(--text-secondary);
    stroke-width: 1.5;
    transition: stroke 0.25s ease;
  }

  .eye-iris {
    fill: var(--eldritch-purple);
    transition: fill 0.25s ease;
    animation: eye-drift 6s ease-in-out infinite;
    transform-origin: 16px 10px;
  }

  .eye-pupil {
    fill: var(--bg-primary);
  }

  .dossier-btn:hover .eye-lid,
  .dossier-btn:focus-visible .eye-lid {
    stroke: var(--candy-color);
  }

  .dossier-btn:hover .eye-iris,
  .dossier-btn:focus-visible .eye-iris {
    fill: var(--candy-color);
    filter: drop-shadow(0 0 4px rgba(201, 169, 97, 0.8));
    animation-play-state: paused;
  }

  @keyframes eye-drift {
    0%, 100% { transform: translateX(0); }
    50% { transform: translateX(2px); }
  }

  @keyframes eye-blink {
    0%, 92%, 100% { transform: scaleY(1); }
    95% { transform: scaleY(0.1); }
  }

  @media (prefers-reduced-motion: reduce) {
    .eye-iris,
    .dossier-eye {
      animation: none;
    }
  }

  /* ── Mobile mini betting slip ── */
  .mini-bet-slip {
    display: none;
  }

  @media (max-width: 768px) {
    .monster-card.selected .actions {
      display: none;
    }

    .mini-bet-slip {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      margin-top: 1rem;
    }
  }

  .mini-bet-row {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
  }

  .mini-bet-input {
    flex: 1;
    min-width: 0;
    font-size: 1.1rem;
    font-weight: 700;
    text-align: center;
  }

  .mini-icon-btn {
    flex-shrink: 0;
    width: 48px;
    padding: 0.5rem;
    font-size: 1.1rem;
    line-height: 1;
  }

  .mini-bet-shortcuts {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .mini-shortcut {
    padding: 0.45rem;
    font-size: 0.7rem;
  }

  .mini-bet-error {
    margin: 0;
    font-size: 0.75rem;
    font-style: italic;
    color: var(--eldritch-red);
    text-align: center;
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
