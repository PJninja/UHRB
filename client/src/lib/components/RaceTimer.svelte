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
  <div class="timer-icon">⏳</div>
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
    font-size: 3rem;
    line-height: 1;
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
</style>
