<script>
  // Shared audience-favor pip meter — used by the Bio aside (full detail)
  // and the Home horror card (compact glance). Never shows raw numbers,
  // only the 1-5 tier the server already exposes via sanitizeMonster.
  import { formatOdds } from '../utils/odds.js';

  export let audienceFavor = null;
  export let variant = 'full'; // 'full' | 'compact'
  export let isChampion = false;
  export let odds = null; // payout multiplier — shown as a ratio (e.g. "5:2") in the compact variant

  const FAVOR_TIERS = {
    1: { label: 'Despised',   desc: 'The crowd has little faith. Those who bet here may be rewarded.' },
    2: { label: 'Overlooked', desc: 'Few expect greatness here. There may be value in that doubt.' },
    3: { label: 'Noticed',    desc: 'A known quantity. The crowd has formed its opinion.' },
    4: { label: 'Favoured',   desc: 'Popular among bettors. Their confidence is already priced in.' },
    5: { label: 'Beloved',    desc: 'The crowd adores this horror. Expectations are high — and costly.' },
  };

  $: tier = FAVOR_TIERS[audienceFavor];
  $: favorColor = !audienceFavor ? '#6b5a44'
    : audienceFavor <= 2 ? '#4a5fa5'
    : audienceFavor === 3 ? '#6b5a44'
    : 'var(--candy-color)';
</script>

{#if audienceFavor && tier}
  <div class="favor-meter" class:compact={variant === 'compact'} style="--favor-color: {favorColor}">
    <div class="favor-bar">
      {#each Array(5) as _, i}
        <div class="favor-pip" class:filled={i < audienceFavor}></div>
      {/each}
    </div>
    <div class="favor-label">
      <span class="favor-tier">{tier.label}</span>
      {#if variant === 'compact' && odds}
        <span class="favor-odds">{formatOdds(odds)}</span>
      {/if}
      {#if variant === 'full'}
        <span class="favor-desc">{tier.desc}</span>
      {/if}
    </div>
    {#if variant === 'full' && isChampion}
      <p class="favor-champion-note">Champion status has elevated their standing with the crowd.</p>
    {/if}
  </div>
{/if}

<style>
  .favor-bar {
    display: flex;
    gap: 4px;
    margin-bottom: 0.75rem;
  }

  .favor-pip {
    width: 12px;
    height: 28px;
    border: 1px solid var(--border-ancient);
    background: var(--bg-secondary);
    transition: background 0.2s ease;
  }

  .favor-pip.filled {
    background: var(--favor-color);
    border-color: var(--favor-color);
    box-shadow: 0 0 6px color-mix(in srgb, var(--favor-color) 60%, transparent);
  }

  .favor-label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .favor-tier {
    font-family: 'Cinzel', serif;
    font-size: 1.1rem;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--favor-color);
  }

  .favor-desc {
    font-size: 1.25rem;
    font-style: italic;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .favor-champion-note {
    margin: 0.75rem 0 0;
    font-size: 0.8rem;
    color: var(--candy-color);
    font-style: italic;
    opacity: 0.8;
  }

  /* ── Compact variant — a single glanceable line for the Home card ── */
  .favor-meter.compact {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }

  .favor-meter.compact .favor-bar {
    margin-bottom: 0;
    gap: 2px;
  }

  .favor-meter.compact .favor-pip {
    width: 7px;
    height: 13px;
  }

  .favor-meter.compact .favor-label {
    flex-direction: row;
  }

  .favor-meter.compact .favor-tier {
    font-size: 0.65rem;
    letter-spacing: 1.5px;
  }

  .favor-odds {
    font-family: 'Cinzel', serif;
    font-size: 0.65rem;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--favor-color);
  }

  .favor-odds::before {
    content: '·';
    margin-right: 0.4rem;
    color: var(--border-ancient);
  }
</style>
