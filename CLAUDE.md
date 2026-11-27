# STEMCHARADES

A multiplayer STEM explaining game: Party mode on one phone, and online rooms over Socket.IO.
Guidance for AI coding assistants working in this repository. Human contributors: the same rules apply.

## Stack

TypeScript (strict) · npm workspaces (`client`, `server`, `shared`) · React + Vite + Tailwind + Zustand + KaTeX ·
Express + Socket.IO in one Node process on one free Render web service · Zod schemas shared by both sides ·
optional Postgres (Neon) through Drizzle · Vitest + Playwright · GitHub Actions.

## Commands

- `npm run dev` – server on :3000 and the Vite client on :5173
- `npm run build` then `npm start` – the production shape: one process serving `client/dist`
- `npm run check` – typecheck, lint, card validation and all unit tests
- `npm run test:e2e` – Playwright, several real browsers per test (uses the installed Chrome locally)
- `npm run test:coverage` – game-engine coverage; fails under 90%
- `npm run validate:cards` – schema, duplicate ids, shared answers
- `npm run cards:prompts` / `npm run cards:import -- <file>` – draft cards with Claude, then import them as drafts
  (see `content/prompts/README.md`)
- `npm run db:generate -w server` – a new SQL migration after editing `server/src/db/schema.ts`

Set `ALLOW_DRAFT_CARDS=1` locally: production serves only cards whose `status` is `reviewed`.

## Where things live

- `server/src/game/roundEngine.ts` – every rule. `step(game, event, ctx)` returns a new game and effects.
- `server/src/game/gameRunner.ts` – connects the engine to live rooms and builds each player's view.
- `server/src/realtime/handlers.ts` – validation, rate limits and plumbing only. No rules.
- `shared/src/rooms.ts` – payload schemas, error codes and the view types the client renders.
- `client/src/screens/` – one file per screen; `client/src/components/ui.tsx` holds the shared building blocks.
- `client/src/party/partyEngine.ts` – Party mode's rules, run in the browser.
- `shared/src/taxonomy.ts` – the curriculum map: levels, subjects or courses, topics, and player selections.
- `server/src/content/` – loads the decks and runs the content checks the validator also uses.

## Non-negotiables

1. The server is authoritative: it picks cards, runs the timer, judges guesses and awards points.
2. The answer never reaches a guesser's connection. Views are built per player; nothing is broadcast to a room.
3. Every REST body and socket event is parsed against a schema in `shared/`.
4. The round engine stays pure: no sockets, clocks or randomness inside. Tests come before rules.
5. Card ≠ round ≠ result. Cards are reviewed content in Git; rounds live in memory; results are the small durable summary.
6. No card moves from `draft` to `reviewed` until a person has checked it against a trusted source. Cards are
   never generated during play (see `docs/decisions/0002-reviewed-cards-not-live-ai.md`).
7. No paid services, one service only, and no new dependency without asking.
8. Accounts are optional: with no `DATABASE_URL` the game must work exactly as it does for guests.

## Conventions

- Comments explain why, not what. Player-facing text is plain and short.
- A feature is done when it has automated tests and its docs are current.
- Keep content commits (`content:`) separate from code commits (`feat:`, `fix:`, `test:`, `docs:`).
