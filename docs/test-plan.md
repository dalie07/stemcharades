# Test plan

Everything below runs in CI on every push (`.github/workflows/ci.yml`): typecheck, lint, card validation, unit
and integration tests, engine coverage, the production build, `npm audit`, and the Playwright browser tests.
Locally, `npm run check` runs all of it except the browser tests, and `npm run test:e2e` runs those.

| Layer | Where | How many |
|---|---|---|
| Shared rules (scoring, card picker, curriculum map, selections) | `shared/src/*.test.ts` | 14 |
| Server: engine, filters, rooms, sockets, accounts, database, content checks | `server/tests/` | 203 |
| Client: Party engine, flag links | `client/src/**/*.test.ts` | 11 |
| Browser, several real browsers per test | `e2e/` (Playwright) | 10 |

Database tests run against a real Postgres in-process (PGlite) with the real migrations, so they need no account.

## The scenario matrix

Each scenario the design calls for has at least one automated test.

| # | Scenario | Expected | Automated by |
|---|---|---|---|
| 1 | Guess differs only in case, spacing or punctuation | Correct | `guessMatcher.test.ts` "matches ignoring case, spacing and punctuation" |
| 2 | Guess is a listed alias (DNA) | Correct | `guessMatcher.test.ts` "matches listed aliases" |
| 3 | Guess is one or two letters off | Close, no points, answer not revealed | `guessMatcher.test.ts` "marks one or two letters off as close"; `scoring.socket.test.ts` (feedback never contains the answer) |
| 4 | Clue contains the answer or a forbidden word, any case or plural | Rejected, never broadcast, explainer told why | `clueFilter.test.ts`; `clueLeak.test.ts` (every card); `game.socket.test.ts`; `e2e/round.spec.ts` |
| 5 | A guesser inspects network traffic | Answer absent from everything they receive | `game.socket.test.ts` (all traffic recorded); `e2e/round.spec.ts` (raw WebSocket frames in a real browser) |
| 6 | The explainer submits a guess for their own card | Out-of-turn error | `roundEngine.test.ts` "never lets the explainer guess"; `scoring.socket.test.ts` |
| 7 | Two players guess correctly at the same instant | Both scored exactly once | `roundEngine.test.ts` "scores two players who guess at the same instant exactly once each" |
| 8 | Timer expires with no correct guess | Round ends, reveal shows, nobody scores | `roundEngine.test.ts`; `game.socket.test.ts` |
| 9 | A player refreshes mid-round | Same seat, score and role | `game.socket.test.ts` "a refresh mid-round restores the same role and clues"; `e2e/round.spec.ts` (explainer and guesser refresh) |
| 10 | The explainer stays disconnected for 20 seconds | Round skipped, next explainer starts | `hardening.socket.test.ts` "skips the round if the explainer stays disconnected for 20 seconds"; `roundEngine.test.ts` |
| 11 | The host leaves | Host role passes to the longest-present player | `rooms.socket.test.ts`; `roomManager.test.ts`; `hardening.socket.test.ts` (host absent for 60 seconds) |
| 12 | A room is idle for 30 minutes | Room removed from memory | `roomManager.test.ts`; `rooms.socket.test.ts` |
| 13 | Every card matching the filters has been used | Pool reshuffles, no immediate repeat | `shared.test.ts`; `roundEngine.test.ts` |
| 14 | A malformed or oversized event arrives | Stable error code, server keeps running | `hardening.socket.test.ts` (oversized message, junk payloads, bad REST bodies) |
| 15 | A deck file has a missing field or a duplicate id | CI fails before merge | `deckValidation.test.ts` runs the real validator on broken decks; the CI step `npm run validate:cards` |
| 16 | The server restarts mid-game | Clear message, back to the home screen | `e2e/resilience.spec.ts` (a real server killed and restarted) |

Also covered: room codes and session tokens (`roomManager.test.ts`), nickname and clue blocklist, host kick, per-connection
and per-IP rate limits (IPv6 counted per /64), the per-address connection cap, the socket origin check, expiry of rooms
nobody joins, explainer rotation when players leave or join mid-game, malformed cookies, account deletion, the
curriculum map and selections (including tampered share links), the picker in Party mode and online rooms
(`e2e/picker.spec.ts`), the content checks on every card (`contentChecks.test.ts`), security headers, no console or CSP errors during a game (`e2e/round.spec.ts`), the wake
screen and Party mode with the server off (`e2e/resilience.spec.ts`), sign-in and its CSRF protection, session
forgery, private decks and their ownership (`accounts.test.ts`, `db.test.ts`), saving a finished game and the
revision list (`accounts.socket.test.ts`), and that a database failure never breaks a live game.

## Measured quality metrics

Measured on 19 November 2026.

| Metric | Target | Result | Notes |
|---|---|---|---|
| Guess-match accuracy | 95% or better on 200 labelled guesses | **99.0%** (198 of 200) | The labelled set was machine-drafted, not collected from students; see limitations. The two misses are "half lives" and "one hundred and eighty", both included deliberately as hard cases |
| Clue-filter leak rate | Zero | **0 leaks in 19,562 attempts** over all 300 cards | Every forbidden word, answer and prompt, in 6 or more disguises each (case, punctuation, plural, split words) |
| Content review coverage | 100% reviewed in production | **0% (0 of 300 cards)** | Blocks production: with `NODE_ENV=production` and no cards reviewed, the server serves none |
| Engine test coverage | 90% of lines in `server/src/game` | **99.1%** | `npm run test:coverage` fails below 90% |
| Flag rate, round completion, reconnect success | Measure at the playtest | Not measured | There is deliberately no analytics. Count them by hand at the playtest, or from the flag issues |

## Known limitations

**Content**
- All 300 cards are machine-drafted. A person must check each against a trusted source before it is set to `reviewed`.
- The 200-guess labelled set was machine-drafted too. Add real student guesses to
  `server/tests/fixtures/guess-labels.json` before trusting the 99% figure.

**Rules**
- The clue filter blocks whole words, plurals and words split with spaces or punctuation. It does not catch other
  inflections ("running" for "run"), synonyms or hints, spoken clues, or clues that spell the answer by one letter
  per message. Answers of one or two letters ("he", "ml") are not blocked as clue words.
- Guess matching accepts plurals and one or two typos. It does not accept numbers in words ("one hundred and eighty")
  or irregular plurals ("lives" for "life").
- The blocklist is basic. Extend `server/src/game/blocklist.ts` as playtests show gaps.
- The host's "remove player" bans a nickname, not a person: a removed guest can rejoin under a new name.
- The built-in decks are public (Party mode needs them offline), so a determined guesser who knows the card's type
  and subject can narrow it down by browsing. It is a party game; nobody is graded on it.
- Custom decks must use one of the five built-in subjects. Custom cards are not review-gated, since they are private.
- The old three levels were re-mapped to four by hand: former "School" cards are Secondary, and former University
  and Advanced cards were placed one by one (many are really secondary-school content). Primary has no library
  cards yet. Check the placement during card review.

**Platform**
- Live rooms are in memory. A server restart ends every game in progress (players are told and sent home).
- A free Render instance sleeps after 15 quiet minutes and takes about a minute to wake.
- A room's seat is stored per browser tab, so two tabs in one browser are two players, and a closed tab loses its seat.
- Accounts need Neon, an OAuth app and environment variables (see [setup-accounts](setup-accounts.md)). The database code has been tested against an in-process Postgres and mocked sign-in providers, not against live Neon, GitHub or Google.

**Testing**
- Browser tests run in desktop Chrome only. The install prompt and offline play have not been tried on a real phone.
- No test has run against a deployed Render URL yet.
