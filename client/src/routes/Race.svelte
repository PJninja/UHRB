<script>
  import { onMount, onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { get } from 'svelte/store';
  import { monsters } from '../lib/stores/monsters.js';
  import { serverRaceState, currentBet, updateCandies, clearBet } from '../lib/stores/game.js';
  import { sessionId } from '../lib/stores/session.js';
  import { addRaceToHistory } from '../lib/stores/history.js';
  import { simulateRace } from '../lib/utils/raceSimulation.js';
  import { validatePayout } from '../lib/services/api.js';
  import { randomInt } from '../lib/utils/random.js';
  import RichText from '../lib/components/RichText.svelte';

  // Runic sigils — one per lane slot, stable for the whole race
  const HORROR_GLYPHS = ['ᛟ', 'ᛦ', 'ᛏ', 'ᚦ', 'ᚷ', 'ᚱ'];
  let glyphMap = {};

  const COMMENTARY_NORMAL_MS    = 3500;
  const COMMENTARY_FAST_MS      = 1800; // kicks in at 75% progress
  const FINISH_FLASH_MS         = 800;
  const NECK_AND_NECK_THRESHOLD = 6;    // % gap between 1st and 2nd to trigger tension flash
  const RACE_INTENSITY_STEPS    = 10;   // glyph speed updates in this many discrete steps
  const BURST_GLOW_MIN_VELOCITY = 0.35; // velocityMult floor (matches simulation clamp)
  const BURST_GLOW_RANGE        = 2.65; // maxVelocity(3.0) - min(0.35)

  let raceData = null;
  let animationFrame = null;
  let startTime = null;
  let positions = {};
  let raceFinished = false;
  let raceMonsters = [];  // snapshot of monsters at race start — insulates animation from store updates
  let winner = null;
  let isValidating = false;
  let validationResult = null;
  let payoutError = null;

  // Intensity state — updated each rAF frame
  let raceProgress = 0;
  let glyphStep = 0;        // quantized 0–10 so animation-duration only changes 10 times
  let commentaryFast = false;
  let finishLineFlashing = false;

  // Commentary
  let commentaryLine = '';
  let commentaryInterval = null;

  // Event commentary state
  let lastEventCommentaryTime = 0;
  const EVENT_COOLDOWN_MS = 4000;
  let prevLeaderId = null;
  let prevNeckAndNeckActive = false;
  let milestone50Fired = false;
  let milestone75Fired = false;
  let runawayId = null;
  let stragglerIId = null;
  let outlierRunawayFired = false;
  let outlierStragglerFired = false;

  function buildCommentary(monsterList) {
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    const generic = [
      'The void whispers between the lanes...',
      'Reality bends beneath their passage.',
      'The crowd watches through gaps between their fingers.',
      'Ancient wards crack under the pressure of their racing.',
      'The very track screams in protest.',
      'Candies change hands beyond the veil of understanding.',
      'The stars themselves lean in to watch.',
      'Something in the deep places stirs.',
      'The geometry of the track refuses to hold steady.',
      'Bettors mutter incantations they only half-remember.',
      'The air between the lanes has stopped breathing.',
      'Something enormous shifts beneath the grandstands.',
      'The officials consult their wards. The wards disagree.',
      'Time pools thickly near the starting line.',
      'There are gaps in the crowd that have always been there.',
      'The finish line waits with patience that predates patience.',
    ];

    const specific = monsterList.flatMap(m => {
      const lines = [
        `${m.name} ${m.racingStyle.toLowerCase()} with terrible purpose.`,
        `The crowd recoils as ${m.name} draws near.`,
        `${m.name} has come from ${m.location}. It remembers nothing of peace.`,
        `Witnesses describe ${m.name} in contradictory terms, all of them wrong.`,
        `The judges record ${m.name}'s temperament as: ${m.temperament}. They close the file.`,
      ];

      if (m.traits.speed >= 7) {
        lines.push(`${m.name} accelerates in a way that the eye refuses to follow.`);
        lines.push(`The Racing Commission has no measurement for what ${m.name} is doing.`);
      }
      if (m.traits.endurance >= 7) {
        lines.push(`${m.name} does not tire. ${m.name} was never tired.`);
        lines.push(`The judges note that ${m.name} has not changed pace since the beginning of recorded time.`);
      }
      if (m.traits.madness >= 7) {
        lines.push(`${m.name} is somewhere between positions. Possibly all of them.`);
        lines.push(`The lane assigned to ${m.name} has lodged a formal complaint.`);
      }
      if (m.traits.luck >= 7) {
        lines.push(`Fortune coils itself around ${m.name} like something that eats fortunes.`);
        lines.push(`Probability has simply yielded to ${m.name}.`);
      }
      if (m.isReturningChampion) {
        lines.push(`${m.name} has won before. The track remembers. It is afraid.`);
        lines.push(`Returning champions do not age. They merely accumulate.`);
      }
      if (m.audienceFavor >= 4) {
        lines.push(`The crowd chants something at ${m.name}. It is not their language.`);
        lines.push(`${m.name} feeds on admiration. The crowd provides generously.`);
      }
      if (m.audienceFavor <= 2) {
        lines.push(`Nobody bet on ${m.name}. ${m.name} knows.`);
        lines.push(`The crowd watches ${m.name} from the corners of their eyes, hoping not to be noticed.`);
      }

      return lines;
    });

    const pool = [...generic, ...specific];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  }

  function injectEventLine(line) {
    const now = Date.now();
    if (now - lastEventCommentaryTime < EVENT_COOLDOWN_MS) return;
    lastEventCommentaryTime = now;
    commentaryLine = line;
  }

  function detectCommentaryEvents() {
    if (raceFinished) return;

    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    const sorted = raceMonsters
      .map(m => ({ monster: m, position: positions[m.id]?.position ?? 0, velocityMult: positions[m.id]?.velocityMult ?? 1.0 }))
      .sort((a, b) => b.position - a.position);

    if (sorted.length === 0) return;

    const currentLeader = sorted[0];
    const currentLast   = sorted[sorted.length - 1];
    const neckActive    = neckAndNeck.size > 0;

    // Player's bet takes the lead (checked first — higher priority than generic change)
    if (playerBetId && currentLeader.monster.id === playerBetId && prevLeaderId !== playerBetId) {
      injectEventLine(pick([
        `<gold>${currentLeader.monster.name}</gold> moves to the front. Your investment watches you back.`,
        `Your chosen horror, ${currentLeader.monster.name}, leads the field. The void notes your confidence.`,
        `${currentLeader.monster.name} surges ahead. The candies you placed on them lean forward in anticipation.`,
      ]));
    // Generic leadership change (only when the new leader is not the player's pick)
    } else if (prevLeaderId !== null && currentLeader.monster.id !== prevLeaderId) {
      injectEventLine(pick([
        `${currentLeader.monster.name} tears through into first. The previous leader does not look back.`,
        `${currentLeader.monster.name} surges forward. The crowd forgets who they were cheering for.`,
        `The order of things has shifted. ${currentLeader.monster.name} leads now.`,
        `${currentLeader.monster.name} has taken first position. The void adjusts its expectations.`,
      ]));
    }
    prevLeaderId = currentLeader.monster.id;

    // Neck-and-neck begins
    if (neckActive && !prevNeckAndNeckActive && sorted.length >= 2) {
      const [a, b] = sorted;
      injectEventLine(pick([
        `${a.monster.name} and ${b.monster.name} are inseparable. This is not a metaphor.`,
        `The gap between ${a.monster.name} and ${b.monster.name} has ceased to exist in any meaningful sense.`,
        `Two horrors. One position. The lane markers are filing a protest.`,
      ]));
    }
    prevNeckAndNeckActive = neckActive;

    // Player's bet falls to last
    if (playerBetId && currentLast.monster.id === playerBetId) {
      injectEventLine(pick([
        `${currentLast.monster.name} occupies last place. Your candies observe this in silence.`,
        `<blood>Last.</blood> ${currentLast.monster.name} trails the field. The crowd has already forgotten your bet.`,
        `The void has opinions about ${currentLast.monster.name}'s current position. So do your candies.`,
      ]));
    }

    // Any monster hits velocity burst
    for (const { monster, velocityMult } of sorted) {
      if (velocityMult > 2.0) {
        injectEventLine(pick([
          `${monster.name} enters a state that the track was not designed for.`,
          `${monster.name} is moving too quickly. Several spectators have misplaced their names.`,
          `<glow>Something is wrong with ${monster.name}'s velocity.</glow> The judges look elsewhere.`,
        ]));
        break;
      }
    }

    // Milestone: 50%
    if (!milestone50Fired && raceProgress >= 0.5) {
      milestone50Fired = true;
      injectEventLine(pick([
        'The halfway point has been crossed. What lies ahead is worse than what lies behind.',
        'Half the race is over. The horrors are only beginning to remember what they are.',
        'Fifty percent. The track sighs with something that might be relief, if it were capable.',
      ]));
    }

    // Milestone: 75%
    if (!milestone75Fired && raceProgress >= 0.75) {
      milestone75Fired = true;
      injectEventLine(pick([
        'The final stretch approaches. The crowd has stopped pretending to be calm.',
        'Three quarters gone. Whatever happens now, something will remember it forever.',
        'The finish line is close enough to smell. It smells like inevitability.',
      ]));
    }

    // Outlier: runaway surging far ahead of the pack
    if (runawayId && !outlierRunawayFired && raceProgress >= 0.18) {
      outlierRunawayFired = true;
      const m = raceMonsters.find(m => m.id === runawayId);
      if (m) injectEventLine(pick([
        `<glow>${m.name}</glow> is leaving the pack in the dust. The gap is becoming difficult to explain.`,
        `${m.name} surges ahead with a velocity that troubles the officials. Something has changed.`,
        `The distance between ${m.name} and the rest is no longer a gap. It is a statement.`,
        `<cosmic>${m.name} has decided the other competitors are not relevant.</cosmic>`,
      ]));
    }

    // Outlier: straggler falling far behind the pack
    if (stragglerIId && !outlierStragglerFired && raceProgress >= 0.22) {
      outlierStragglerFired = true;
      const m = raceMonsters.find(m => m.id === stragglerIId);
      if (m) injectEventLine(pick([
        `${m.name} has fallen desperately behind. The pack does not look back.`,
        `<blood>${m.name}</blood> trails alone. Whatever is happening to them, it is private.`,
        `The distance between ${m.name} and the field is growing. The officials have stopped measuring.`,
        `${m.name} moves at a pace that suggests reconsideration of the entire enterprise.`,
      ]));
    }
  }

  let commentary = [];
  let commentaryIdx = 0;

  onMount(() => {
    if ($monsters.length === 0) {
      push('/');
      return;
    }

    // Snapshot monsters now — insulates displayMonsters from WebSocket updates
    // that fire when the server moves on to the next race while we're still animating.
    raceMonsters = [...$monsters];

    raceMonsters.forEach((m, i) => {
      glyphMap[m.id] = HORROR_GLYPHS[i % HORROR_GLYPHS.length];
    });

    commentary = buildCommentary(raceMonsters);
    commentaryLine = commentary[0];
    commentaryInterval = setInterval(() => {
      commentaryIdx = (commentaryIdx + 1) % commentary.length;
      commentaryLine = commentary[commentaryIdx];
    }, COMMENTARY_NORMAL_MS);

    const srs = get(serverRaceState);
    const serverRankings = srs.rankings;
    // Use the server's authoritative duration so both sides finish at the same time.
    // Fall back to a local random only if the server hasn't sent one yet.
    const raceDuration = srs.raceDuration ?? randomInt(20000, 30000);
    // If we joined mid-race, offset startTime so progress begins at the right point.
    const elapsed = srs.raceStartedAt ? Math.max(0, Date.now() - srs.raceStartedAt) : 0;

    raceData = simulateRace(raceMonsters, raceDuration, serverRankings.length > 0 ? serverRankings : null);
    winner = raceData.winner;
    runawayId    = raceData.outliers.runawayId;
    stragglerIId = raceData.outliers.stragglerI;
    startTime = Date.now() - elapsed;
    animateRace();
  });

  onDestroy(() => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (commentaryInterval) clearInterval(commentaryInterval);
  });

  function animateRace() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(1, elapsed / raceData.duration);
    const frameIndex = Math.floor(progress * (raceData.frames.length - 1));
    positions = raceData.frames[frameIndex].positions;

    // Intensity escalation
    raceProgress = progress;
    const newStep = Math.floor(progress * RACE_INTENSITY_STEPS);
    if (newStep !== glyphStep) glyphStep = newStep;

    detectCommentaryEvents();

    // Speed up commentary in final 25%
    if (progress >= 0.75 && !commentaryFast) {
      commentaryFast = true;
      clearInterval(commentaryInterval);
      commentaryInterval = setInterval(() => {
        commentaryIdx = (commentaryIdx + 1) % commentary.length;
        commentaryLine = commentary[commentaryIdx];
      }, COMMENTARY_FAST_MS);
    }

    // Finish line flash when leader hits 98%
    if (!finishLineFlashing && !raceFinished) {
      const leadPos = Math.max(...Object.values(positions).map(p => p?.position ?? 0));
      if (leadPos >= 98) {
        finishLineFlashing = true;
        setTimeout(() => { finishLineFlashing = false; }, FINISH_FLASH_MS);
      }
    }

    if (progress < 1) {
      animationFrame = requestAnimationFrame(animateRace);
    } else {
      handleRaceFinish();
    }
  }

  async function handleRaceFinish() {
    raceFinished = true;
    isValidating = true;
    if (commentaryInterval) clearInterval(commentaryInterval);
    commentaryLine = 'The void renders its verdict...';

    const raceState = get(serverRaceState);
    const session = get(sessionId);
    const bet = get(currentBet);
    const isBetForThisRace = bet && bet.raceId === raceState.raceId;

    if (isBetForThisRace) {
      try {
        const validation = await validatePayout(raceState.raceId, session, bet);
        isValidating = false;
        validationResult = validation;

        if (validation.valid) {
          winner = validation.winner;
          updateCandies(validation.payout);

          const sortedMonsters = validation.rankings
            ? validation.rankings.map(r => r.monster)
            : raceMonsters;

          addRaceToHistory({
            monsters: sortedMonsters,
            winner: validation.winner,
            bet: validation.bet,
            won: validation.won,
            payout: validation.payout,
            timestamp: Date.now(),
          });
        } else {
          payoutError = 'Payout validation failed. Please try refreshing.';
        }
      } catch (error) {
        console.error('[Race] Failed to validate payout:', error);
        isValidating = false;
        payoutError = 'Could not validate payout. Check your connection.';
      }
    } else {
      if (bet) clearBet(); // stale bet from a previous race — clear it without deducting
      isValidating = false;
      validationResult = { won: false };
      const raceWinner = raceState.winner || winner;
      winner = raceWinner;
    }

    setTimeout(() => push('/results'), 3500);
  }

  $: displayMonsters = raceMonsters.map(monster => ({
    monster,
    id: monster.id,
    position: positions[monster.id]?.position ?? 0,
    velocityMult: positions[monster.id]?.velocityMult ?? 1.0,
  }));

  // Live rank map: monster id → current race position (1 = leading)
  $: ranks = (() => {
    const sorted = [...displayMonsters].sort((a, b) => b.position - a.position);
    const map = {};
    sorted.forEach(({ id }, i) => { map[id] = i + 1; });
    return map;
  })();

  // Neck-and-neck: top-2 monsters within 6% of each other
  $: neckAndNeck = (() => {
    if (raceFinished) return new Set();
    const sorted = [...displayMonsters].sort((a, b) => b.position - a.position);
    if (sorted.length < 2 || sorted[0].position - sorted[1].position > NECK_AND_NECK_THRESHOLD) return new Set();
    return new Set([sorted[0].id, sorted[1].id]);
  })();

  $: playerBetId = $currentBet?.monsterId;

  function ordinal(n) {
    const suffixes = ['', 'ST', 'ND', 'RD'];
    return `${n}${suffixes[n] || 'TH'}`;
  }
</script>

<div class="race-page">
  <div class="header">
    <div class="race-status-label">{raceFinished ? 'RACE COMPLETE' : 'RACE IN PROGRESS'}</div>
    <h1>The Race</h1>
    {#if $currentBet}
      {@const betMonster = raceMonsters.find(m => m.id === playerBetId)}
      <div class="bet-info">
        <span class="bet-badge">
          <span class="bet-label">YOUR BET</span>
          <span class="bet-amount text-candy">{$currentBet.amount} candies</span>
          <span class="bet-on">on {betMonster?.name ?? '—'}</span>
        </span>
      </div>
    {/if}
  </div>

  <div class="race-track"
    style="--race-progress: {raceProgress.toFixed(3)}; --glyph-speed: {Math.round(800 - glyphStep * (450 / RACE_INTENSITY_STEPS))}ms">
    {#each displayMonsters as { id, monster, position, velocityMult }}
      {@const rank = ranks[id] ?? 0}
      {@const isPlayer = id === playerBetId}
      <div class="race-lane"
        class:player-bet={isPlayer}
        class:is-leader={rank === 1}
        class:neck-and-neck={neckAndNeck.has(id)}>
        <div class="rank-badge" class:rank-first={rank === 1}>
          {ordinal(rank)}
        </div>

        <div class="horror-info">
          <div class="horror-name">
            {monster.name}
            {#if isPlayer}<span class="player-star">★</span>{/if}
          </div>
          <div class="horror-bets">
            {#if ($serverRaceState.betTotals[id] ?? 0) > 0}
              {$serverRaceState.betTotals[id]} candies wagered
            {:else}
              no offerings
            {/if}
          </div>
        </div>

        <div class="track">
          <div class="track-inner">
            <div class="progress-bar"
              style="width: {position}%; --burst-glow: {((velocityMult - BURST_GLOW_MIN_VELOCITY) / BURST_GLOW_RANGE).toFixed(3)}">
              <span class="horror-glyph">{glyphMap[id]}</span>
            </div>
          </div>
          <div class="finish-line" class:flashing={finishLineFlashing}>
            <span class="finish-label">FINISH</span>
          </div>
        </div>
      </div>
    {/each}
  </div>

  <div class="commentary-ticker" class:fading={raceFinished}>
    <span class="ticker-icon">⟪</span>
    <span class="ticker-text"><RichText text={commentaryLine} /></span>
    <span class="ticker-icon">⟫</span>
  </div>

  {#if raceFinished}
    <div class="finish-overlay">
      <div class="finish-banner" class:won={validationResult?.won} class:lost={validationResult && !validationResult.won && !isValidating}>
        {#if isValidating}
          <div class="validating">
            <div class="validating-spinner"></div>
            <p class="validating-text">The Void Considers...</p>
          </div>
        {:else if payoutError}
          <div class="banner-header error-header">Error</div>
          <p class="error-message">{payoutError}</p>
        {:else}
          <div class="banner-header">
            {winner?.name ?? '—'} Crosses First
          </div>

          {#if validationResult?.won}
            <div class="result-won">
              <div class="result-label">You Win</div>
              <div class="result-payout">{validationResult.payout} <span class="candy-word">Candies</span></div>
            </div>
          {:else if validationResult?.bet}
            <div class="result-lost">
              <div class="result-label">The Void Takes Its Due</div>
              <div class="result-sublabel">Better fortune in the next summoning.</div>
            </div>
          {:else}
            <div class="result-spectator">No stake placed.</div>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .race-page {
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* ── Header ─────────────────────────────────────────── */
  .header {
    text-align: center;
  }

  .race-status-label {
    font-family: 'Cinzel', serif;
    font-size: 0.75rem;
    letter-spacing: 6px;
    color: var(--text-secondary);
    text-transform: uppercase;
    margin-bottom: 0.5rem;
  }

  .bet-info {
    display: flex;
    justify-content: center;
    margin-top: 0.75rem;
  }

  .bet-badge {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem 0.75rem;
    background: rgba(201, 169, 97, 0.08);
    border: 2px solid var(--candy-color);
    padding: 0.4rem 1.25rem;
    font-size: 0.95rem;
    max-width: 100%;
  }

  .bet-label {
    font-family: 'Cinzel', serif;
    font-size: 0.65rem;
    letter-spacing: 3px;
    color: var(--text-secondary);
  }

  .bet-amount {
    font-weight: bold;
    font-size: 1.1rem;
  }

  .bet-on {
    color: var(--text-secondary);
  }

  /* ── Race Track ──────────────────────────────────────── */
  .race-track {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .race-lane {
    background: var(--bg-card);
    border: 3px solid var(--border-ancient);
    display: grid;
    grid-template-columns: 56px 190px 1fr;
    gap: 0;
    align-items: center;
    clip-path: polygon(
      0 0,
      calc(100% - 6px) 0,
      100% 6px,
      100% 100%,
      6px 100%,
      0 calc(100% - 6px)
    );
    transition: border-color 0.3s ease;
  }

  .race-lane.player-bet {
    border-color: var(--candy-color);
    box-shadow: 0 0 16px rgba(201, 169, 97, 0.2), inset 0 0 30px rgba(201, 169, 97, 0.04);
  }

  .race-lane.is-leader {
    border-color: #9b7acc;
    animation: leader-pulse 1.8s ease-in-out infinite;
  }

  .race-lane.is-leader .progress-bar {
    filter: brightness(1.25);
  }

  /* Player-bet + leader: gold wins */
  .race-lane.player-bet.is-leader {
    border-color: var(--candy-color);
    animation: leader-pulse-gold 1.8s ease-in-out infinite;
  }

  .race-lane.neck-and-neck {
    animation: tension-flash 0.45s ease-in-out infinite;
  }

  .race-lane.is-leader.neck-and-neck {
    animation: tension-flash-leader 0.45s ease-in-out infinite;
  }

  .race-lane.player-bet.neck-and-neck,
  .race-lane.player-bet.is-leader.neck-and-neck {
    animation: tension-flash-leader 0.45s ease-in-out infinite;
  }

  @keyframes leader-pulse {
    0%, 100% { box-shadow: 0 0 10px rgba(155, 122, 204, 0.25), inset 0 0 20px rgba(155, 122, 204, 0.04); }
    50%       { box-shadow: 0 0 22px rgba(155, 122, 204, 0.50), inset 0 0 40px rgba(155, 122, 204, 0.09); }
  }

  @keyframes leader-pulse-gold {
    0%, 100% { box-shadow: 0 0 16px rgba(201, 169, 97, 0.20), inset 0 0 30px rgba(201, 169, 97, 0.04); }
    50%       { box-shadow: 0 0 32px rgba(201, 169, 97, 0.45), inset 0 0 50px rgba(201, 169, 97, 0.09); }
  }

  @keyframes tension-flash {
    0%, 100% { border-color: var(--border-ancient); box-shadow: none; }
    50%       { border-color: #c05050; box-shadow: 0 0 18px rgba(192, 80, 80, 0.5); }
  }

  @keyframes tension-flash-leader {
    0%, 100% { border-color: #9b7acc; box-shadow: none; }
    50%       { border-color: #ff6060; box-shadow: 0 0 24px rgba(255, 96, 96, 0.6); }
  }

  /* Rank badge */
  .rank-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 68px;
    font-family: 'Cinzel', serif;
    font-size: 0.7rem;
    font-weight: 900;
    letter-spacing: 1px;
    color: var(--text-secondary);
    background: rgba(0, 0, 0, 0.3);
    border-right: 2px solid var(--border-ancient);
    transition: color 0.3s ease, background 0.3s ease;
  }

  .rank-badge.rank-first {
    color: var(--candy-color);
    background: rgba(201, 169, 97, 0.08);
    text-shadow: 0 0 10px rgba(201, 169, 97, 0.5);
  }

  /* Monster info column */
  .horror-info {
    padding: 0.75rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    border-right: 2px solid var(--border-ancient);
    min-height: 68px;
    justify-content: center;
  }

  .horror-name {
    font-family: 'Cinzel', serif;
    font-weight: bold;
    font-size: 0.95rem;
    color: var(--text-accent);
    display: flex;
    align-items: center;
    gap: 0.4rem;
    line-height: 1.2;
  }

  .player-star {
    color: var(--candy-color);
    font-size: 1rem;
    animation: pulse 1.2s ease-in-out infinite;
  }

  .horror-bets {
    font-size: 0.68rem;
    color: var(--candy-color);
    opacity: 0.75;
    letter-spacing: 0.5px;
  }

  /* Track */
  .track {
    position: relative;
    display: flex;
    align-items: stretch;
  }

  .track-inner {
    flex: 1;
    background: linear-gradient(90deg, #06090f 0%, #0e1320 100%);
    height: 68px;
    position: relative;
    overflow: hidden;
    box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.9);
  }

  /* Subtle scan lines on the track */
  .track-inner::before {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 6px,
      rgba(0, 0, 0, 0.15) 6px,
      rgba(0, 0, 0, 0.15) 7px
    );
    pointer-events: none;
    z-index: 1;
  }

  /* Intensity glow — opacity driven by --race-progress on .race-track */
  .track-inner::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent 0%, rgba(80, 30, 100, 0.25) 100%);
    opacity: var(--race-progress, 0);
    pointer-events: none;
    z-index: 0;
    transition: opacity 0.1s linear;
  }

  .progress-bar {
    height: 100%;
    background: linear-gradient(
      90deg,
      rgba(107, 90, 142, 0.4) 0%,
      var(--eldritch-purple) 60%,
      #9b7acc 100%
    );
    transition: width 0.05s linear;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 0.5rem;
    position: relative;
    z-index: 2;
    box-shadow:
      4px 0 12px rgba(107, 90, 142, 0.6),
      calc(4px + var(--burst-glow, 0) * 12px) 0
        calc(12px + var(--burst-glow, 0) * 24px)
        rgba(180, 140, 255, calc(0.3 + var(--burst-glow, 0) * 0.7));
  }

  /* Speed lines — diagonal stripes scrolling right */
  .progress-bar::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      -60deg,
      transparent 0px, transparent 6px,
      rgba(255, 255, 255, 0.06) 6px, rgba(255, 255, 255, 0.06) 8px
    );
    animation: speed-lines 0.6s linear infinite;
    pointer-events: none;
    z-index: 3;
  }

  .player-bet .progress-bar {
    background: linear-gradient(
      90deg,
      rgba(201, 169, 97, 0.3) 0%,
      rgba(201, 169, 97, 0.7) 60%,
      var(--candy-color) 100%
    );
    box-shadow:
      4px 0 14px rgba(201, 169, 97, 0.5),
      calc(4px + var(--burst-glow, 0) * 14px) 0
        calc(14px + var(--burst-glow, 0) * 28px)
        rgba(255, 220, 100, calc(0.3 + var(--burst-glow, 0) * 0.7));
  }

  .player-bet .progress-bar::after {
    background: repeating-linear-gradient(
      -60deg,
      transparent 0px, transparent 6px,
      rgba(255, 220, 100, 0.09) 6px, rgba(255, 220, 100, 0.09) 8px
    );
  }

  @keyframes speed-lines {
    from { background-position-x: 0px; }
    to   { background-position-x: 28px; }
  }

  .horror-glyph {
    font-size: 1.6rem;
    line-height: 1;
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 0 0 8px rgba(200, 180, 255, 0.8);
    animation: glyph-pulse var(--glyph-speed, 0.8s) ease-in-out infinite;
  }

  .player-bet .horror-glyph {
    color: var(--candy-color);
    text-shadow: 0 0 10px rgba(201, 169, 97, 0.9);
  }

  @keyframes glyph-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%       { opacity: 0.75; transform: scale(0.92); }
  }

  /* Finish line */
  .finish-line {
    width: 28px;
    min-height: 68px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-left: 3px solid var(--border-ancient);
    background: repeating-linear-gradient(
      0deg,
      var(--border-ancient) 0px,
      var(--border-ancient) 6px,
      transparent 6px,
      transparent 12px
    );
    flex-shrink: 0;
  }

  .finish-label {
    writing-mode: vertical-rl;
    font-family: 'Cinzel', serif;
    font-size: 0.5rem;
    letter-spacing: 2px;
    color: var(--text-secondary);
    text-transform: uppercase;
    transform: rotate(180deg);
    background: var(--bg-card);
    padding: 2px 3px;
  }

  .finish-line.flashing {
    animation: finish-flash 0.8s ease-out forwards;
  }

  @keyframes finish-flash {
    0%   { border-left-color: var(--border-ancient); background-color: transparent; box-shadow: none; }
    20%  { border-left-color: #fff8e0; background-color: rgba(255, 240, 150, 0.35); box-shadow: 0 0 20px rgba(255, 240, 150, 0.8); }
    60%  { border-left-color: var(--candy-color); background-color: rgba(201, 169, 97, 0.15); box-shadow: 0 0 10px rgba(201, 169, 97, 0.5); }
    100% { border-left-color: var(--border-ancient); background-color: transparent; box-shadow: none; }
  }

  /* ── Commentary Ticker ──────────────────────────────── */
  .commentary-ticker {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 0.75rem 1.5rem;
    background: var(--bg-card);
    border: 2px solid var(--border-ancient);
    min-height: 3rem;
    transition: opacity 0.6s ease;
  }

  .commentary-ticker.fading {
    opacity: 0.5;
  }

  .ticker-icon {
    color: var(--eldritch-purple);
    font-size: 1.1rem;
    opacity: 0.7;
    flex-shrink: 0;
  }

  .ticker-text {
    font-style: italic;
    color: var(--text-secondary);
    font-size: 0.95rem;
    letter-spacing: 0.5px;
    text-align: center;
    transition: opacity 0.4s ease;
  }

  /* ── Finish Overlay ─────────────────────────────────── */
  .finish-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: overlay-in 0.4s ease-out;
  }

  @keyframes overlay-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .finish-banner {
    background: var(--bg-card);
    border: 5px solid var(--border-ancient);
    padding: 3rem 4rem;
    text-align: center;
    min-width: 360px;
    max-width: 520px;
    clip-path: polygon(
      0 0,
      calc(100% - 14px) 0,
      100% 14px,
      100% 100%,
      14px 100%,
      0 calc(100% - 14px)
    );
    animation: banner-in 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }

  .finish-banner.won {
    border-color: var(--candy-color);
    box-shadow: 0 0 50px rgba(201, 169, 97, 0.4), inset 0 0 30px rgba(201, 169, 97, 0.06);
  }

  .finish-banner.lost {
    border-color: var(--eldritch-red);
    box-shadow: 0 0 30px rgba(139, 58, 58, 0.3);
  }

  @keyframes banner-in {
    from { transform: scale(0.6); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }

  .banner-header {
    font-family: 'Cinzel', serif;
    font-size: 1.8rem;
    font-weight: 900;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: var(--text-accent);
    margin-bottom: 1.5rem;
    line-height: 1.2;
  }

  .error-header {
    color: var(--eldritch-red);
  }

  /* Validating state */
  .validating {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    padding: 1rem 0;
  }

  .validating-spinner {
    width: 48px;
    height: 48px;
    border: 3px solid var(--border-ancient);
    border-top-color: var(--eldritch-purple);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .validating-text {
    font-family: 'Cinzel', serif;
    font-size: 1.1rem;
    letter-spacing: 4px;
    color: var(--text-secondary);
    text-transform: uppercase;
    margin: 0;
    animation: pulse 1.5s ease-in-out infinite;
  }

  /* Win result */
  .result-won {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .result-label {
    font-family: 'Cinzel', serif;
    font-size: 0.8rem;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .result-payout {
    font-family: 'Cinzel', serif;
    font-size: 3rem;
    font-weight: 900;
    color: var(--candy-color);
    text-shadow: 0 0 20px rgba(201, 169, 97, 0.6);
    letter-spacing: 4px;
    line-height: 1;
  }

  .candy-word {
    font-size: 1.2rem;
    opacity: 0.8;
    letter-spacing: 3px;
  }

  /* Loss result */
  .result-lost {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .result-lost .result-label {
    color: var(--eldritch-red);
    font-size: 1rem;
  }

  .result-sublabel {
    font-size: 0.85rem;
    color: var(--text-secondary);
    font-style: italic;
  }

  .result-spectator {
    color: var(--text-secondary);
    font-style: italic;
    font-size: 0.95rem;
  }

  .error-message {
    color: var(--eldritch-red);
    font-size: 1rem;
    margin: 0;
  }

  /* ── Responsive ─────────────────────────────────────── */
  @media (max-width: 768px) {
    .race-page {
      padding: 1rem;
    }

    .race-lane {
      grid-template-columns: 44px 1fr;
      grid-template-rows: auto auto;
    }

    .horror-info {
      border-right: none;
      border-bottom: 2px solid var(--border-ancient);
    }

    .track {
      grid-column: 1 / -1;
    }

    .finish-banner {
      padding: 2rem;
      min-width: unset;
      max-width: 90vw;
    }

    .banner-header {
      font-size: 1.3rem;
    }

    .result-payout {
      font-size: 2.2rem;
    }
  }
</style>
