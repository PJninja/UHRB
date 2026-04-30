<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import Router from 'svelte-spa-router';
  import { push } from 'svelte-spa-router';
  import Home from './routes/Home.svelte';
  import Bio from './routes/Bio.svelte';
  import Race from './routes/Race.svelte';
  import Results from './routes/Results.svelte';
  import History from './routes/History.svelte';
  import { raceState, updateServerRaceState, setCandyBalance, candies } from './lib/stores/game.js';
  import { sessionId } from './lib/stores/session.js';
  import { setMonsters } from './lib/stores/monsters.js';
  import { createSession, validateSession } from './lib/services/api.js';
  import { startSocket, stopSocket } from './lib/services/raceSocket.js';
  import { connection } from './lib/stores/connection.js';

  const routes = {
    '/': Home,
    '/bio/:id': Bio,
    '/race': Race,
    '/results': Results,
    '/history': History,
  };

  let initializationError = null;
  let isInitializing = true;

  // Initialize session and start polling on mount
  onMount(async () => {
    try {
      // 1. Initialize or resume session
      let session = $sessionId;

      if (!session) {
        // Create new session, carrying over any balance persisted in localStorage
        const response = await createSession({ claimedBalance: get(candies) });
        sessionId.set(response.sessionId);
        setCandyBalance(response.candyBalance);
        session = response.sessionId;
        console.log('[App] Created new session:', session);
      } else {
        // Validate existing session
        try {
          const validation = await validateSession(session);
          if (!validation.valid) {
            // Session expired — create new one, carrying over persisted balance
            const response = await createSession({ claimedBalance: get(candies) });
            sessionId.set(response.sessionId);
            setCandyBalance(response.candyBalance);
            session = response.sessionId;
            console.log('[App] Session expired, created new one:', session);
          } else {
            // Sync authoritative balance from server
            setCandyBalance(validation.candyBalance);
            console.log('[App] Resumed session:', session);
          }
        } catch (error) {
          console.error('[App] Session validation failed:', error);
          // Create new session on error, carrying over persisted balance
          const response = await createSession({ claimedBalance: get(candies) });
          sessionId.set(response.sessionId);
          setCandyBalance(response.candyBalance);
          session = response.sessionId;
        }
      }

      // 2. Connect to WebSocket for race updates
      startSocket((raceData) => {
        updateServerRaceState(raceData);
        setMonsters(raceData.monsters);
      });

      isInitializing = false;

      // Cleanup on unmount
      return () => {
        stopSocket();
      };
    } catch (error) {
      console.error('[App] Initialization failed:', error);
      initializationError = error.message;
      isInitializing = false;
    }
  });

  // When a race starts server-side, always navigate to the race page
  // regardless of where the user currently is — the race takes priority.
  $: if ($raceState === 'racing') {
    push('/race');
  }

  function retryConnection() {
    window.location.reload();
  }
</script>

<div class="app">
  {#if isInitializing}
    <div class="initialization-screen">
      <div class="loading-content">
        <h1>UHRB</h1>
        <p class="subtitle">Unspeakable Horrors Race Betting</p>
        <div class="loading-spinner"></div>
        <p class="loading-text">Awakening the ancient horrors...</p>
      </div>
    </div>
  {:else if initializationError}
    <div class="initialization-screen error">
      <div class="error-content">
        <h1>Connection Failed</h1>
        <p class="error-message">{initializationError}</p>
        <p class="error-hint">Make sure the server is running on http://localhost:3000</p>
        <button class="button button-primary" on:click={retryConnection}>
          Retry Connection
        </button>
      </div>
    </div>
  {:else}
    <!-- Connection Status Indicator -->
    {#if !$connection.connected}
      <div class="connection-banner">
        <span class="warning-icon">⚠</span>
        <span>Connection lost. Retrying...</span>
        {#if $connection.consecutiveFailures > 3}
          <button class="reconnect-btn" on:click={retryConnection}>Reconnect</button>
        {/if}
      </div>
    {/if}

    <Router {routes} />
  {/if}
</div>

<style>
  .app {
    width: 100%;
    min-height: 100vh;
  }

  .initialization-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    text-align: center;
    padding: 2rem;
  }

  .loading-content {
    max-width: 500px;
  }

  .loading-content h1 {
    font-size: 4rem;
    margin-bottom: 1rem;
    color: var(--candy-color);
  }

  .subtitle {
    color: var(--text-secondary);
    font-size: 1.2rem;
    margin-bottom: 3rem;
  }

  .loading-spinner {
    width: 60px;
    height: 60px;
    border: 4px solid var(--border-ancient);
    border-top-color: var(--candy-color);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 2rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loading-text {
    color: var(--text-secondary);
    font-style: italic;
    font-size: 1.1rem;
  }

  .error-content {
    max-width: 500px;
  }

  .error-content h1 {
    color: var(--eldritch-red);
    margin-bottom: 1rem;
  }

  .error-message {
    color: var(--text-primary);
    font-size: 1.1rem;
    margin-bottom: 1rem;
  }

  .error-hint {
    color: var(--text-secondary);
    margin-bottom: 2rem;
  }

  .connection-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    background: linear-gradient(135deg, var(--eldritch-red) 0%, #8B3A3A 100%);
    color: white;
    padding: 0.75rem 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    z-index: 9999;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .warning-icon {
    font-size: 1.2rem;
  }

  .reconnect-btn {
    background: white;
    color: var(--eldritch-red);
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.9rem;
    transition: all 0.2s ease;
  }

  .reconnect-btn:hover {
    background: var(--bg-secondary);
  }
</style>
