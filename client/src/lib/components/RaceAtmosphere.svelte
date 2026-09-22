<script>
  import { onMount } from 'svelte';
  import { ATMOSPHERE_THEMES, RUNE_GLYPHS } from '../utils/atmosphereThemes.js';

  export let theme = 'ruins';
  export let accent = null; // optional hex from the venue record — tints the primary color

  let canvas;

  onMount(() => {
    const themeCfg = ATMOSPHERE_THEMES[theme] || ATMOSPHERE_THEMES.ruins;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    let W = canvas.width = canvas.offsetWidth;
    let H = canvas.height = canvas.offsetHeight;
    let raf = null;
    const startTime = performance.now();

    function buildParticleLayer(layer) {
      const colors = accent ? [accent, ...layer.colors.slice(1)] : layer.colors;
      const pickColor = () => colors[Math.floor(Math.random() * colors.length)];

      function spawnAt(p) {
        p.size = layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin);
        p.length = layer.lengthMin != null
          ? layer.lengthMin + Math.random() * (layer.lengthMax - layer.lengthMin)
          : p.size;
        // Vertical elongation for 'wisp' — layer-configurable so a small round
        // "spirit" orb and a large elongated gas cloud can both use the shape.
        const stretchMin = layer.stretchMin ?? 1.6, stretchMax = layer.stretchMax ?? 2.8;
        p.stretch = stretchMin + Math.random() * (stretchMax - stretchMin);
        p.speed = layer.speedMin + Math.random() * (layer.speedMax - layer.speedMin);
        p.color = pickColor();
        p.opacity = layer.opacityMin + Math.random() * (layer.opacityMax - layer.opacityMin);
        p.glyph = layer.shape === 'rune' ? RUNE_GLYPHS[Math.floor(Math.random() * RUNE_GLYPHS.length)] : null;
        p.driftX = (Math.random() - 0.5) * 0.06;
        p.flickerPhase = Math.random() * Math.PI * 2;
        p.rotation = Math.random() * Math.PI * 2;
        p.rotationSpeed = (Math.random() - 0.5) * 0.02;
        if (layer.motion === 'wave') {
          const ampMin = layer.waveAmpMin ?? 0.3, ampMax = layer.waveAmpMax ?? 1.2;
          const freqMin = layer.waveFreqMin ?? 0.015, freqMax = layer.waveFreqMax ?? 0.04;
          p.waveAmp = ampMin + Math.random() * (ampMax - ampMin);
          p.waveFreq = freqMin + Math.random() * (freqMax - freqMin);
          p.wavePhase = Math.random() * Math.PI * 2;
        } else if (layer.motion === 'drift') {
          // Wanders in a random, slowly-turning direction instead of a fixed
          // dyDir/dxDir heading — no two particles trace the same path, and
          // motion isn't locked to one axis.
          p.dirAngle = Math.random() * Math.PI * 2;
          const turnMin = layer.turnRateMin ?? 0.015, turnMax = layer.turnRateMax ?? 0.045;
          p.turnRate = turnMin + Math.random() * (turnMax - turnMin);
        }
        return p;
      }

      function resetParticle(p) {
        spawnAt(p);
        if (layer.motion === 'drift') {
          // Re-enter from a random edge, heading roughly back into frame
          // (±~45°) so it doesn't immediately exit again.
          const edge = Math.floor(Math.random() * 4);
          const jitter = (Math.random() - 0.5) * (Math.PI / 2);
          if (edge === 0)      { p.x = Math.random() * W; p.y = -p.size;     p.dirAngle = Math.PI / 2 + jitter; }
          else if (edge === 1) { p.x = W + p.size;         p.y = Math.random() * H; p.dirAngle = Math.PI + jitter; }
          else if (edge === 2) { p.x = Math.random() * W; p.y = H + p.size;  p.dirAngle = -Math.PI / 2 + jitter; }
          else                 { p.x = -p.size;            p.y = Math.random() * H; p.dirAngle = jitter; }
          return;
        }
        // Re-enter from the edge the primary drift direction implies, so
        // particles loop continuously rather than popping mid-screen.
        if (layer.dyDir < 0) { p.x = Math.random() * W; p.y = H + p.size; }
        else if (layer.dyDir > 0) { p.x = Math.random() * W; p.y = -p.size; }
        else if (layer.dxDir > 0) { p.x = -p.size; p.y = Math.random() * H; }
        else { p.x = W + p.size; p.y = Math.random() * H; }
      }

      const particles = Array.from({ length: layer.count }, () =>
        spawnAt({ x: Math.random() * W, y: Math.random() * H })
      );

      return { layer, particles, resetParticle };
    }

    const particleLayers = themeCfg.layers.filter(l => l.kind === 'particles').map(buildParticleLayer);
    const glowLayers = themeCfg.layers.filter(l => l.kind === 'glow');

    function drawParticle(layer, p) {
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;

      if (layer.shape === 'rune') {
        ctx.globalAlpha = p.opacity;
        ctx.font = `${p.size}px 'Cinzel', serif`;
        ctx.textBaseline = 'middle';
        ctx.fillText(p.glyph, p.x, p.y);
      } else if (layer.shape === 'streak') {
        ctx.globalAlpha = p.opacity;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 3, p.y + p.size);
        ctx.stroke();
      } else if (layer.shape === 'blob') {
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, 'transparent');
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (layer.shape === 'ribbon') {
        const grad = ctx.createLinearGradient(p.x - p.size / 2, 0, p.x + p.size / 2, 0);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(0.5, p.color);
        grad.addColorStop(1, 'transparent');
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = grad;
        ctx.fillRect(p.x - p.size / 2, 0, p.size, H);
      } else if (layer.shape === 'spark') {
        const flicker = layer.flicker ? (0.5 + 0.5 * Math.sin(p.flickerPhase)) : 1;
        ctx.globalAlpha = p.opacity * flicker;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (layer.shape === 'ember') {
        // Non-uniform glowing chip — a thin rotated rectangle, not a dot.
        const flicker = layer.flicker ? (0.6 + 0.4 * Math.sin(p.flickerPhase)) : 1;
        ctx.globalAlpha = p.opacity * flicker;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillRect(-p.size / 2, -p.length / 2, p.size, p.length);
        ctx.restore();
      } else if (layer.shape === 'wisp') {
        // Soft, vertically-stretched gas cloud rather than a round blob.
        const flicker = layer.flicker ? (0.5 + 0.5 * Math.sin(p.flickerPhase)) : 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(1, p.stretch);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, 'transparent');
        ctx.globalAlpha = p.opacity * flicker;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    function stepParticle(entry, p) {
      const { layer, resetParticle } = entry;
      if (layer.motion === 'drift') {
        p.dirAngle += (Math.random() - 0.5) * p.turnRate;
        p.x += Math.cos(p.dirAngle) * p.speed;
        p.y += Math.sin(p.dirAngle) * p.speed;
      } else {
        p.y += (layer.dyDir || 0) * p.speed;
        p.x += (layer.dxDir || 0) * p.speed + p.driftX;
        if (layer.motion === 'wave') {
          p.x += Math.sin(p.wavePhase) * p.waveAmp;
          p.wavePhase += p.waveFreq;
        }
      }
      p.flickerPhase += 0.08;
      p.rotation += p.rotationSpeed;

      const margin = Math.max(p.size, p.length, p.size * p.stretch);
      if (p.y < -margin || p.y > H + margin || p.x < -margin || p.x > W + margin) {
        resetParticle(p);
      }
    }

    function drawGlow(layer, elapsed) {
      const pulse = layer.opacityMin
        + (layer.opacityMax - layer.opacityMin) * (0.5 + 0.5 * Math.sin(elapsed * layer.pulseSpeed));
      const h = H * (layer.heightFrac ?? 0.5);
      const grad = layer.position === 'top'
        ? ctx.createLinearGradient(0, 0, 0, h)
        : ctx.createLinearGradient(0, H, 0, H - h);
      grad.addColorStop(0, layer.color);
      grad.addColorStop(1, 'transparent');
      ctx.globalAlpha = pulse;
      ctx.fillStyle = grad;
      ctx.fillRect(0, layer.position === 'top' ? 0 : H - h, W, h);
      ctx.globalAlpha = 1;
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const elapsed = performance.now() - startTime;
      for (const g of glowLayers) drawGlow(g, elapsed);
      for (const entry of particleLayers) {
        for (const p of entry.particles) {
          drawParticle(entry.layer, p);
          stepParticle(entry, p);
        }
      }
      raf = requestAnimationFrame(draw);
    }

    const ro = new ResizeObserver(() => {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    });
    ro.observe(canvas);

    if (reducedMotion) {
      // Single static low-opacity frame — no animation loop, per the
      // reduced-motion convention MonsterCard.svelte already follows.
      for (const g of glowLayers) drawGlow(g, 0);
      for (const entry of particleLayers) {
        for (const p of entry.particles) drawParticle(entry.layer, p);
      }
    } else {
      draw();
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
    };
  });
</script>

<canvas bind:this={canvas} class="race-atmosphere" aria-hidden="true"></canvas>

<style>
  .race-atmosphere {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
  }
</style>
