# Unspeakable Horrors Race Betting (UHRB)

UHRB is a browser-based game where you bet candies on the outcome of a race between procedurally generated unspeakable monstrosities.

[![Netlify Status](https://api.netlify.com/api/v1/badges/8a96ff5a-c8f8-4970-a616-f7a5d666d8ac/deploy-status)](https://app.netlify.com/projects/uhrb/deploys)
[![Unit Tests](https://github.com/PJninja/UHRB/actions/workflows/ci.yml/badge.svg)](https://github.com/PJninja/UHRB/actions/workflows/ci.yml)

## Tech Stack

The project is two separate Node.js applications — a Svelte 5 SPA (client) and a Fastify API server — that communicate via WebSocket and REST.

### Client (`/client`)

| Dependency | Version | How it's used |
|---|---|---|
| **Svelte** | ^5.0.0 | UI framework — reactive components, stores, SPA routing |
| **Vite** | ^5.0.0 | Dev server and production bundler |
| **@sveltejs/vite-plugin-svelte** | ^4.0.0 | Vite plugin that compiles `.svelte` files |
| **svelte-spa-router** | ^4.0.1 | Hash-based client-side routing (`/#/`, `/#/bio/:id`, etc.) |

### Server (`/server`)

| Dependency | Version | How it's used |
|---|---|---|
| **Fastify** | ^4.26.0 | HTTP server framework — REST routes, request lifecycle, built-in Pino integration |
| **@fastify/websocket** | ^10.0.0 | WebSocket support; real-time `race:update` push events to all connected clients |
| **@fastify/cors** | ^9.0.0 | Cross-Origin Resource Sharing — allows the Vite dev server (`localhost:5173`) to call the API (`localhost:3000`) |
| **@fastify/rate-limit** | ^9.1.0 | Global and per-route request rate limiting to prevent abuse |
| **nanoid** | ^5.0.0 | Generates unique IDs for races and sessions |
| **seedrandom** | ^3.0.5 | Seeded pseudo-random number generator — makes Horror generation and race outcomes deterministic and reproducible from a seed string |
| **pino** | ^8.18.0 | Structured JSON logger; used via a shared instance in `src/utils/logger.js`; service files create child loggers with a `module` label |
| **pino-pretty** | ^10.3.0 | Development-only log formatter — converts Pino's JSON output to human-readable, colour-coded lines; disabled in production |

## Setup

### Prerequisites

- Node.js 18+
- npm

### Install dependencies

```bash
# Client
cd client && npm install

# Server
cd server && npm install
```

### Environment variables

**Client** — create `.env` in `/client`:
```
VITE_API_URL=http://localhost:3000/api
```

**Server** — create `.env` in `/server`:
```
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
SESSION_TTL_MS=86400000
LOG_LEVEL=info
```

## Running

Both servers must be running simultaneously.

```bash
# Terminal 1 — API server (from /server)
npm run dev

# Terminal 2 — Vite dev server (from /client)
npm run dev
```

- Client: http://localhost:5173
- API: http://localhost:3000

Use `dev.bat` to start both with one command on Windows.

## Testing

Both packages use [Vitest](https://vitest.dev/). Run `test.bat` from the project root to execute all tests across both suites and pause to read the results, or run `npm test` individually from `/client` (frontend) or `/server` (backend). No running server or network connection is required — all tests are in-process with dependencies mocked.

For balance and emergent behavior testing, use the bulk race simulator: `node server/scripts/simulate.js --races 1000 --quiet`. This runs races directly against the server's generation and simulation logic without starting a server, and is the right tool to reach for after changes to odds, stats, or race generation.

## Build

```bash
# Build the client for production (from /client)
npm run build

# Preview the production build locally
npm run preview

# Run the server in production mode (from /server)
npm start
```

The production build outputs to `client/dist`.
Serve it with any static file host and point `VITE_API_URL` at your deployed API server.

## Deployment
### Frontend — Netlify
### Backend — Railway

---
# Core Loop

- Players get a starting balance of 100 **candies**.
- They can bet on one Horror (out of 4–6) to win the upcoming race.
- Races occur every 30–300 seconds.
- Players can inspect each horror's bio before betting; the limited time window makes scouting meaningful.
- Some Horrors are less likely to win but pay out more; others are more consistent but pay less.

## HORRORS {#horrors}

Horrors are procedurally generated with a bio and traits.
They may persist across races occasionally, but are generally generated fresh each race.
The race *champion* always persists to the next race.

Each bio and appearance entry is assigned a letter (A, C, G, T).
Name and location do not - they are cosmetic only.
The total letter combination across all selected entries determines the Horror's stats via the <a href="#traits">Trait Table</a>

### Bio

- Unique name from two randomized name parts (Prefix + Suffix, Suffix can be empty)
- Location found (e.g. "The Depths of the Abyss", "The Forgotten City", "Cleveland")
- Brief description (1–2 sentences)
- Blurb (e.g. "They have been disqualified from races in other dimensions")
- Racing style (e.g. "Crawls" or "Slithers")
- Name Suffix (e.g. "the Unknowable", "the Swift", "King of the Underdark")

### Appearance

- Body type (e.g. "Humanoid", "Quadruped", "Amorphous")
- Distinctive features (e.g. "Glowing Eyes", "Tentacles", "Spikes")
- Height (0–300 meters)
- Weight (0–1000 tons)
- Temperament (e.g. "Aggressive", "Calm", "Chaos-Incarnate")
- Description (e.g "An entity that exists between dimensions")
- Blurb (e.g. "Their themesong is oddly catchy")
- Racing Style (e.g. "Glides" or "Shambles forward")

### Traits {#traits}

Stat numbers are never displayed to players — only inferred through prose, visual effects, and the **Field Classification** card on the Bio page.
The highest value a single trait can be is 7 for generated horrors (all 7 genome letters match); legendary horrors have hand-authored stats that can reach 10.

| Trait | Letter | Effect |
|---|---|---|
| **Speed** | A | Controls surge frequency in the race |
| **Endurance** | C | Controls consistency across the race |
| **Madness** | G | Controls unpredictability |
| **Strength** | T | Controls burst amplitude |
| **Luck** | — | Higher when the horror has more letter variety |
| **Value** | — | Hidden (1–100); contributes 30% to betting odds. Beloved tier (value ≤ 20) is hard-capped at 1.5× return. |

### Race Calculation
Deterministic and based on the seed string derived from the horror's traits.
Race winner is the one with the highest **performanceScore**.
```
performanceScore = statScore + chaosScore
statScore = (speed * 2.5) + (endurance * 1.5) + (strength * 1.0) + (luck * 1.5)
chaosScore = random number between (100 - madness * 5) and (100 + madness * 5)
```

### Odds Calculation
```
statsOdds  = 1 / (monster statScore / total statScores across field)   [clamped 1.5–10]
valueOdds  = 1.5 + (value / 100) * 8.5                                 [clamped 1.5–10]
finalOdds  = (0.7 × statsOdds) + (0.3 × valueOdds)
```
Beloved horrors (value ≤ 20) are hard-capped at **1.5×**. Legendary horrors are capped at **2.0×**; all other horrors racing against a legendary get a **2×** boost to their odds.

## Pages

- **Home** — race timer, horror roster, and betting panel.
- **Bio** — full horror dossier with prose stats, betting slip, Audience Favor, and a **Field Classification** card showing two alchemical symbols (power tier + dominant stat) and a Class Level letter.
- **Race** — live race animation with progress bars.
- **Results** — outcome, race summary, and payout.
- **History** — past bets log with aggregate stats (most earned, most lost, etc.).

## Visual Style

Dark eldritch aesthetic — Warhammer 40K-style gothic fonts layered over an ancient scroll palette. Deep blacks, decayed parchment tones, and glowing accent colours.

## Stretch Goals

- **Leaderboard** — top 10 players by candy count.
- **Horror visuals** — procedurally styled illustrations based on traits.
- **Friend system** — add friends and bet on the same races together.
- **More traits** — expand the trait system for greater horror variety.
