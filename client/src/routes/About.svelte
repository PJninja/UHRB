<script>
  import { onMount, onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';

  const GLYPHS = ['ᛟ', 'ᚦ', 'ᛇ', 'ᚷ', 'ᛉ', 'ᚱ', 'ᛏ', 'ᛒ'];
  let glyphIndex = 0;
  let fading = false;
  let interval;

  onMount(() => {
    interval = setInterval(() => {
      fading = true;
      setTimeout(() => {
        glyphIndex = (glyphIndex + 1) % GLYPHS.length;
        fading = false;
      }, 600);
    }, 2200);
  });

  onDestroy(() => clearInterval(interval));
</script>

<div class="about-page">
  <div class="header">
    <h1>About</h1>
  </div>

  <div class="card about-card">
    <div class="sigil" class:fading>{GLYPHS[glyphIndex]}</div>
    <h2 class="creator-name">Anthony Liparulo</h2>
    <p class="text-muted creator-label">Developer</p>
    <a
      class="site-link"
      href="https://www.idotdot.com"
      target="_blank"
      rel="noopener noreferrer"
    >
      www.idotdot.com
    </a>
  </div>

  <div class="actions">
    <button class="button button-primary" on:click={() => push('/')}>
      Return to the Track
    </button>
  </div>
</div>

<style>
  .about-page {
    max-width: 480px;
    margin: 0 auto;
    padding: 2rem 1rem 4rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
  }

  .header h1 {
    text-align: center;
    font-size: 2rem;
    letter-spacing: 0.15em;
  }

  .about-card {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 2.5rem 2rem;
    text-align: center;
  }

  .sigil {
    font-size: 3rem;
    opacity: 0.5;
    line-height: 1;
    transition: opacity 0.6s ease;
  }

  .sigil.fading {
    opacity: 0;
  }

  .creator-name {
    font-size: 1.6rem;
    letter-spacing: 0.08em;
    margin: 0;
  }

  .creator-label {
    margin: 0;
    font-size: 0.85rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .site-link {
    margin-top: 0.5rem;
    color: var(--accent, #a07cc5);
    text-decoration: none;
    font-size: 1rem;
    letter-spacing: 0.06em;
    border-bottom: 1px solid currentColor;
    transition: opacity 0.15s;
  }

  .site-link:hover {
    opacity: 0.75;
  }

  .actions {
    display: flex;
    justify-content: center;
  }
</style>
