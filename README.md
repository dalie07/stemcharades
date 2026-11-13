# STEMCHARADES

A multiplayer party game for STEM revision. One player explains a term, formula or question without using the
forbidden words, everyone else races to guess it, and the round ends with the correct answer explained.
*If you can explain it, you understand it.*

**Live game:** _add your Render URL here after the first deploy_

- **Party mode** – one phone passed around the room. Works offline after the first load and installs like an app.
- **Online rooms** – 2 to 12 players, each on their own device, joined with a 5-character room code. No account.
- **Optional accounts** – sign in with GitHub or Google to keep your game history, a personal revision list of missed cards, and private decks for your class. Guests play exactly as before.
- **300 cards** across Maths, Physics, Chemistry, Biology and Computing at three levels, with formulas shown as proper maths.
  (Every card must be marked `reviewed` by a person before production serves it. See [content guide](docs/content-guide.md).)

## Run it

Requires Node.js 22 or newer.

```bash
npm install
ALLOW_DRAFT_CARDS=1 npm run dev     # server on :3000, client on http://localhost:5173
```

Production-style, served by one Node process:

```bash
npm run build && ALLOW_DRAFT_CARDS=1 npm start     # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run typecheck` · `npm run lint` | TypeScript (strict) and ESLint |
| `npm test` | Unit and integration tests (Vitest), all workspaces |
| `npm run test:coverage` | Server game-engine coverage, fails under 90% |
| `npm run test:e2e` | Multi-browser game tests (Playwright). Locally uses Google Chrome |
| `npm run validate:cards` | Schema, duplicate ids, shared answers, leaking forbidden words |

## Configuration

| Variable | Where | Meaning |
|---|---|---|
| `PORT` | server | Port to listen on (Render sets it) |
| `NODE_ENV=production` | server | Serve only `reviewed` cards |
| `ALLOW_DRAFT_CARDS=1` | server | Also serve `draft` cards (local work and tests only) |
| `TRUST_PROXY=1` | server | Trust Render's `X-Forwarded-For` for per-IP rate limits. Set in `render.yaml` |
| `MAX_ROOMS`, `MAX_CONNECTIONS` | server | Resource caps (defaults 200 and 600) |
| `DATABASE_URL`, `SESSION_SECRET`, `GITHUB_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `PUBLIC_URL` | server | Optional accounts, history and private decks. See [setup-accounts](docs/setup-accounts.md). Without them the game is guest-only |
| `VITE_GITHUB_REPO` | client build | `owner/repo`. Turns the **Flag this card** button into a prefilled GitHub issue; without it the button copies the card details |

## Deploy to Render (free)

1. Push this repository to GitHub.
2. In Render choose **New → Blueprint** and select the repository. `render.yaml` defines one free web service.
3. Optionally add `VITE_GITHUB_REPO` as an environment variable before the first build.
4. Open the service URL on a phone, then paste it into the **Live game** line above.

The free instance sleeps after 15 quiet minutes and takes about a minute to wake. The app shows a wake screen
meanwhile, and Party mode works without the server. Live rooms live in memory, so a restart ends any game in
progress; clients are told and sent home. Deploy outside play hours.

## How it works

One Node process serves the React app, a few REST routes and the Socket.IO connection. The game rules live in a
pure engine (state and event in, new state out). The server is authoritative: it picks cards, runs the timer,
judges guesses and awards points, and the answer is never sent to a guesser's browser. See
[architecture](docs/architecture.md), [game rules](docs/game-rules.md) and the [test plan](docs/test-plan.md).

```
client/    React + Vite + Tailwind app (screens, Party engine, KaTeX cards, PWA)
server/    Express + Socket.IO (rooms, round engine, clue filter, guess matcher, rate limits)
shared/    Zod schemas, event names, scoring, card picker, text normalising (used by both sides)
content/   Card decks as JSON, version-controlled and schema-checked
scripts/   validate-cards
e2e/       Playwright tests
docs/      architecture, game rules, content guide, test plan, decision records
```

## Status

The roadmap's engineering work is built. The cards still need human review, and the game still needs its first deploy
and playtest. Measured quality metrics and known limitations are in the [test plan](docs/test-plan.md).
