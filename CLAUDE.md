# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Unspeakable Horrors Race Betting (UHRB)** — a browser-based game where players bet "candies" on procedurally generated monsters racing against each other. Races occur every 30–300 seconds with 4–6 monsters per race.

## Commands

### Frontend (root directory)
```bash
npm run dev      # Start Vite dev server at http://localhost:5173
npm run build    # Production build
npm run preview  # Preview production build
```

### Backend (`/server`)
```bash
npm run dev      # Start Fastify server with file watching at http://localhost:3000
npm start        # Run server in production mode
```

## Architecture

The app is two separate Node.js projects — a Svelte 5 SPA (root) and a Fastify REST API (`/server`). They communicate via WebSocket (real-time push) and REST calls.

### Frontend (`/src`)

- **`main.js` → `App.svelte`** — entry point; handles session initialization (create/validate via API) before mounting the router; reactive `$raceState === 'racing'` forces navigation to `/race` regardless of current page
- **`/routes`** — SPA pages via `svelte-spa-router`:
  - `Home.svelte` — betting lobby; canvas particle runes in background; history shortcut button
  - `Bio.svelte` — standalone monster dossier (two-column layout); does **not** use MonsterCard
  - `Race.svelte` — live race animation; drives visual simulation from server rankings
  - `Results.svelte` — post-race outcome and payout display
  - `History.svelte` — past bets log with aggregate stats
- **`/lib/components`**:
  - `MonsterCard.svelte` — compact card used on Home; full-view branch (`compact={false}`) is unused (Bio is standalone)
  - `BettingSlip.svelte` — bet amount input and confirmation
  - `BettingContext.svelte` — sticky aside panel on Bio page; 4 states: odds / bet-pending / victory / defeat
  - `RaceTimer.svelte` — countdown to next race
  - `RichText.svelte` — renders inline rich text tags as styled spans
- **`/lib/stores`**:
  - `game.js` — candies, currentBet (client); serverRaceState (synced from WebSocket); includes `winner` and `rankings` once racing begins
  - `session.js` — persisted session ID
  - `monsters.js` — current race roster (set from WebSocket payload)
  - `history.js` — persisted bet log (last 50 races); exports `monsterHistory` (per-monster appearances/wins map) and `historyStats` (aggregate stats)
  - `connection.js` — WebSocket connection health
  - `persistence.js` — localStorage-backed store factory used by `game.js`, `session.js`, `history.js`
- **`/lib/services/raceSocket.js`** — WebSocket client; receives `race:update` events; reconnects with exponential backoff + ±2s jitter to prevent thundering herd
- **`/lib/services/api.js`** — REST client wrapping all server calls
- **`/lib/utils/raceSimulation.js`** — **client-side visual simulation only** (not authoritative); accepts optional `serverRankings` to guarantee visual outcome matches server result; generates monotonic position curves via velocity integration (monsters never go backwards); stat traits shape the noise: speed→surge frequency, endurance→consistency, strength→burst amplitude
- **`/lib/utils/richText.js`** — parser for inline rich text; supports tags: `glow`, `gold`, `blood`, `void`, `madness`, `ancient`, `eldritch`

### Backend (`/server/src`)

- **`index.js`** — Fastify server entry; registers CORS, `@fastify/rate-limit` (global 300 req/min), routes, graceful shutdown; logs active session count every 30s
- **`config.js`** — centralised config (PORT, HOST, CORS_ORIGIN, SESSION_TTL_MS, LOG_LEVEL)
- **`/routes/rest.js`** — REST handlers: `GET /api/session`, `POST /api/session` (20/min), `GET /api/session/:id/validate`, `GET /api/race/current`, `POST /api/race/:raceId/bet` (60/min), `POST /api/race/:raceId/payout/validate` (60/min); write endpoints have per-route rate limits tighter than the global
- **`/routes/ws.js`** — WebSocket handler at `/ws`; registers/removes clients via broadcaster; sends current race state on connect
- **`/services/raceScheduler.js`** — owns the race lifecycle state machine (`waiting` → `racing` → `finished`); schedules next race; exports `sanitizeMonster` (strips `value`, adds `isReturningChampion`) and `racePayload` (includes `winner` + `rankings` once racing, so client visuals match server outcome); bet-total broadcasts are debounced 300ms; `BETTING_CLOSE_BEFORE_MS = 5000`
- **`/services/raceSimulator.js`** — **server-authoritative** outcome; seeded RNG for deterministic results; race duration 20–30s
- **`/services/monsterGenerator.js`** — seeded monster generation; text entries are `{ text, letter }` pairs; stats derived by counting letters across all selected texts
- **`/services/broadcaster.js`** — WebSocket broadcaster; Set of sockets; stale sockets (throw on send) auto-removed; `WS_OPEN = 1` constant
- **`/services/payoutValidator.js`** — anti-cheat: recomputes payout as `bet × odds`; value is already baked into odds (no separate multiplier)
- **`/state/sessionManager.js`** — in-memory session store with 24-hour TTL; expired sessions purged on hourly background interval (not on-read)
- **`/data/bioData.js`** — descriptions, blurbs, racingStyles; entries are `{ text, letter }`; text uses RichText tags matching the stat contribution
- **`/data/appearanceData.js`** — bodyTypes, distinctiveFeatures, temperaments; same `{ text, letter }` format with RichText tags
- **`/data/nameData.js`** — namePrefixes, nameSuffixes, locations (cosmetic only, no mechanical effect)
- **`/utils/random.js`** — seeded RNG (for deterministic server simulation); `setSeed`, `resetSeed`, `randomInt`, `random`
- **`/utils/logger.js`** — shared Pino instance; imported by `index.js` (passed to Fastify) and all service/state files; service files use `logger.child({ module: '...' })` so every log line carries a module label and respects `LOG_LEVEL`

### Key Design Constraints

- **Monster generation is server-only.** The server sends sanitized monster objects over the API/WebSocket; the client only renders them.
- **`value` is a hidden stat** (stripped by `sanitizeMonster` before any API response) applied as a payout multiplier on wins. Players never see it.
- **No stat numbers are ever shown.** The Bio page uses prose, RichText effects, and "Patterns in the Void" void-tagged scholar hints to let players infer stat strength without displaying digits.
- **Text entries encode stats:** every catalog entry is `{ text, letter }` where letter ∈ {A=Speed, C=Endurance, G=Madness, T=Strength}. RichText tags in entry text visually reinforce the stat category: A→`<glow>`, C→`<ancient>`, G→`<madness>`, T→`<blood>`.
- **Two-simulation architecture:** the server computes the authoritative winner (seeded RNG); the client runs a visual-only simulation using `serverRankings` from the WebSocket payload to guarantee the visual outcome matches the server result.
- **All bet validation happens server-side.** The payout validator endpoint exists specifically to prevent client-side cheating.
- **No database** — all state is in-memory. Sessions expire after 24 hours (configurable via `SESSION_TTL_MS`). History is persisted in localStorage (last 50 races).

## Environment Variables

**Frontend** (`.env` in root):
```
VITE_API_URL=http://localhost:3000/api
```

**Backend** (`server/.env`):
```
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
SESSION_TTL_MS=86400000
LOG_LEVEL=info
```

## Server-Side Logging

Logging is server-only. The client uses no logging library — browser `console.*` calls are acceptable there for debugging but are not part of the structured log stream.

### How to log

Import the shared logger and create a child with a `module` label:

```js
import { logger } from '../utils/logger.js';
const log = logger.child({ module: 'myModule' });
```

Write structured log calls — pass a context object as the first argument, the message string second:

```js
log.info({ raceId, winner: monster.name }, 'race finished');
log.warn({ sessionId, claimed, actual }, 'bet monsterId mismatch');
log.error({ sessionId }, 'session not found when storing bet');
log.debug({ monsterId, total }, 'bet total updated');
```

Never use string interpolation to embed values in the message (`'race ' + raceId + ' finished'`). Put values in the context object so they are queryable as structured fields.

Never use `console.log/warn/error` in server files — it bypasses Pino and breaks log-level control.

### When to write logs

| Level | Write when |
|---|---|
| `error` | Something that should not happen and needs investigation: session missing on bet write, unhandled exception |
| `warn` | Suspicious but recoverable: anti-cheat field mismatches in payout validation, unexpected state that was corrected |
| `info` | Key lifecycle events worth tracking in production: server start/stop, race scheduled/started/finished, betting closed, payout validated |
| `debug` | High-frequency or low-signal events useful only when actively debugging: bet totals updated, session created/expired, bets stored, WebSocket associations |

### Log level control

Set `LOG_LEVEL` in `server/.env`. Default is `info`, which suppresses all `debug` output.

```
LOG_LEVEL=info    # production default — lifecycle events only
LOG_LEVEL=debug   # local debugging — full event stream
LOG_LEVEL=warn    # minimal — warnings and errors only
```

## VISUAL STYLE
The UI, Theme, and Palette are dark Eldritch inspired.
It uses a mix of Warhammer 40K style fonts and ancient scroll aesthetic.
