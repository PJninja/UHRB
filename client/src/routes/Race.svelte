<script>
  import { onMount, onDestroy } from 'svelte';
  import { push } from 'svelte-spa-router';
  import { get } from 'svelte/store';
  import { monsters } from '../lib/stores/monsters.js';
  import { serverRaceState, currentBet, candies, syncBalanceFromPayout, clearBet, MERCY_BALANCE } from '../lib/stores/game.js';
  import { sessionId } from '../lib/stores/session.js';
  import { addRaceToHistory } from '../lib/stores/history.js';
  import { simulateRace } from '../lib/utils/raceSimulation.js';
  import { validatePayout } from '../lib/services/api.js';
  import { randomInt } from '../lib/utils/random.js';
  import RichText from '../lib/components/RichText.svelte';

  // Runic sigils — one per lane slot, stable for the whole race
  const HORROR_GLYPHS = ['ᛟ', 'ᛦ', 'ᛏ', 'ᚦ', 'ᚷ', 'ᚱ'];
  let glyphMap = {};

  const COMMENTARY_PAUSE_MS      = 700;  // pause after typing before next pool line
  const COMMENTARY_FAST_PAUSE_MS = 300;  // same pause during final 25%
  const FINISH_FLASH_MS          = 800;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const NECK_AND_NECK_THRESHOLD = 6;    // % gap between 1st and 2nd to trigger tension flash
  const RACE_INTENSITY_STEPS    = 10;   // glyph speed updates in this many discrete steps
  const BURST_GLOW_MIN_VELOCITY = 0.35; // velocityMult floor (matches simulation clamp)
  const BURST_GLOW_RANGE        = 2.65; // maxVelocity(3.0) - min(0.35)

  let raceData = null;
  let animationFrame = null;
  let startTime = null;
  let positions = {};
  let raceFinished = false;
  let winnerCrossed = false;  // true when winner hits the finish line (freezes ranks, changes label)
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
  let commentaryLine   = '';
  let commentaryTimer  = null;
  let commentaryPaused = false;
  let pendingEventLine = null;

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
  let raceArchetype = null;
  let milestone25Fired   = false;
  let sustainedLeaderId  = null;
  let sustainedLeadStart = 0;
  let sustainedFired     = false;
  let packFired          = false;
  let playerSecondFired  = false;

  // Late-finisher commentary tracking
  let announcedFinishers = new Set();
  let winnerFinishedAt = 0;

  // Commentary logging + typewriter
  let commentaryLog = [];
  let typedText = '';
  let isTyping = false;
  let typewriterInterval = null;

  function buildCommentary(monsterList) {
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
      '<void>The void has leaned in.</void> It has chosen a favourite, but will not say.',
      'The officials have stopped writing things down. Their pens have stopped cooperating.',
      '<ancient>Something older than the track remembers this race.</ancient> It has seen the ending already.',
      'The crowd has forgotten to blink. Several have forgotten to breathe.',
      '<spectral>A sound moves through the grandstands that was not made by anything present.</spectral>',
      'The lane markers are vibrating at a frequency that suggests disagreement.',
      'Bettors near the rail are revising their estimates. The estimates are not improving.',
      '<eldritch>Whatever is happening at the front of the field is not being reported accurately.</eldritch>',
      'The track surface has opinions about this race. They are not positive.',
      "The crowd's silence is louder than its cheering. This is understood by everyone.",
      "Something in the official's booth has stopped functioning. The officials have not noticed.",
      '<madness>The race exists. This continues to be true. This cannot be taken for granted.</madness>',
    ];

    const specific = monsterList.flatMap(m => {
      const basePool = [
        `${m.name} ${m.racingStyle.toLowerCase()} with terrible purpose.`,
        `${m.name} has come from ${m.location}. It remembers nothing of peace.`,
        `Witnesses describe ${m.name} in contradictory terms, all of them wrong.`,
        `The judges record ${m.name}'s temperament as: <ancient>${m.temperament}</ancient>. They close the file.`,
        `${m.name} does not acknowledge the other competitors. This may be mercy.`,
        `The lane assigned to ${m.name} has not been the same since.`,
        `Observers near ${m.name}'s lane have begun keeping their distance without understanding why.`,
        `<void>${m.name}</void> arrived before the starting signal. No one saw them arrive.`,
      ];
      for (let i = basePool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [basePool[i], basePool[j]] = [basePool[j], basePool[i]];
      }
      const lines = basePool.slice(0, 4);

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

    // One crowd-reaction line per race, for one randomly chosen monster, varied phrasing
    const crowdMonster = monsterList[Math.floor(Math.random() * monsterList.length)];
    const crowdReactionLine = pick([
      `The crowd recoils as ${crowdMonster.name} draws near.`,
      `The audience presses back as ${crowdMonster.name} passes the stands.`,
      `Something in the crowd recognizes ${crowdMonster.name}. The rest try not to.`,
      `Spectators near ${crowdMonster.name}'s lane begin moving toward the exits.`,
      `${crowdMonster.name} passes close to the crowd. Several do not look up.`,
      `The crowd does not cheer for ${crowdMonster.name}. They understand it is not cheering that is called for.`,
    ]);

    const pool = [...generic, ...specific, crowdReactionLine];

    if (raceArchetype === 'wire-to-wire') {
      pool.push('One creature has decided this race is already over. It may be right.');
      pool.push('The others race for second. The front has already been claimed.');
    } else if (raceArchetype === 'late-surge') {
      pool.push('Something is coiling itself near the back. Waiting. Patient as a debt.');
      pool.push('The pack believes this is a simple race. They will be corrected.');
    } else if (raceArchetype === 'comeback') {
      pool.push('Last place is only a position. It does not have to be a destiny.');
      pool.push('Something behind them has remembered what it is capable of.');
    } else if (raceArchetype === 'chaos') {
      pool.push('No predictions are valid. The officials have surrendered their clipboards.');
      pool.push('The race has opinions of its own today.');
    }

    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  }

  function startTypewriter(line, onComplete) {
    if (typewriterInterval) { clearInterval(typewriterInterval); typewriterInterval = null; }
    commentaryLine = line;
    typedText = '';
    isTyping = true;

    let rawIndex = 0;
    let committed = '';
    const openTagStack = [];

    function closingSuffix() {
      return [...openTagStack].reverse().map(t => `</${t}>`).join('');
    }

    function consumeTags() {
      while (rawIndex < line.length && line[rawIndex] === '<') {
        const closeAngle = line.indexOf('>', rawIndex);
        if (closeAngle === -1) break;
        const tagContent = line.slice(rawIndex + 1, closeAngle);
        committed += line.slice(rawIndex, closeAngle + 1);
        rawIndex = closeAngle + 1;
        if (tagContent.startsWith('/')) {
          openTagStack.pop();
        } else {
          openTagStack.push(tagContent.split(' ')[0]);
        }
      }
    }

    typewriterInterval = setInterval(() => {
      consumeTags();
      if (rawIndex < line.length) {
        committed += line[rawIndex++];
        typedText = committed + closingSuffix();
      } else {
        typedText = committed;
        isTyping = false;
        clearInterval(typewriterInterval);
        typewriterInterval = null;
        onComplete?.();
      }
    }, commentaryFast ? 30 : 50);
  }

  function scheduleNextPoolLine() {
    if (commentaryPaused) return;
    const pause = commentaryFast ? COMMENTARY_FAST_PAUSE_MS : COMMENTARY_PAUSE_MS;
    commentaryTimer = setTimeout(() => {
      if (commentaryPaused) return;
      if (pendingEventLine) {
        const line = pendingEventLine;
        pendingEventLine = null;
        startTypewriter(line, scheduleNextPoolLine);
      } else {
        commentaryIdx = (commentaryIdx + 1) % commentary.length;
        const line = commentary[commentaryIdx];
        logCommentaryLine(line);
        startTypewriter(line, scheduleNextPoolLine);
      }
    }, pause);
  }

  function logCommentaryLine(line) {
    const now = Date.now();
    const raceTime = startTime ? now - startTime : 0;
    commentaryLog = [...commentaryLog, { text: line, timestamp: now, raceTime }];
  }

  function injectEventLine(line) {
    const now = Date.now();
    if (now - lastEventCommentaryTime < EVENT_COOLDOWN_MS) return;
    lastEventCommentaryTime = now;
    const raceTime = startTime ? now - startTime : 0;
    commentaryLog = [...commentaryLog, { text: line, timestamp: now, raceTime }];
    pendingEventLine = line;
    // If between lines (pause timer running, not typing), rush the pending event
    if (!isTyping && commentaryTimer) {
      clearTimeout(commentaryTimer);
      commentaryTimer = setTimeout(() => {
        if (commentaryPaused) return;
        const pending = pendingEventLine;
        pendingEventLine = null;
        startTypewriter(pending, scheduleNextPoolLine);
      }, 150);
    }
    // If currently typing, pending slot is consumed by scheduleNextPoolLine when done
  }

  function detectCommentaryEvents() {
    if (raceFinished) return;

    const sorted = raceMonsters
      .map(m => ({ monster: m, position: positions[m.id]?.position ?? 0, velocityMult: positions[m.id]?.velocityMult ?? 1.0, finished: positions[m.id]?.finished ?? false }))
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
        `<gold>${currentLeader.monster.name}</gold> leads. Your bet nods imperceptibly.`,
        `The thing you bet on is winning. This is a feeling. Hold it carefully.`,
        `<gold>${currentLeader.monster.name}</gold> is first. Your candies are watching from the front row.`,
      ]));
    // Generic leadership change (only when the new leader is not the player's pick)
    } else if (prevLeaderId !== null && currentLeader.monster.id !== prevLeaderId) {
      injectEventLine(pick([
        `${currentLeader.monster.name} tears through into first. The previous leader does not look back.`,
        `${currentLeader.monster.name} surges forward. The crowd forgets who they were cheering for.`,
        `The order of things has shifted. ${currentLeader.monster.name} leads now.`,
        `${currentLeader.monster.name} has taken first position. The void adjusts its expectations.`,
        `Something at the front has changed. ${currentLeader.monster.name} is proof of it.`,
        `${currentLeader.monster.name} does not acknowledge the lead. It simply has it.`,
        `The previous leader has been noted and set aside. ${currentLeader.monster.name} continues.`,
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
        `${a.monster.name} and ${b.monster.name} occupy the same moment in the race. Physics has tabled its concerns.`,
        `<glow>The gap is zero.</glow> ${a.monster.name} and ${b.monster.name} are a single event.`,
        `Neither ${a.monster.name} nor ${b.monster.name} will yield. The finish line is taking this personally.`,
        `The distance between ${a.monster.name} and ${b.monster.name} cannot be expressed in any unit the officials recognise.`,
      ]));
    }
    prevNeckAndNeckActive = neckActive;

    // Player's bet falls to last
    if (playerBetId && currentLast.monster.id === playerBetId) {
      injectEventLine(pick([
        `${currentLast.monster.name} occupies last place. Your candies observe this in silence.`,
        `<blood>Last.</blood> ${currentLast.monster.name} trails the field. The crowd has already forgotten your bet.`,
        `The void has opinions about ${currentLast.monster.name}'s current position. So do your candies.`,
        `<blood>${currentLast.monster.name}</blood> is last. The candies you wagered are reconsidering their trajectory.`,
        `Your pick trails everything. ${currentLast.monster.name} appears unconcerned. Your candies are concerned.`,
        `${currentLast.monster.name} occupies the rear of the field with what might be described as intention.`,
      ]));
    }

    // Any monster hits velocity burst
    for (const { monster, velocityMult } of sorted) {
      if (velocityMult > 2.0) {
        injectEventLine(pick([
          `${monster.name} enters a state that the track was not designed for.`,
          `${monster.name} is moving too quickly. Several spectators have misplaced their names.`,
          `<glow>Something is wrong with ${monster.name}'s velocity.</glow> The judges look elsewhere.`,
          `<glow>${monster.name}</glow> has exceeded what was expected. The track has noted this without approving it.`,
          `The officials have clocked ${monster.name} at a speed they will not repeat aloud.`,
          `Something has happened to ${monster.name}'s pace. The judges are writing it down under the wrong category.`,
        ]));
        break;
      }
    }

    // Milestone: 25%
    if (!milestone25Fired && raceProgress >= 0.25) {
      milestone25Fired = true;
      injectEventLine(pick([
        'The opening quarter ends. The creatures have shown something of themselves.',
        'Twenty-five percent complete. The track has begun to understand what it is dealing with.',
        'A quarter of the race is behind them. Some things are becoming clear.',
        'The first phase concludes. The void adjusts its attention.',
      ]));
    }

    // Milestone: 50%
    if (!milestone50Fired && raceProgress >= 0.5) {
      milestone50Fired = true;
      injectEventLine(pick([
        'The halfway point has been crossed. What lies ahead is worse than what lies behind.',
        'Half the race is over. The horrors are only beginning to remember what they are.',
        'Fifty percent. The track sighs with something that might be relief, if it were capable.',
        'The midpoint passes beneath them. From here, there is only finish or failure.',
        'Half remains. The horrors have decided what kind of race this will be.',
        'The second half begins. The first half does not miss them.',
      ]));
    }

    // Milestone: 75%
    if (!milestone75Fired && raceProgress >= 0.75) {
      milestone75Fired = true;
      injectEventLine(pick([
        'The final stretch approaches. The crowd has stopped pretending to be calm.',
        'Three quarters gone. Whatever happens now, something will remember it forever.',
        'The finish line is close enough to smell. It smells like inevitability.',
        '<ancient>The end is visible from here.</ancient> Several competitors have seen it and adjusted accordingly.',
        'The last quarter opens. Whatever has been held in reserve is being spent now.',
        'The finish line has entered the frame. The race has become a different race.',
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
        `<cosmic>${m.name} is operating in a different race from the rest of the field.</cosmic>`,
        `The gap behind ${m.name} is no longer a gap. It is a philosophical position.`,
        `${m.name} leads by a margin that the other competitors have stopped measuring.`,
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
        `${m.name} trails by a distance that the judges are embarrassed to measure.`,
        `<blood>${m.name}</blood> has been left behind. Whether this was intentional is unclear.`,
        `Something about ${m.name}'s pace suggests they have found a different race to be in.`,
      ]));
    }

    // Sustained leader: same monster holds first for ≥25% of race duration
    const now = Date.now();
    if (currentLeader.monster.id !== sustainedLeaderId) {
      sustainedLeaderId  = currentLeader.monster.id;
      sustainedLeadStart = now;
    }
    if (!sustainedFired && raceProgress >= 0.35) {
      const holdDuration = now - sustainedLeadStart;
      if (holdDuration >= raceData.duration * 0.25) {
        sustainedFired = true;
        injectEventLine(pick([
          `${currentLeader.monster.name} has held first place long enough that the others have started to accept it.`,
          `<glow>${currentLeader.monster.name}</glow> continues to lead. This is no longer surprising. That may be the most alarming part.`,
          `The front position has not changed hands. ${currentLeader.monster.name} is comfortable there. That is not comfortable to observe.`,
          `${currentLeader.monster.name} has led for long enough that the race has reshaped itself around them.`,
        ]));
      }
    }

    // Pack clustering: 3+ monsters within 8% band, fires once between 30–70%
    if (!packFired && raceProgress >= 0.3 && raceProgress <= 0.7) {
      const span = sorted[0].position - sorted[Math.min(2, sorted.length - 1)].position;
      if (span <= 8 && sorted.length >= 3) {
        packFired = true;
        injectEventLine(pick([
          'Three or more horrors occupy the same stretch of track. The officials cannot separate them.',
          'The field has compressed. This is not an improvement for anyone involved.',
          '<eldritch>They are too close together.</eldritch> Something about this proximity is producing effects.',
          'The pack is tight. This will resolve itself. The resolution will not be calm.',
        ]));
      }
    }

    // Player's bet in 2nd place near finish, fires once after 60%
    if (!playerSecondFired && raceProgress >= 0.6 && playerBetId) {
      const playerEntry = sorted.find(s => s.monster.id === playerBetId);
      const playerRank  = playerEntry ? sorted.indexOf(playerEntry) + 1 : null;
      if (playerRank === 2) {
        playerSecondFired = true;
        injectEventLine(pick([
          `<gold>${playerEntry.monster.name}</gold> is second. The gap to first is measurable. It is being measured by your candies.`,
          `Your pick is one position from the front. ${playerEntry.monster.name} knows this. So do you.`,
          `<gold>${playerEntry.monster.name}</gold> trails the leader. This is either the beginning of something or the end of it.`,
          `Second place. ${playerEntry.monster.name} has the position. The question is whether it intends to use it.`,
        ]));
      }
    }

    // Late finisher commentary: monsters crossing well after the winner
    if (winnerFinishedAt > 0 && now - winnerFinishedAt > 2000) {
      for (const { monster, finished } of sorted) {
        if (finished && !announcedFinishers.has(monster.id) && monster.id !== winner?.id) {
          announcedFinishers.add(monster.id);
          injectEventLine(pick([
            `And finally, ${monster.name} staggers across. Better late than erased.`,
            `${monster.name} completes the journey. The finish line had begun to forget them.`,
            `At last, ${monster.name} arrives. The void kept a place for them.`,
            `${monster.name} crosses the line. The judges had already closed their books.`,
            `${monster.name} has arrived. The crowd had assumed they wouldn't.`,
            `<ancient>${monster.name}</ancient> crosses the line. The race waited. Barely.`,
            `${monster.name} finishes. The judges reopen the books.`,
          ]));
          break; // Only announce one late finisher per event cycle
        }
      }
    }
  }

  let commentary = [];
  let commentaryIdx = 0;

  // Snapshots taken at mount — immune to the next-race WebSocket arriving before
  // the animation finishes (visualDuration can exceed the server's 5 s cooldown
  // in blowout finishes, so updateServerRaceState may clear these stores first).
  let mountedRaceId = null;
  let mountedBet    = null;

  onMount(() => {
    const srs = get(serverRaceState);

    // Never animate without the server's authoritative rankings (sent once the
    // race is running) — a locally rolled winner could contradict the real result.
    if ($monsters.length === 0 || !srs.rankings?.length) {
      push('/');
      return;
    }

    // Snapshot monsters now — insulates displayMonsters from WebSocket updates
    // that fire when the server moves on to the next race while we're still animating.
    raceMonsters = [...$monsters];

    raceMonsters.forEach((m, i) => {
      glyphMap[m.id] = HORROR_GLYPHS[i % HORROR_GLYPHS.length];
    });
    mountedRaceId = srs.raceId;
    mountedBet    = get(currentBet);
    const serverRankings = srs.rankings;
    // Use the server's authoritative duration so both sides finish at the same time.
    // Fall back to a local random only if the server hasn't sent one yet.
    const raceDuration = srs.raceDuration ?? randomInt(20000, 30000);
    // If we joined mid-race, offset startTime so progress begins at the right point.
    const elapsed = srs.raceStartedAt ? Math.max(0, Date.now() - srs.raceStartedAt) : 0;

    raceData = simulateRace(raceMonsters, raceDuration, serverRankings, srs.events);
    winner = raceData.winner;
    runawayId    = raceData.outliers.runawayId;
    stragglerIId = raceData.outliers.stragglerI;
    raceArchetype = raceData.archetype;

    // Build commentary after archetype is known so archetype lines are included
    commentary = buildCommentary(raceMonsters);
    const firstLine = commentary[0];
    logCommentaryLine(firstLine);
    startTypewriter(firstLine, scheduleNextPoolLine);

    startTime = Date.now() - elapsed;
    animateRace();
  });

  onDestroy(() => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (commentaryTimer) clearTimeout(commentaryTimer);
    if (typewriterInterval) clearInterval(typewriterInterval);
  });

  function animateRace() {
    const elapsed = Date.now() - startTime;
    const visualDuration = raceData.visualDuration ?? raceData.duration;
    const progress = Math.min(1, elapsed / visualDuration);
    const frameIndex = Math.min(
      Math.floor(progress * (raceData.frames.length - 1)),
      raceData.frames.length - 1
    );
    positions = raceData.frames[frameIndex].positions;

    // Track when winner crosses the line (reaches 100%)
    if (winnerFinishedAt === 0 && positions[winner?.id]?.finished) {
      winnerFinishedAt = Date.now();
      winnerCrossed = true;
    }

    // Intensity escalation
    raceProgress = progress;
    const newStep = Math.floor(progress * RACE_INTENSITY_STEPS);
    if (newStep !== glyphStep) glyphStep = newStep;

    detectCommentaryEvents();

    // Speed up commentary in final 25% — future startTypewriter calls use 30ms/char + shorter pause
    const officialProgress = elapsed / raceData.duration;
    if (officialProgress >= 0.75 && !commentaryFast) {
      commentaryFast = true;
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
    commentaryPaused = true;
    isValidating = true;
    if (commentaryTimer) { clearTimeout(commentaryTimer); commentaryTimer = null; }

    // Typed verdict line → typed winner line → redirect 2s after winner finishes
    const verdictLine = 'The void renders its verdict...';
    logCommentaryLine(verdictLine);
    startTypewriter(verdictLine, () => {
      const name = winner?.name ?? 'A horror';
      const winnerLine = pick([
        `<gold>${name}</gold> crosses the finish line. The void records the outcome.`,
        `${name} has won. The rest were merely witnesses.`,
        `<glow>${name}</glow> claims the race. Nothing disputes the result.`,
        `The verdict is ${name}. The crowd processes this at their own pace.`,
        `${name} finishes first. The race closes behind them like a wound.`,
      ]);
      logCommentaryLine(winnerLine);
      startTypewriter(winnerLine, () => {
        setTimeout(() => push('/results'), 2000);
      });
    });

    const session = get(sessionId);
    const bet = mountedBet;
    const isBetForThisRace = bet && bet.raceId === mountedRaceId;

    if (isBetForThisRace) {
      try {
        const validation = await validatePayout(mountedRaceId, session, bet);
        isValidating = false;
        validationResult = validation;

        if (validation.valid) {
          // Keep the local server-derived winner if the response omits one
          // (e.g. the race is no longer retrievable server-side)
          if (validation.winner) winner = validation.winner;

          // `candies` already reflects the post-bet-deduction balance (placeBet
          // synced it at bet time), matching the server's pre-resolution
          // session.candyBalance. Comparing what the payout would have produced
          // unclamped against what the server actually returned catches every
          // floor-triggered case, including an all-in bet that leaves 0 pre-payout.
          const balanceBeforePayout = get(candies);
          const unclampedBalance = balanceBeforePayout + (validation.payout || 0);
          const mercyRescued = unclampedBalance < MERCY_BALANCE
            && validation.candyBalance === MERCY_BALANCE;

          syncBalanceFromPayout(validation.candyBalance, validation.balanceToken);

          const sortedMonsters = validation.rankings?.length
            ? validation.rankings.map(r => r.monster)
            : raceData.rankings.map(r => r.monster);

          addRaceToHistory({
            monsters: sortedMonsters,
            winner,
            bet: validation.bet,
            won: validation.won,
            payout: validation.payout,
            mercyRescued,
            timestamp: Date.now(),
            commentary: commentaryLog,
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

      // raceData was seeded from the server's rankings at mount, so the local
      // winner and order ARE the authoritative result — and unlike the live
      // store, they can't have been overwritten by the next race's payload.
      addRaceToHistory({
        monsters: raceData.rankings.map(r => r.monster),
        winner,
        bet: null,
        won: false,
        payout: 0,
        timestamp: Date.now(),
        commentary: commentaryLog,
      });
    }
  }

  $: displayMonsters = raceMonsters.map(monster => ({
    monster,
    id: monster.id,
    position: positions[monster.id]?.position ?? 0,
    velocityMult: positions[monster.id]?.velocityMult ?? 1.0,
    finished: positions[monster.id]?.finished ?? false,
  }));

  // Live rank map: monster id → current race position (1 = leading)
  // Freeze ranks once the winner crosses so late finishers don't cause rank shifts.
  let frozenRanks = {};
  $: ranks = (() => {
    if (winnerCrossed && Object.keys(frozenRanks).length > 0) {
      return frozenRanks;
    }
    const sorted = [...displayMonsters].sort((a, b) => b.position - a.position);
    const map = {};
    sorted.forEach(({ id }, i) => { map[id] = i + 1; });
    if (winnerCrossed) {
      frozenRanks = map;
    }
    return map;
  })();

  // Neck-and-neck: top-2 monsters within 6% of each other
  $: neckAndNeck = (() => {
    if (winnerCrossed) return new Set();
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
    <div class="race-status-label">{winnerCrossed ? 'RACE COMPLETE' : 'RACE IN PROGRESS'}</div>
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
    {#each displayMonsters as { id, monster, position, velocityMult, finished }}
      {@const rank = ranks[id] ?? 0}
      {@const isPlayer = id === playerBetId}
      <div class="race-lane"
        class:player-bet={isPlayer}
        class:is-leader={rank === 1 && !winnerCrossed}
        class:neck-and-neck={neckAndNeck.has(id)}
        class:finished={finished}>
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
              <span class="horror-glyph" class:finished-glyph={finished}>
                {finished ? '⚑' : glyphMap[id]}
              </span>
            </div>
          </div>
          <div class="finish-line" class:flashing={finishLineFlashing}>
            <span class="finish-label">FINISH</span>
          </div>
        </div>
      </div>
    {/each}
  </div>

  <div class="commentary-ticker" class:fading={raceFinished} class:typing={isTyping}>
    <span class="ticker-text"><RichText text={typedText} /></span>
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

  /* Finished state — monster has crossed the line */
  .race-lane.finished {
    opacity: 0.55;
    transition: opacity 0.6s ease;
  }

  .race-lane.finished .progress-bar {
    filter: grayscale(0.5) brightness(0.8);
    transition: filter 0.6s ease;
  }

  .race-lane.finished .horror-glyph.finished-glyph {
    animation: none;
    opacity: 0.6;
    font-size: 1.4rem;
  }

  .race-lane.player-bet.finished {
    opacity: 0.65;
    border-color: var(--border-ancient);
    box-shadow: none;
  }

  .race-lane.finished .rank-badge.rank-first {
    color: var(--candy-color);
    opacity: 0.7;
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
    justify-content: flex-start;
    gap: 1rem;
    padding: 1.25rem 2rem;
    background: rgba(14, 19, 32, 0.95);
    border: 3px solid var(--border-ancient);
    min-height: 4.5rem;
    transition: opacity 0.6s ease;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    position: relative;
  }

  .commentary-ticker.fading {
    opacity: 0.5;
  }

  .ticker-text {
    font-style: normal;
    color: var(--text-accent);
    font-size: 1.2rem;
    letter-spacing: 0.5px;
    text-align: left;
    transition: opacity 0.4s ease;
    line-height: 1.4;
    min-height: 2rem;
    width: 100%;
    text-shadow: 0 0 12px rgba(107, 90, 142, 0.3);
    font-family: 'Cinzel', serif;
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
