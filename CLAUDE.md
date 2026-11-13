# STEMCHARADES

Multiplayer STEM explaining game. Full plan: the "Architecture, System Design & Build Roadmap" PDF.
All ten roadmap weeks are built locally. What is left needs a human: review the 300 draft cards, deploy to Render, a real playtest, and (optionally) Neon + OAuth setup. See docs/test-plan.md. Do not build new features before those are done.

## Stack
TypeScript (strict) · npm workspaces (`client`, `server`, `shared`) · React + Vite + Tailwind ·
Express + Socket.IO (single Node process, one Render free web service) · Zod (from Week 2) ·
Vitest + Playwright · GitHub Actions CI.

## Commands
- `npm run dev` – server (:3000) and client (Vite) together
- `npm run build` – build the client
- `npm start` – run the server (serves `client/dist`)
- `npm test` · `npm run typecheck` · `npm run lint`
- `npm run validate:cards` – validate decks (schema, ids, answers)
- `npm run test:coverage` – engine coverage, fails under 90%
- `npm run test:e2e` – Playwright, several real browsers (`PW_CHANNEL` not needed locally: uses installed Chrome)
- `npm run db:generate -w server` – new SQL migration after editing `server/src/db/schema.ts`

## Non-negotiables
1. The server is authoritative: it picks cards, runs the timer, judges guesses, awards points.
2. The answer never reaches a guesser's connection.
3. Every event and REST body goes through a shared schema.
4. No paid services. No new dependency without asking. (Accounts are optional: with no `DATABASE_URL` the game must work exactly as before.)
5. Keep the round engine pure (state + event in, state + messages out).
6. Card ≠ round ≠ result. Only reviewed cards load in production.
7. One service only: no queue, cache, container or second service.
8. Do not progress to the next week while the current exit criterion is unmet.
