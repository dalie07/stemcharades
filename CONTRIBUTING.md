# Contributing

Thanks for helping. There are two kinds of contribution, and both matter: **cards** and **code**.

## Reporting a problem

- **A wrong card:** press **Flag this card** on the card in the game, or open an issue with the card id
  (for example `phy-0042`), what is wrong, and a source.
- **A bug:** open an issue with what you did, what you expected, what happened, and your browser and device.
- **A security problem:** do not open an issue. See [SECURITY.md](SECURITY.md).

## Cards

Cards live in `content/decks/<subject>.json`. Read the [content guide](docs/content-guide.md) first.

1. Edit or add cards. New cards start as `"status": "draft"`.
2. Run `npm run validate:cards`.
3. A card becomes `"reviewed"` only after a person has checked it against a trusted source (a textbook, course
   notes or a standard reference). Name the source in the pull request.
4. Keep content in its own commits, prefixed `content:`.

## Code

You need Node 22 (see `.nvmrc`) and npm.

```bash
npm install
ALLOW_DRAFT_CARDS=1 npm run dev     # server on :3000, client on :5173
```

Before opening a pull request:

```bash
npm run check       # typecheck, lint, card validation, unit tests
npm run test:e2e    # browser tests (uses your installed Chrome)
```

A change is done when it has automated tests and the docs that describe it are current.

### The rules that never bend

1. The server is authoritative: it picks cards, runs the timer, judges guesses and awards points.
2. The answer never reaches a guesser's connection. Views are built per player.
3. Every REST body and socket event is validated against a schema in `shared/`.
4. The round engine (`server/src/game/roundEngine.ts`) stays pure: no sockets, clocks or randomness inside.
5. No paid services, one service only, and no new dependency without discussion in an issue first.
6. Accounts stay optional: with no `DATABASE_URL` the game works exactly as it does for guests.

### Style

- TypeScript strict, linted by ESLint; editor settings in `.editorconfig`.
- Comments explain why, not what. Player-facing text is plain and short.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `test:`,
  `docs:`, `refactor:`, `chore:`, `content:`.
