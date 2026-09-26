<script>
  import { onMount } from 'svelte';
  import { nextRaceTime } from '../stores/game.js';

  let timeRemaining = 0;

  function calcRemaining(target) {
    if (!target) return 0;
    return Math.max(0, Math.floor((target - Date.now()) / 1000));
  }

  // Format time remaining
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  onMount(() => {
    timeRemaining = calcRemaining($nextRaceTime);
    const interval = setInterval(() => {
      timeRemaining = calcRemaining($nextRaceTime);
    }, 1000);
    return () => clearInterval(interval);
  });

  // Re-sync immediately when the server gives us a new race time.
  // The interval ticks every second thereafter; this just snaps the display on state change.
  $: if ($nextRaceTime) { timeRemaining = calcRemaining($nextRaceTime); }

  // Check if timer is urgent (less than 30 seconds)
  $: isUrgent = timeRemaining > 0 && timeRemaining < 30;
  $: isVeryUrgent = timeRemaining > 0 && timeRemaining < 10;
</script>

<div class="race-timer" class:urgent={isUrgent} class:very-urgent={isVeryUrgent}>
  <div class="timer-icon" aria-hidden="true">
    <svg viewBox="0 0 48 48">
      <circle class="timer-icon-ring" cx="24" cy="24" r="17" />
      <g class="timer-icon-ticks">
        <line x1="42" y1="24" x2="45" y2="24" />
        <line x1="36.73" y1="36.73" x2="38.85" y2="38.85" />
        <line x1="24" y1="42" x2="24" y2="45" />
        <line x1="11.27" y1="36.73" x2="9.15" y2="38.85" />
        <line x1="6" y1="24" x2="3" y2="24" />
        <line x1="11.27" y1="11.27" x2="9.15" y2="9.15" />
        <line x1="24" y1="6" x2="24" y2="3" />
        <line x1="36.73" y1="11.27" x2="38.85" y2="9.15" />
      </g>
      <path class="timer-icon-glass" d="M17,15 L31,15 L24,24 L31,33 L17,33 L24,24 Z" />
      <circle class="timer-icon-sand" cx="24" cy="24" r="1.3" />
    </svg>
  </div>
  <div class="timer-content">
    <div class="timer-label">Next Race Begins In</div>
    <div class="timer-display">
      {#if timeRemaining > 0}
        {formatTime(timeRemaining)}
      {:else}
        STARTING...
      {/if}
    </div>
    {#if isVeryUrgent}
      <div class="urgency-warning">PLACE YOUR BETS NOW!</div>
    {:else if isUrgent}
      <div class="urgency-warning">Time Running Out!</div>
    {/if}
  </div>
  <slot name="action" />
</div>

<style>
  .race-timer {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 1.5rem;
    background: var(--bg-card);
    border: 4px solid var(--border-ancient);
    border-bottom: 6px solid var(--border-ancient);
    box-shadow: var(--shadow);
    transition: all 0.3s ease;
  }

  .race-timer.urgent {
    border-color: #c9a961;
    background: linear-gradient(180deg, var(--bg-card) 0%, #2a2520 100%);
  }

  .race-timer.very-urgent {
    border-color: var(--eldritch-red);
    background: linear-gradient(180deg, var(--bg-card) 0%, #3a2020 100%);
    animation: pulse-urgent 1s ease-in-out infinite;
  }

  @keyframes pulse-urgent {
    0%, 100% {
      box-shadow: var(--shadow);
    }
    50% {
      box-shadow: 0 0 20px rgba(139, 58, 58, 0.6), var(--shadow);
    }
  }

  .timer-icon {
    width: 3rem;
    height: 3rem;
    flex-shrink: 0;
    color: var(--eldritch-purple);
  }

  .timer-icon svg {
    width: 100%;
    height: 100%;
    display: block;
  }

  .timer-icon-ring {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    opacity: 0.55;
  }

  .timer-icon-ticks line {
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    opacity: 0.75;
  }

  .timer-icon-glass {
    fill: currentColor;
    fill-opacity: 0.18;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linejoin: round;
  }

  .timer-icon-sand {
    fill: currentColor;
  }

  .urgent .timer-icon {
    color: var(--candy-color);
  }

  .very-urgent .timer-icon {
    color: var(--eldritch-red);
  }

  .timer-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .timer-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--text-secondary);
    font-weight: 600;
  }

  .timer-display {
    font-family: 'Cinzel', 'Garamond', serif;
    font-size: 2.5rem;
    font-weight: 900;
    letter-spacing: 4px;
    color: var(--eldritch-purple);
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    line-height: 1;
  }

  .urgent .timer-display {
    color: var(--candy-color);
  }

  .very-urgent .timer-display {
    color: var(--eldritch-red);
    animation: shake 0.5s ease-in-out infinite;
  }

  @keyframes shake {
    0%, 100% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(-2px);
    }
    75% {
      transform: translateX(2px);
    }
  }

  .urgency-warning {
    font-size: 0.85rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--eldritch-red);
    margin-top: 0.25rem;
    animation: blink 1s ease-in-out infinite;
  }

  @keyframes blink {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  /* ── Mobile: pin to the top of the screen on scroll, shrunk 20% ──── */
  @media (max-width: 768px) {
    .race-timer {
      position: sticky;
      top: 0;
      z-index: 30;
      gap: 1.2rem;
      padding: 1.2rem;
      border-width: 3px;
      border-bottom-width: 5px;
    }

    .timer-icon {
      width: 2.4rem;
      height: 2.4rem;
    }

    .timer-content {
      gap: 0.2rem;
    }

    .timer-label {
      font-size: 0.6rem;
    }

    .timer-display {
      font-size: 2rem;
      letter-spacing: 3.2px;
    }

    .urgency-warning {
      font-size: 0.68rem;
    }
  }
</style>
