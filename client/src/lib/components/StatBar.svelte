<script>
  export let label;          // 'Speed', 'Endurance', 'Madness', 'Strength'
  export let value;          // 1-10
  export let visible = true; // Whether to show value or encrypted glyph
  export let color;          // CSS color for filled pips

  // Encrypted glyphs for hidden stats (alchemical/eldritch symbols)
  const HIDDEN_GLYPHS = ['⊗', '⧈', '⧉', '⌘', '⧫', '⬡', '⬢', '⬣'];
  
  // Select a consistent glyph based on label (so same stat always shows same glyph when hidden)
  const glyphIndex = label.charCodeAt(0) % HIDDEN_GLYPHS.length;
  const hiddenGlyph = HIDDEN_GLYPHS[glyphIndex];
</script>

<div class="stat-row">
  <div class="stat-header">
    <span class="stat-label">{label}</span>
    {#if !visible}
      <span class="encrypted-badge" title="Stat obscured by eldritch interference">
        ENCRYPTED
      </span>
    {/if}
  </div>
  
  <div class="stat-bar" style="--stat-color: {color}">
    {#if visible}
      {#each Array(5) as _, i}
        <div class="stat-pip" class:filled={i < value}></div>
      {/each}
      {#if value > 5}
        <div class="stat-pip stat-pip-overflow filled"></div>
      {/if}
    {:else}
      <div class="stat-glitch-bar">
        {#each Array(5) as _, i}
          <span class="glitch-glyph" style="--index: {i}">{hiddenGlyph}</span>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .stat-row {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .stat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .stat-label {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--text-secondary);
    font-family: 'Cinzel', serif;
  }

  .encrypted-badge {
    font-size: 0.5rem;
    letter-spacing: 2px;
    color: #e6dcc8;
    padding: 0.15rem 0.5rem;
    border: 1px solid var(--eldritch-red);
    background: rgba(139, 58, 58, 0.4);
    box-shadow: inset 0 0 4px rgba(0, 0, 0, 0.5);
  }

  /* Bar visual matching Audience Favor */
  .stat-bar {
    display: flex;
    gap: 3px;
    height: 24px;
  }

  .stat-pip {
    flex: 1;
    border: 1px solid var(--border-ancient);
    background: var(--bg-secondary);
    transition: background 0.2s ease, border-color 0.2s ease;
  }

  .stat-pip.filled {
    background: var(--stat-color);
    border-color: var(--stat-color);
    box-shadow: 0 0 4px color-mix(in srgb, var(--stat-color) 50%, transparent);
  }

  /* Overflow pip for stats > 5 */
  .stat-pip-overflow {
    animation: overflow-glow 1.5s ease-in-out infinite;
  }

  @keyframes overflow-glow {
    0%, 100% {
      box-shadow: 0 0 8px var(--stat-color), 0 0 12px color-mix(in srgb, var(--stat-color) 70%, transparent);
      filter: brightness(1.2);
    }
    50% {
      box-shadow: 0 0 16px var(--stat-color), 0 0 24px color-mix(in srgb, var(--stat-color) 90%, transparent);
      filter: brightness(1.5);
    }
  }

  /* Glitching glyphs for hidden stats */
  .stat-glitch-bar {
    display: flex;
    width: 100%;
    justify-content: space-between;
    align-items: center;
    padding: 0 0.25rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-ancient);
  }

  .glitch-glyph {
    font-size: 0.85rem;
    color: var(--eldritch-red);
    opacity: 0.6;
    animation: glyph-glitch 0.8s ease-in-out infinite;
    animation-delay: calc(var(--index) * 0.08s);
  }

  @keyframes glyph-glitch {
    0%, 100% {
      opacity: 0.6;
      transform: translateY(0) scale(1);
    }
    25% {
      opacity: 0.3;
      transform: translateY(-1px) scale(0.95);
    }
    50% {
      opacity: 0.9;
      transform: translateY(1px) scale(1.05);
    }
    75% {
      opacity: 0.4;
      transform: translateY(0.5px) scale(0.98);
    }
  }
</style>
