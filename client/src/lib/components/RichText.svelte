<script>
  import { parseRichText } from '../utils/richText.js';

  export let text = '';
  export let tag = 'span'; // wrapper element
</script>

<svelte:element this={tag} class="rich-text">
  {#each parseRichText(text) as seg}
    {#if seg.effect}
      <span class="rt-{seg.effect}">{seg.text}</span>
    {:else}
      {seg.text}
    {/if}
  {/each}
</svelte:element>

<style>
  .rich-text {
    display: inline;
  }

  /* ── Glow — eldritch purple pulse ── */
  .rt-glow {
    color: var(--text-accent);
    text-shadow:
      0 0 6px rgba(155, 135, 197, 0.8),
      0 0 14px rgba(155, 135, 197, 0.4);
    animation: rt-pulse 3s ease-in-out infinite;
  }

  @keyframes rt-pulse {
    0%, 100% { text-shadow: 0 0 6px rgba(155, 135, 197, 0.8), 0 0 14px rgba(155, 135, 197, 0.4); }
    50%       { text-shadow: 0 0 12px rgba(155, 135, 197, 1),  0 0 28px rgba(155, 135, 197, 0.7); }
  }

  /* ── Gold — tarnished shimmer ── */
  .rt-gold {
    color: var(--candy-color);
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
    animation: rt-shimmer 4s linear infinite;
  }

  @keyframes rt-shimmer {
    0%   { background-position: 200% center; }
    100% { background-position: -200% center; }
  }

  /* ── Blood — deep red ── */
  .rt-blood {
    color: #c0393a;
    text-shadow: 0 1px 4px rgba(139, 58, 58, 0.7);
    animation: rt-bleed 5s ease-in-out infinite;
  }

  @keyframes rt-bleed {
    0%, 100% { color: #c0393a; text-shadow: 0 1px 4px rgba(139, 58, 58, 0.7); }
    50%       { color: #9b2020; text-shadow: 0 2px 8px rgba(139, 58, 58, 1); }
  }

  /* ── Void — near invisible, haunting ── */
  .rt-void {
    color: transparent;
    text-shadow: 0 0 8px rgba(107, 90, 142, 0.15);
    transition: color 0.6s ease, text-shadow 0.6s ease;
    cursor: default;
  }

  .rt-void:hover {
    color: rgba(107, 90, 142, 0.6);
    text-shadow: 0 0 12px rgba(107, 90, 142, 0.5);
  }

  /* ── Madness — unsettling green ── */
  .rt-madness {
    color: #6ecfa0;
    text-shadow: 0 0 6px rgba(110, 207, 160, 0.4);
  }

  /* ── Ancient — aged sepia ── */
  .rt-ancient {
    color: #b8a882;
    font-style: italic;
    letter-spacing: 0.5px;
    opacity: 0.9;
    text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.6);
  }

  /* ── Eldritch — sickly green ── */
  .rt-eldritch {
    color: #4daa7a;
    text-shadow:
      0 0 5px rgba(61, 122, 92, 0.9),
      0 0 12px rgba(61, 122, 92, 0.4);
    animation: rt-eldritch-pulse 4s ease-in-out infinite;
  }

  @keyframes rt-eldritch-pulse {
    0%, 100% { text-shadow: 0 0 5px rgba(61, 122, 92, 0.9), 0 0 12px rgba(61, 122, 92, 0.4); }
    50%       { text-shadow: 0 0 10px rgba(61, 122, 92, 1),  0 0 24px rgba(61, 122, 92, 0.7); }
  }

  /* ── Cosmic — cold indigo drift, vast and unknowable ── */
  .rt-cosmic {
    color: #7b9fd4;
    text-shadow:
      0 0 8px rgba(80, 110, 180, 0.7),
      0 0 20px rgba(50, 80, 160, 0.3);
    animation: rt-cosmic-drift 6s ease-in-out infinite;
  }

  @keyframes rt-cosmic-drift {
    0%   { color: #7b9fd4; text-shadow: 0 0 8px rgba(80, 110, 180, 0.7), 0 0 20px rgba(50, 80, 160, 0.3); }
    33%  { color: #5c7fbf; text-shadow: 0 0 14px rgba(60, 90, 180, 0.9), 0 0 32px rgba(40, 60, 150, 0.5); }
    66%  { color: #9db8e0; text-shadow: 0 0 6px rgba(100, 130, 190, 0.6), 0 0 16px rgba(70, 100, 170, 0.2); }
    100% { color: #7b9fd4; text-shadow: 0 0 8px rgba(80, 110, 180, 0.7), 0 0 20px rgba(50, 80, 160, 0.3); }
  }

  /* ── Infernal — orange-amber fire flicker, heat and hunger ── */
  .rt-infernal {
    color: #e8732a;
    text-shadow:
      0 0 6px rgba(232, 115, 42, 0.9),
      0 0 16px rgba(200, 80, 20, 0.5);
    animation: rt-infernal-flicker 0.2s steps(1) infinite;
  }

  @keyframes rt-infernal-flicker {
    0%  { color: #e8732a; text-shadow: 0 0 6px rgba(232, 115, 42, 0.9), 0 0 16px rgba(200, 80, 20, 0.5); }
    20% { color: #f5a623; text-shadow: 0 0 10px rgba(245, 166, 35, 1),   0 0 24px rgba(220, 120, 20, 0.7); }
    40% { color: #c45820; text-shadow: 0 0 4px rgba(196, 88, 32, 0.8),   0 0 10px rgba(160, 60, 10, 0.4); }
    60% { color: #e8732a; text-shadow: 0 0 8px rgba(232, 115, 42, 1),    0 0 20px rgba(200, 80, 20, 0.6); }
    80% { color: #f0891a; text-shadow: 0 0 12px rgba(240, 137, 26, 0.9), 0 0 28px rgba(210, 100, 15, 0.5); }
  }

  /* ── Spectral — pale blue-white ghostly fade ── */
  .rt-spectral {
    color: #c8dff0;
    text-shadow:
      0 0 8px rgba(180, 210, 240, 0.6),
      0 0 20px rgba(150, 190, 230, 0.2);
    animation: rt-spectral-fade 4s ease-in-out infinite;
  }

  @keyframes rt-spectral-fade {
    0%, 100% { opacity: 1;    color: #c8dff0; text-shadow: 0 0 8px rgba(180, 210, 240, 0.6), 0 0 20px rgba(150, 190, 230, 0.2); }
    30%       { opacity: 0.5; color: #e8f2fc; text-shadow: 0 0 16px rgba(200, 225, 250, 0.9), 0 0 36px rgba(170, 205, 240, 0.5); }
    60%       { opacity: 0.8; color: #aecde8; text-shadow: 0 0 6px rgba(160, 195, 225, 0.5),  0 0 14px rgba(130, 175, 220, 0.2); }
  }

  /* ── Hex — sickly yellow-green cursed aura ── */
  .rt-hex {
    color: #b8d44a;
    text-shadow:
      0 0 6px rgba(160, 190, 50, 0.8),
      0 0 14px rgba(120, 160, 30, 0.4);
    animation: rt-hex-curse 3s ease-in-out infinite;
  }

  @keyframes rt-hex-curse {
    0%, 100% { color: #b8d44a; text-shadow: 0 0 6px rgba(160, 190, 50, 0.8),  0 0 14px rgba(120, 160, 30, 0.4); }
    25%       { color: #96b830; text-shadow: 0 0 10px rgba(130, 170, 40, 1),   0 0 22px rgba(100, 145, 25, 0.7); }
    50%       { color: #cce060; text-shadow: 0 0 4px rgba(180, 210, 70, 0.6),  0 0 10px rgba(150, 190, 50, 0.3); }
    75%       { color: #a8c838; text-shadow: 0 0 12px rgba(150, 185, 45, 0.9), 0 0 26px rgba(110, 155, 28, 0.5); }
  }
</style>
