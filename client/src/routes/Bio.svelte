<script>
  import { push } from 'svelte-spa-router';
  import { monsters } from '../lib/stores/monsters.js';
  import { monsterHistory } from '../lib/stores/history.js';
  import { getMonsterBio } from '../lib/services/api.js';
  import BettingContext from '../lib/components/BettingContext.svelte';
  import RichText from '../lib/components/RichText.svelte';
  import RaceTimer from '../lib/components/RaceTimer.svelte';
  import StatBar from '../lib/components/StatBar.svelte';

  export let params = {};

  $: monster = $monsters.find(m => m.id === params.id);
  $: record = monster ? $monsterHistory[monster.id] : null;

  let bioData = null;
  let bioLoading = false;

  $: if (params.id) {
    bioData = null;
    bioLoading = true;
    getMonsterBio(params.id)
      .then(data => { bioData = data; })
      .catch(() => { bioData = null; })
      .finally(() => { bioLoading = false; });
  }

  const FAVOR_TIERS = {
    1: { label: 'Despised',   desc: 'The crowd has little faith. Those who bet here may be rewarded.' },
    2: { label: 'Overlooked', desc: 'Few expect greatness here. There may be value in that doubt.' },
    3: { label: 'Noticed',    desc: 'A known quantity. The crowd has formed its opinion.' },
    4: { label: 'Favoured',   desc: 'Popular among bettors. Their confidence is already priced in.' },
    5: { label: 'Beloved',    desc: 'The crowd adores this horror. Expectations are high — and costly.' },
  };

  // Color mapping for each stat (matching RichText colors for thematic consistency)
  const STAT_COLORS = {
    speed:     'var(--candy-color)',      // glow → tarnished gold
    endurance: '#6b5a44',                 // ancient → earth tone
    madness:   'var(--eldritch-purple)',  // madness → purple
    strength:  'var(--eldritch-red)',     // blood → red
  };

  $: favorColor = !monster ? '#6b5a44'
    : monster.audienceFavor <= 2 ? '#4a5fa5'
    : monster.audienceFavor === 3 ? '#6b5a44'
    : 'var(--candy-color)';
</script>

<div class="bio-page">
  <div class="page-header">
    <button class="button button-secondary back-button" on:click={() => push('/')}>
      ← Back to Race
    </button>
    <h1 class="page-title">Horror Dossier</h1>
  </div>

  {#if monster}
    <!-- Hero -->
    <div class="bio-hero card">
      {#if monster.isLegendary}
        <div class="legendary-badge">⚝ Legendary Horror</div>
      {/if}
      {#if monster.isReturningChampion}
        <div class="champion-badge">ᛟ Returning Champion</div>
      {/if}
      <h2 class="monster-name"><RichText text={monster.name} /></h2>
    </div>

    <!-- Origin strip -->
    <div class="origin-strip">
      <span class="origin-strip-label">Origin</span>
      <span class="origin-strip-value"><RichText text={monster.location} /></span>
    </div>

    <!-- Two-column body -->
    <div class="bio-body">
      <div class="bio-main">

        <!-- Description -->
        <section class="bio-section bio-section-prose">
          {#if bioLoading}
            <p class="bio-loading">Consulting the archives…</p>
          {:else if bioData}
            <RichText text={bioData.description} tag="p" />
          {/if}
        </section>

        <!-- On the Record -->
        <section class="bio-section bio-section-prose">
          <h3 class="section-heading">On the Record</h3>
          {#if bioLoading}
            <p class="bio-loading">Consulting the archives…</p>
          {:else if bioData}
            <RichText text={bioData.blurb} tag="p" />
          {/if}
        </section>

        <!-- Physical Characteristics -->
        <section class="bio-section">
          <h3 class="section-heading">Physical Characteristics</h3>
          <div class="info-grid">
            <div class="info-item">
              <span class="label">Body Type</span>
              <span class="value"><RichText text={monster.bodyType} /></span>
            </div>
            <div class="info-item">
              <span class="label">Distinctive Features</span>
              <span class="value">
                {#if bioData}
                  <RichText text={bioData.features} />
                {:else}
                  <span class="bio-loading">—</span>
                {/if}
              </span>
            </div>
            <div class="info-item">
              <span class="label">Height</span>
              <span class="value">{bioData ? `${bioData.height} meters` : '—'}</span>
            </div>
            <div class="info-item">
              <span class="label">Weight</span>
              <span class="value">{bioData ? `${bioData.weight} lbs` : '—'}</span>
            </div>
          </div>
        </section>

        <!-- Behavioral Analysis -->
        <section class="bio-section">
          <h3 class="section-heading">Behavioral Analysis</h3>
          <div class="info-grid">
            <div class="info-item">
              <span class="label">Racing Style</span>
              <span class="value"><RichText text={monster.racingStyle} /></span>
            </div>
            <div class="info-item">
              <span class="label">Temperament</span>
              <span class="value"><RichText text={monster.temperament} /></span>
            </div>
          </div>
        </section>

        <!-- Racing Record -->
        {#if record?.appearances > 0}
          <section class="bio-section">
            <h3 class="section-heading">Racing Record</h3>
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
          </section>
        {/if}

      </div>

      <!-- Aside: betting context, audience favor, physical manifestation -->
      <aside class="bio-aside">
        <RaceTimer />
        <BettingContext {monster} />

        {#if monster.audienceFavor}
          <div class="favor-card card">
            <h3 class="aside-heading">Audience Favor</h3>
            <div class="favor-bar" style="--favor-color: {favorColor}">
              {#each Array(5) as _, i}
                <div class="favor-pip" class:filled={i < monster.audienceFavor}></div>
              {/each}
            </div>
            <div class="favor-label">
              <span class="favor-tier">{FAVOR_TIERS[monster.audienceFavor]?.label}</span>
              <span class="favor-desc">{FAVOR_TIERS[monster.audienceFavor]?.desc}</span>
            </div>
            {#if monster.isReturningChampion}
              <p class="favor-champion-note">Champion status has elevated their standing with the crowd.</p>
            {/if}
          </div>
        {/if}

        {#if monster.statVisibility && monster.traits}
          <div class="stats-card card">
            <h3 class="aside-heading">Physical Manifestation</h3>
            <div class="stats-grid">
              <StatBar
                label="Speed"
                value={monster.traits.speed}
                visible={monster.statVisibility.speed}
                color={STAT_COLORS.speed}
              />
              <StatBar
                label="Endurance"
                value={monster.traits.endurance}
                visible={monster.statVisibility.endurance}
                color={STAT_COLORS.endurance}
              />
              <StatBar
                label="Madness"
                value={monster.traits.madness}
                visible={monster.statVisibility.madness}
                color={STAT_COLORS.madness}
              />
              <StatBar
                label="Strength"
                value={monster.traits.strength}
                visible={monster.statVisibility.strength}
                color={STAT_COLORS.strength}
              />
            </div>
          </div>
        {/if}
      </aside>
    </div>

  {:else}
    <div class="not-found card">
      <h2>Horror Not Found</h2>
      <p>The creature you seek has vanished into the void.</p>
      <button class="button button-primary" on:click={() => push('/')}>
        Return to Race
      </button>
    </div>
  {/if}
</div>

<style>
  .bio-page {
    padding: 2rem;
    max-width: 1100px;
    margin: 0 auto;
  }

  /* ── Page header ── */
  .page-header {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .back-button {
    align-self: flex-start;
  }

  .page-title {
    text-align: center;
    margin: 0;
    font-size: 3.5rem;
  }

  /* ── Hero card ── */
  .bio-hero {
    text-align: center;
    padding: 2.5rem 2rem;
    margin-bottom: 2rem;
    background: linear-gradient(
      135deg,
      var(--bg-card) 0%,
      rgba(107, 90, 142, 0.08) 100%
    );
    border-color: var(--border-glow);
  }

  .legendary-badge {
    font-family: 'Cinzel', serif;
    font-size: 0.7rem;
    color: var(--eldritch-purple);
    letter-spacing: 6px;
    text-transform: uppercase;
    margin-bottom: 0.5rem;
    padding: 0.25rem 0.75rem;
    border: 1px solid var(--eldritch-purple);
    box-shadow: 0 0 8px color-mix(in srgb, var(--eldritch-purple) 60%, transparent),
                inset 0 0 8px color-mix(in srgb, var(--eldritch-purple) 15%, transparent);
    display: inline-block;
  }

  .champion-badge {
    font-family: 'Cinzel', serif;
    font-size: 0.7rem;
    color: var(--candy-color);
    letter-spacing: 4px;
    text-transform: uppercase;
    margin-bottom: 0.75rem;
  }

  .monster-name {
    font-size: 2.8rem;
    color: var(--eldritch-purple);
    margin: 0 0 0.5rem 0;
    letter-spacing: 2px;
    line-height: 1.2;
    border-left: none;
    padding-left: 0;
    overflow-wrap: break-word;
  }


  /* ── Origin strip ── */
  .origin-strip {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    padding: 0.75rem 1.5rem;
    margin-bottom: 2rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-ancient);
    border-left: 3px solid var(--eldritch-purple);
  }

  .origin-strip-label {
    font-family: 'Cinzel', serif;
    font-size: 0.6rem;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .origin-strip-value {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  /* ── Two-column layout ── */
  .bio-body {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 2rem;
    align-items: start;
  }

  /* ── Aside ── */
  .bio-aside {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-self: start;
    position: sticky;
    top: 2rem;
  }

  .favor-card {
    padding: 1.25rem;
  }

  /* ── Main column ── */
  .bio-main {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .bio-section {
    padding: 1.5rem 0;
    border-bottom: 1px solid var(--border-ancient);
  }

  .bio-section:last-child {
    border-bottom: none;
  }

  .bio-section :global(p) {
    margin: 0;
    line-height: 1.8;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .bio-section-prose :global(p) {
    font-size: 1.3rem;
    line-height: 1.9;
  }

  .section-heading {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 3px;
    color: var(--text-secondary);
    margin: 0 0 1rem 0;
    padding: 0 0 0 0.6rem;
    border: none;
    border-left: 2px solid var(--eldritch-purple);
  }

  .aside-heading {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 3px;
    color: var(--text-secondary);
    margin: 0 0 1rem 0;
    padding: 0 0 0 0.6rem;
    border: none;
    border-left: 2px solid var(--eldritch-purple);
  }

  /* ── Info grid ── */
  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
  }

  .info-item {
    background: var(--bg-secondary);
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-ancient);
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-secondary);
  }

  .value {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  /* ── Audience Favor ── */
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

  /* ── Stats card ── */
  .stats-card {
    padding: 1.25rem;
    margin-top: 1rem;
  }

  .stats-grid {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* ── Bio loading ── */
  .bio-loading {
    color: var(--text-secondary);
    font-style: italic;
    opacity: 0.5;
    margin: 0;
  }

  /* ── Not found ── */
  .not-found {
    text-align: center;
    padding: 3rem 2rem;
  }

  .not-found h2 {
    color: var(--eldritch-red);
    margin-bottom: 1rem;
  }

  .not-found p {
    margin-bottom: 2rem;
    font-size: 1.1rem;
  }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .bio-page {
      padding: 1rem;
    }

    .bio-body {
      grid-template-columns: 1fr;
    }

    .bio-aside {
      order: -1;
      position: static;
    }

    .monster-name {
      font-size: 1.8rem;
    }

    .page-title {
      font-size: 2rem;
    }
  }
</style>
