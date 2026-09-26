<script>
  // Fixed-position overlay that flings a burst of candy glyphs from one
  // DOM element to another. Purely cosmetic feedback for bet placement
  // and payout credit — no text involved.
  let bursts = [];
  let nextId = 0;

  export function fire(fromEl, toEl, { count = 10, glyph = '✦' } = {}) {
    if (!fromEl || !toEl) return;
    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const fx = fromRect.left + fromRect.width / 2;
    const fy = fromRect.top + fromRect.height / 2;
    const tx = toRect.left + toRect.width / 2;
    const ty = toRect.top + toRect.height / 2;

    const id = nextId++;
    const particles = Array.from({ length: count }, (_, i) => ({
      i,
      x: fx + (Math.random() - 0.5) * 30,
      y: fy + (Math.random() - 0.5) * 30,
      dx: (tx - fx) + (Math.random() - 0.5) * 24,
      dy: (ty - fy) + (Math.random() - 0.5) * 24,
      arc: -50 - Math.random() * 70,
      delay: Math.random() * 0.22,
      duration: 0.5 + Math.random() * 0.3,
      size: 0.75 + Math.random() * 0.55,
    }));

    bursts = [...bursts, { id, particles, glyph }];
    setTimeout(() => {
      bursts = bursts.filter(b => b.id !== id);
    }, 1300);
  }
</script>

<div class="candy-stream-layer" aria-hidden="true">
  {#each bursts as burst (burst.id)}
    {#each burst.particles as p (p.i)}
      <span
        class="candy-particle"
        style="
          left: {p.x}px; top: {p.y}px;
          --dx: {p.dx}px; --dy: {p.dy}px; --arc: {p.arc}px;
          animation-delay: {p.delay}s; animation-duration: {p.duration}s;
          font-size: {p.size}rem;
        "
      >{burst.glyph}</span>
    {/each}
  {/each}
</div>

<style>
  .candy-stream-layer {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 60;
    overflow: hidden;
  }

  .candy-particle {
    position: fixed;
    transform: translate(-50%, -50%);
    color: var(--candy-color);
    text-shadow: 0 0 8px rgba(201, 169, 97, 0.8);
    opacity: 0;
    animation-name: candy-fly;
    animation-timing-function: cubic-bezier(0.35, 0.6, 0.25, 1);
    animation-fill-mode: forwards;
  }

  @keyframes candy-fly {
    0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
    12%  { opacity: 1; }
    50%  {
      transform: translate(
        calc(-50% + var(--dx) * 0.5),
        calc(-50% + var(--dy) * 0.5 + var(--arc))
      ) scale(1.1);
    }
    100% {
      opacity: 0;
      transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.6);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .candy-particle {
      display: none;
    }
  }
</style>
