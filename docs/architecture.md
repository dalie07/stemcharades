# Architecture

STEMCHARADES is a modular monolith on one free Render web service. A single Node process serves the React app,
the REST routes and the WebSocket connection from the same address. That means one deploy, one cold start, no
cross-origin setup, and no second service competing for the 750 free instance hours.

```
Player browsers ──HTTPS / WebSocket──▶ Render free web service (one Node process)
 React app, PWA                         ├─ Express       static app, REST, security headers
 Party mode runs offline                ├─ Socket.IO     validates and rate-limits every event
                                        ├─ Game engine   pure rules: rooms, rounds, scores, in memory
                                        └─ Deck loader   reviewed cards from JSON in Git, checked at start
GitHub ──auto-deploy from main──▶ Render        GitHub Actions runs every check first
```

## Layers

| Layer | Technology | Responsibility |
|---|---|---|
| Client | React, Vite, Tailwind, Zustand, KaTeX | Presents the game and collects input. Never trusted with the answer or the score |
| Offline | vite-plugin-pwa | Installable app; caches the app shell and decks so Party mode works with no network |
| HTTP | Express | Serves the built app, room creation, deck routes, `/healthz`, security headers, optional account routes |
| Real time | Socket.IO | Rooms, live events, reconnection. Handlers validate, rate-limit, then call the engine; no rules live there |
| Engine | TypeScript, pure functions | `step(game, event, ctx) → { game, effects }`. No sockets, no clock, no randomness inside |
| Shared | Zod | Event names, payload schemas, scoring, card picker and the text normaliser, used by client and server |
| Content | JSON in Git | Version-controlled, reviewable cards. The server refuses to start on an invalid deck |
| Curriculum | `shared/src/taxonomy.ts` | Levels, subjects or courses, and topics. Cards must sit in it; players choose from it |

## The engine

`server/src/game/roundEngine.ts` is the whole rule set. Everything it needs from the outside world (the time, a
random source, the seating order, the card pool) is passed in, so the same input always gives the same output
and the rules are tested in milliseconds with no network.

- **Events:** `start`, `clue`, `guess`, `skip`, `tick`, `playerLeft`.
- **Phases:** `lobby → round → reveal → round … → finished`. A tick ends a round when time runs out, when every
  connected guesser has it, or when the explainer has been disconnected for 20 seconds, and starts the next
  round after the reveal pause.
- **Effects:** messages that only one player may receive (a rejected clue, a guess result).
- **Modules around it:** `roomManager` owns the in-memory room map, codes and session tokens; `gameRunner`
  connects the engine to live rooms and builds each player's view; `clueFilter`, `guessMatcher` and `blocklist`
  are pure helpers; `realtime/handlers.ts` and `rateLimit.ts` are plumbing.

## Where the code lives

```
server/src/
  index.ts          process entry: loads decks, optional database, timers, graceful shutdown
  app.ts            builds the HTTP server, routes and Socket.IO from injected parts (so tests can too)
  config.ts         limits and timings
  game/             roundEngine, gameRunner, roomManager, clueFilter, guessMatcher, blocklist
  realtime/         socket handlers and rate limits
  http/             decks, rooms, auth, me (account) routes and security headers
  content/          deck loader
  auth/ db/         optional accounts: OAuth providers, signed sessions, Drizzle schema and queries
  persist.ts        turns a finished room into the durable result
client/src/
  screens/          one file per screen
  components/       shared building blocks (ui, CardFrame, GameSettingsFields, WakeGate, ...)
  state/            the Zustand store, the socket connection and the account API
  party/            Party mode's engine, which runs in the browser
shared/src/         schemas, events, scoring, card picker, text normalising
```

## Card, round, result

These are three different things and are kept apart:

- A **card** is reviewed content in Git. Its id is permanent, so statistics survive edits to its wording.
- A **round** is live state in memory. It is allowed to vanish when the server restarts.
- A **result** is the small durable summary of a finished game, saved only when the optional database is configured.

Live rooms are never written to a database, so the game needs none.

Cards are written ahead of time and reviewed, not generated during play: see
[decision 0002](decisions/0002-reviewed-cards-not-live-ai.md).

## Secrecy and fairness

- **The server decides.** It picks the card, runs the timer, judges guesses and awards points.
- **Per-player views.** After each change the server sends every player their own view. The explainer's view holds the
  prompt and forbidden words; a guesser's holds only the card type and subject. Accepted answers and the
  explanation exist in no view until the reveal. There is no room-wide broadcast, so a bug cannot leak by
  sending the wrong event to the wrong audience. See `docs/decisions/0001-per-player-state-snapshots.md`.
- **Refresh and reconnect are free:** rejoining just receives the current view.

## Security controls

Server authority; secret isolation; Zod validation of every REST body and socket event with strict length limits;
per-connection limits on guesses and clues, per-IP limits on room creation, joins and room-code lookups;
32-character look-alike-free room codes (about 33 million); random 128-bit session tokens stored only as hashes;
all player text rendered as plain text, with KaTeX run with trust disabled and only on deck content; a basic
nickname and clue blocklist; host kick; resource caps on rooms, connections, players, clues, guesses and message
size; a handler guard so one bug cannot crash the process; security headers (CSP, frame, referrer and
content-type protections, HSTS over HTTPS). No emails or passwords are collected.

## Free-tier design

| Free-tier limit | Response |
|---|---|
| Spins down after 15 quiet minutes, about a minute to wake | Wake screen polls `/healthz`; Party mode works offline; socket traffic keeps a live game awake |
| Memory and disk wiped on restart | Rooms are disposable; decks live in Git; nothing is written to disk; clients are told and sent home |
| 512 MB RAM, a fraction of a CPU | Hard caps; no server-side rendering; the client is built once at deploy time |
| 750 instance hours a month | One service only |
| No background workers | Timers and room clean-up run inside the web process |
| Tests would waste build minutes | Tests run in GitHub Actions; Render only installs and builds |

If the game outgrows the free tier, the first paid step is one always-on instance. Nothing in the code changes,
because the design already assumes a single process.
