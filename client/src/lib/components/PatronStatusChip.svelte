<script>
  import {
    patron, isBonded, isDistrusted, isOathbreakerCooldown, breakPact,
  } from '../stores/patron.js';
  import { raceState } from '../stores/game.js';
  import ConfirmDialog from './ConfirmDialog.svelte';

  let expanded = false;
  let showBreakConfirm = false;
  let breaking = false;
  let breakError = null;

  $: hidden = !$patron.monsterId && $patron.cooldownRaces === 0;
  // Pacts can only be broken while betting is open (server-enforced)
  $: bettingOpen = $raceState === 'waiting';

  function raceWord(n) {
    return n === 1 ? 'race' : 'races';
  }

  async function confirmBreak() {
    showBreakConfirm = false;
    breaking = true;
    breakError = null;
    try {
      await breakPact();
      expanded = false;
    } catch (err) {
      breakError = err.message;
    } finally {
      breaking = false;
    }
  }
</script>

{#if !hidden}
  <div class="patron-chip" class:bonded={$isBonded} class:distrusted={$isDistrusted} class:cooling={$isOathbreakerCooldown}>
    <button
      class="chip-toggle"
      on:click={() => (expanded = !expanded)}
      aria-expanded={expanded}
      aria-label="Patron status"
    >
      <span class="chip-icon">
        {#if $isBonded}⛧{:else if $isDistrusted}⛓{:else}☓{/if}
      </span>
      {#if $isDistrusted}
        <span class="chip-count">{$patron.trustCooldownRaces}</span>
      {:else if $isOathbreakerCooldown}
        <span class="chip-count">{$patron.cooldownRaces}</span>
      {/if}
    </button>

    {#if expanded}
      <div class="chip-detail card">
        {#if $patron.monsterId}
          <p class="detail-name">{$patron.monsterName || 'Your patron'}</p>
          {#if $isDistrusted}
            <p class="detail-status distrusted">
              Trust wavers — favor returns in {$patron.trustCooldownRaces} {raceWord($patron.trustCooldownRaces)}.
            </p>
          {:else}
            <p class="detail-status bonded">Bonded.</p>
          {/if}
          <button
            class="button button-danger detail-action"
            on:click={() => (showBreakConfirm = true)}
            disabled={breaking || !bettingOpen}
          >
            {breaking ? 'Breaking…' : 'Break the Pact'}
          </button>
          {#if !bettingOpen}
            <p class="detail-status">Pacts are sealed until the next race is called.</p>
          {/if}
        {:else if $isOathbreakerCooldown}
          <p class="detail-status oathbreaker">
            The horrors won't hear you for {$patron.cooldownRaces} more {raceWord($patron.cooldownRaces)}.
          </p>
        {/if}
        {#if breakError}
          <p class="detail-error">{breakError}</p>
        {/if}
      </div>
    {/if}
  </div>
{/if}

{#if showBreakConfirm}
  <ConfirmDialog
    message={`Break your pact with ${$patron.monsterName || 'your patron'}? They will remember this.`}
    confirmLabel="Break the Pact"
    danger
    on:confirm={confirmBreak}
    on:cancel={() => (showBreakConfirm = false)}
  />
{/if}

<style>
  .patron-chip {
    position: relative;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .chip-toggle {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: var(--bg-card);
    border: 3px solid var(--border-ancient);
    color: var(--text-primary);
    padding: 0.4rem 0.6rem;
    cursor: pointer;
    font-family: 'Cinzel', serif;
    box-shadow: var(--shadow);
  }

  .bonded .chip-toggle { border-color: var(--eldritch-green); color: var(--eldritch-green); }
  .distrusted .chip-toggle { border-color: var(--eldritch-red); color: var(--eldritch-red); }
  .cooling .chip-toggle { border-color: var(--text-secondary); color: var(--text-secondary); }

  .chip-icon {
    font-size: 1.2rem;
    line-height: 1;
  }

  .chip-count {
    font-size: 0.75rem;
    font-weight: 700;
  }

  .chip-detail {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 0.5rem;
    z-index: 40;
    padding: 1rem;
    width: 220px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    text-align: center;
  }

  .detail-name {
    font-family: 'Cinzel', serif;
    letter-spacing: 1px;
    color: var(--eldritch-green);
    margin: 0;
  }

  .detail-status {
    font-size: 0.85rem;
    font-style: italic;
    color: var(--text-secondary);
    margin: 0;
  }

  .detail-status.bonded { color: var(--eldritch-green); }
  .detail-status.distrusted { color: var(--eldritch-red); }

  .detail-action {
    font-size: 0.75rem;
    padding: 0.5rem 1rem;
  }

  .detail-error {
    color: var(--eldritch-red);
    font-size: 0.8rem;
    margin: 0;
  }

  @media (max-width: 768px) {
    .chip-toggle {
      padding: 0.3rem 0.45rem;
    }

    .chip-icon {
      font-size: 1rem;
    }

    .chip-detail {
      width: 180px;
    }
  }
</style>
