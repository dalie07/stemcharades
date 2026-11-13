# Setting up accounts (optional)

Accounts, game history, the revision list and private decks need a database and a sign-in provider.
**Without them the game works exactly as before:** guests play, nothing is stored, and the sign-in links
simply do not appear. Set these up only when you want the Week 9 features.

## 1. A free Postgres database (Neon)

Use Neon, not Render's own free Postgres, which expires after 30 days.

1. Create a free project at neon.tech and copy its **connection string** (it starts with `postgresql://`).
2. In Render, open the service, then **Environment**, and add `DATABASE_URL` with that string.
3. Redeploy. On start the server applies the migrations in `server/drizzle/` by itself. Look for
   `Database connected` in the logs. If the database cannot be reached the server logs the reason and keeps
   running without accounts.

Neon's compute sleeps when idle, so the first save after a quiet spell can take a second or two. Saving a
finished game never delays or blocks the game itself.

## 2. A session secret

Add `SESSION_SECRET` in Render: any long random string. Generate one with `openssl rand -hex 32`.
Changing it signs everyone out.

## 3. At least one sign-in provider

The redirect (callback) URL for each provider is `https://YOUR-SERVICE.onrender.com/api/auth/PROVIDER/callback`.

**GitHub:** Settings → Developer settings → OAuth Apps → New OAuth App. Homepage URL is your service URL,
callback is `.../api/auth/github/callback`. Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to Render.

**Google:** Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application).
Add `.../api/auth/google/callback` as an authorised redirect URI. Add `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` to Render.

Optionally set `PUBLIC_URL` to your service's origin (for example `https://stemcharades.onrender.com`) so the
redirect URI never depends on request headers.

## What is stored

A provider's id for you and a display name, and nothing else. We ask each provider only for your public profile
(GitHub's `read:user`, Google's `openid profile`): **no email, no password, no real name.** GitHub users get their
login handle as a display name; Google users get their given name, or "Player". Names are cleaned and screened.
Finished games are saved for signed-in players only; guests are never stored.

## Local development with a database

```bash
# any Postgres will do; this one needs Docker
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=pw postgres:16
export DATABASE_URL=postgresql://postgres:pw@localhost:5432/postgres
export SESSION_SECRET=dev-secret-change-me
export GITHUB_CLIENT_ID=... GITHUB_CLIENT_SECRET=...   # callback http://localhost:3000/api/auth/github/callback
ALLOW_DRAFT_CARDS=1 npm run build && npm start
```

The automated tests need none of this: they run against an in-process Postgres (PGlite) with the real migrations.

## Changing the schema

Edit `server/src/db/schema.ts`, run `npm run db:generate -w server`, review the new SQL in `server/drizzle/`
and commit it. Migrations run automatically on start.
