<script>
  import { createEventDispatcher } from 'svelte';

  export let message = '';
  export let confirmLabel = 'Confirm';
  export let cancelLabel = 'Cancel';
  export let danger = false;

  const dispatch = createEventDispatcher();

  function confirm() {
    dispatch('confirm');
  }

  function cancel() {
    dispatch('cancel');
  }

  function onKeydown(event) {
    if (event.key === 'Escape') cancel();
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="dialog-overlay" on:click={cancel}>
  <div class="dialog card" on:click|stopPropagation>
    <p class="dialog-message">{message}</p>
    <div class="dialog-actions">
      <button class="button button-secondary" on:click={cancel}>{cancelLabel}</button>
      <button class="button" class:button-danger={danger} class:button-primary={!danger} on:click={confirm}>
        {confirmLabel}
      </button>
    </div>
  </div>
</div>

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 1.5rem;
  }

  .dialog {
    max-width: 420px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .dialog-message {
    font-style: italic;
    color: var(--text-primary);
    line-height: 1.6;
    margin: 0;
  }

  .dialog-actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
  }

  .dialog-actions .button {
    padding: 0.6rem 1.5rem;
    font-size: 0.8rem;
  }
</style>
