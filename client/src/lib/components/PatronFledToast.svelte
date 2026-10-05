<script>
  import { patronFledEvent, clearPatronFledEvent } from '../stores/patron.js';

  let fledTimeout;

  $: if ($patronFledEvent) {
    clearTimeout(fledTimeout);
    fledTimeout = setTimeout(() => clearPatronFledEvent(), 6000);
  }
</script>

{#if $patronFledEvent}
  <div class="patron-toast">
    <span class="toast-icon">☠</span>
    <span><strong>{$patronFledEvent}</strong> has fled — they will not return.</span>
    <button class="toast-dismiss" on:click={clearPatronFledEvent} aria-label="Dismiss">×</button>
  </div>
{/if}

<style>
  .patron-toast {
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9998;
    background: linear-gradient(135deg, var(--eldritch-red) 0%, #6b2a2a 100%);
    color: #e6dcc8;
    padding: 0.75rem 1.25rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    box-shadow: var(--shadow-large);
    max-width: 90vw;
  }

  .toast-icon {
    font-size: 1.2rem;
  }

  .toast-dismiss {
    background: none;
    border: none;
    color: inherit;
    font-size: 1.2rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 0.25rem;
  }
</style>
