import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Card } from "@stemcharades/shared";
import { createApp } from "../src/app.js";
import { loadProviders, cleanDisplayName, type Provider } from "../src/auth/providers.js";
import { createSessionToken } from "../src/auth/session.js";
import * as repo from "../src/db/repo.js";
import { testDb } from "./helpers/testDb.js";

const SECRET = "test-secret-that-is-long-enough";
const CARDS: Card[] = [
  { id: "phy-0001", type: "term", subject: "Physics", topic: "Zorbology", level: 2, prompt: "Zorblaxium", answers: ["zorblaxium"], forbidden: ["alphaword", "betaword", "gammaword"], explanation: "Quuxplanation: a deliberately unusual explanation.", status: "reviewed" },
];
const providers: Provider[] = loadProviders({ GITHUB_CLIENT_ID: "gh-id", GITHUB_CLIENT_SECRET: "gh-secret", GOOGLE_CLIENT_ID: "g-id", GOOGLE_CLIENT_SECRET: "g-secret" } as NodeJS.ProcessEnv);

let db: repo.Db;
let closeDb: () => Promise<void>;
let url: string;
let app: ReturnType<typeof createApp>;
/** What the pretend provider returns. Tests change it per case. */
let profile: Record<string, unknown>;
let providerDown: boolean;
const providerCalls: string[] = [];

const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const u = String(input);
  providerCalls.push(`${init?.method ?? "GET"} ${u}`);
  if (providerDown) return new Response("boom", { status: 500 });
  if (u.includes("access_token") || u.includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "tok" });
  return Response.json(profile);
}) as typeof fetch;

beforeAll(async () => {
  const t = await testDb();
  db = t.db;
  closeDb = t.close;
});
afterAll(async () => closeDb());
beforeEach(async () => {
  profile = { id: 4242, login: "octocat", name: "Real Person", email: "real@example.com" };
  providerDown = false;
  providerCalls.length = 0;
  app = createApp({ cards: CARDS, db, sessionSecret: SECRET, providers, fetchFn: fakeFetch });
  await new Promise<void>((r) => app.httpServer.listen(0, r));
  url = `http://localhost:${(app.httpServer.address() as AddressInfo).port}`;
});
afterEach(async () => {
  await new Promise<void>((r) => void app.io.close(() => r()));
});

const get = (path: string, cookie?: string) => fetch(`${url}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} });
const send = (method: string, path: string, body: unknown, cookie?: string) =>
  fetch(`${url}${path}`, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const setCookies = (r: Response) => r.headers.getSetCookie();
const cookieValue = (r: Response, name: string) => setCookies(r).find((c) => c.startsWith(`${name}=`))?.split(";")[0];

/** Complete a sign-in the way a browser would, returning the session cookie. */
async function signIn(provider = "github"): Promise<string> {
  const start = await get(`/api/auth/${provider}`);
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const stateCookie = cookieValue(start, "sc_oauth_state")!;
  const cb = await get(`/api/auth/${provider}/callback?code=abc&state=${state}`, stateCookie);
  return cookieValue(cb, "sc_session")!;
}
const cookieFor = (userId: string) => `sc_session=${encodeURIComponent(createSessionToken(userId, SECRET))}`;

describe("when no database or provider is configured", () => {
  it("reports sign-in as unavailable and exposes no account routes", async () => {
    const plain = createApp({ cards: CARDS });
    await new Promise<void>((r) => plain.httpServer.listen(0, r));
    const base = `http://localhost:${(plain.httpServer.address() as AddressInfo).port}`;
    expect(await (await fetch(`${base}/api/me`)).json()).toEqual({ authEnabled: false, providers: [], user: null });
    expect((await fetch(`${base}/api/me/history`)).status).toBe(404);
    expect((await fetch(`${base}/api/auth/github`, { redirect: "manual" })).status).toBe(404);
    // Guests are completely unaffected: rooms work exactly as before.
    const room = await fetch(`${base}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname: "Guest" }) });
    expect(room.status).toBe(201);
    await new Promise<void>((r) => void plain.io.close(() => r()));
  });
});

describe("OAuth sign-in", () => {
  it("lists the configured providers", async () => {
    expect(await (await get("/api/me")).json()).toEqual({ authEnabled: true, providers: [{ id: "github", label: "GitHub" }, { id: "google", label: "Google" }], user: null });
  });

  it("sends the browser to the provider with a state value, asks for no email, and sets a protected state cookie", async () => {
    const r = await get("/api/auth/github");
    expect(r.status).toBe(302);
    const loc = new URL(r.headers.get("location")!);
    expect(loc.origin + loc.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(loc.searchParams.get("client_id")).toBe("gh-id");
    expect(loc.searchParams.get("scope")).toBe("read:user");
    expect(loc.searchParams.get("redirect_uri")).toBe(`${url}/api/auth/github/callback`);
    expect(loc.searchParams.get("state")).toMatch(/^[0-9a-f]{32}$/);
    const cookie = setCookies(r).find((c) => c.startsWith("sc_oauth_state="))!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain(loc.searchParams.get("state")!);
    const g = new URL((await get("/api/auth/google")).headers.get("location")!);
    expect(g.searchParams.get("scope")).toBe("openid profile");
  });

  it("signs a user in, creates their account, and remembers only an id and a display name", async () => {
    const session = await signIn();
    expect(session).toBeTruthy();
    const me = await (await get("/api/me", session)).json();
    expect(me.user).toMatchObject({ displayName: "octocat" });
    expect(JSON.stringify(me)).not.toMatch(/Real Person|real@example/);
    expect(providerCalls.join("\n")).toContain("POST https://github.com/login/oauth/access_token");
    // A second sign-in finds the same account instead of creating another.
    const again = await (await get("/api/me", await signIn())).json();
    expect(again.user.id).toBe(me.user.id);
  });

  it("sets a session cookie that cannot be read by scripts", async () => {
    const start = await get("/api/auth/github");
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const cb = await get(`/api/auth/github/callback?code=abc&state=${state}`, cookieValue(start, "sc_oauth_state"));
    expect(cb.status).toBe(302);
    expect(cb.headers.get("location")).toBe("/#/me"); // a fixed destination, never caller-supplied
    const session = setCookies(cb).find((c) => c.startsWith("sc_session="))!;
    expect(session).toContain("HttpOnly");
    expect(session).toContain("SameSite=Lax");
    expect(setCookies(cb).find((c) => c.startsWith("sc_oauth_state="))).toContain("Max-Age=0");
  });

  it("works for Google using the profile's given name only", async () => {
    profile = { sub: "google-123", given_name: "Robin", name: "Robin Realname", email: "r@example.com" };
    const me = await (await get("/api/me", await signIn("google"))).json();
    expect(me.user.displayName).toBe("Robin");
    expect(JSON.stringify(me)).not.toMatch(/Realname|example/);
  });

  it("refuses a callback whose state does not match the cookie (CSRF)", async () => {
    const start = await get("/api/auth/github");
    const stateCookie = cookieValue(start, "sc_oauth_state")!;
    for (const [query, cookie] of [
      ["code=abc&state=wrong", stateCookie],
      ["code=abc", stateCookie],
      ["code=abc&state=" + stateCookie.split("=")[1], undefined],
      ["state=" + stateCookie.split("=")[1], stateCookie],
    ] as const) {
      const r = await get(`/api/auth/github/callback?${query}`, cookie);
      expect(r.status).toBe(302);
      expect(r.headers.get("location")).toBe("/#/?signin=failed");
      expect(cookieValue(r, "sc_session")).toBeUndefined();
    }
    expect(providerCalls).toEqual([]); // never even contacted the provider
  });

  it("fails safely when the provider errors", async () => {
    providerDown = true;
    const start = await get("/api/auth/github");
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const r = await get(`/api/auth/github/callback?code=abc&state=${state}`, cookieValue(start, "sc_oauth_state"));
    expect(r.headers.get("location")).toBe("/#/?signin=failed");
    expect(cookieValue(r, "sc_session")).toBeUndefined();
  });

  it("replaces an unsuitable display name with a neutral one", async () => {
    profile = { id: 7, login: "sh1t" };
    expect((await (await get("/api/me", await signIn())).json()).user.displayName).toBe("Player");
    expect(cleanDisplayName("  Ada_L  ")).toBe("Ada_L");
    expect(cleanDisplayName("<script>alert(1)</script>")).toBe("scriptalert1script"); // markup characters are stripped
    expect(cleanDisplayName(undefined)).toBe("Player");
    expect(cleanDisplayName("x")).toBe("Player");
  });

  it("returns 404 for an unknown provider and signs out cleanly", async () => {
    expect((await get("/api/auth/facebook")).status).toBe(404);
    const session = await signIn();
    const out = await send("POST", "/api/auth/logout", undefined, session);
    expect(out.status).toBe(204);
    expect(setCookies(out).find((c) => c.startsWith("sc_session="))).toContain("Max-Age=0");
    expect((await (await get("/api/me")).json()).user).toBeNull();
  });
});

describe("a signed-in user's own data", () => {
  it("ignores a malformed cookie instead of crashing the server", async () => {
    const r = await get("/api/me", "junk=%E0%A4; other=1");
    expect(r.status).toBe(200);
    expect((await r.json()).user).toBeNull();
    expect((await get("/healthz")).status).toBe(200);
  });

  it("deletes the account and everything stored with it, and signs the browser out", async () => {
    const session = await signIn();
    const deck = await (await send("POST", "/api/me/decks", { name: "To delete" }, session)).json();
    expect(deck.id).toBeTruthy();
    expect((await send("DELETE", "/api/me", undefined)).status).toBe(401); // signed-in users only

    const r = await send("DELETE", "/api/me", undefined, session);
    expect(r.status).toBe(204);
    expect(setCookies(r).find((c) => c.startsWith("sc_session="))).toMatch(/Max-Age=0/);
    expect((await (await get("/api/me", session)).json()).user).toBeNull(); // the old cookie no longer finds anyone
    expect((await get("/api/me/decks", session)).status).toBe(401);
  });

  it("rejects missing, forged and expired sessions", async () => {
    expect((await get("/api/me/history")).status).toBe(401);
    expect((await get("/api/me/history", "sc_session=forged.value")).status).toBe(401);
    expect(((await (await get("/api/me", "sc_session=forged.value")).json()) as { user: unknown }).user).toBeNull();
    const user = await repo.upsertUser(db, { provider: "github", subject: "expired", displayName: "Old" });
    const expired = `sc_session=${encodeURIComponent(createSessionToken(user.id, SECRET, 1_000_000))}`;
    expect((await get("/api/me/history", expired)).status).toBe(401);
  });

  it("shows game history and a revision list built from the built-in cards", async () => {
    const user = await repo.upsertUser(db, { provider: "github", subject: "hist", displayName: "Hist" });
    await repo.saveFinishedGame(db, { roomSize: 3, rounds: 2, settings: {}, players: [{ userId: user.id, score: 25, rank: 2 }], cards: [], missed: [{ userId: user.id, cardIds: ["phy-0001", "gone-9999"] }], got: [] });
    const cookie = cookieFor(user.id);
    const history = (await (await get("/api/me/history", cookie)).json()) as { score: number; rank: number }[];
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ score: 25, rank: 2, roomSize: 3 });
    const missed = (await (await get("/api/me/missed-cards", cookie)).json()) as { id: string; explanation: string }[];
    expect(missed.map((c) => c.id)).toEqual(["phy-0001"]); // an id no longer in the deck is skipped, not an error
    expect(missed[0]!.explanation).toContain("Quuxplanation");
    // Another user sees none of it.
    const other = await repo.upsertUser(db, { provider: "github", subject: "hist-other", displayName: "Other" });
    expect(await (await get("/api/me/history", cookieFor(other.id))).json()).toEqual([]);
  });

  describe("custom decks", () => {
    let cookie: string;
    let otherCookie: string;
    beforeEach(async () => {
      cookie = cookieFor((await repo.upsertUser(db, { provider: "github", subject: `owner-${Math.random()}`, displayName: "Owner" })).id);
      otherCookie = cookieFor((await repo.upsertUser(db, { provider: "github", subject: `other-${Math.random()}`, displayName: "Other" })).id);
    });
    const card = { type: "term", subject: "Physics", topic: "Zorbology", level: 2, prompt: "Zorblaxium", answers: ["zorblaxium"], forbidden: ["alphaword", "betaword", "gammaword"], explanation: "A deliberately unusual explanation sentence." };

    it("are created, filled, read back and deleted through the API", async () => {
      const made = await send("POST", "/api/me/decks", { name: "Class 10B" }, cookie);
      expect(made.status).toBe(201);
      const deck = (await made.json()) as { id: string };
      const added = await send("POST", `/api/me/decks/${deck.id}/cards`, card, cookie);
      expect(added.status).toBe(201);
      const cardId = ((await added.json()) as { id: string }).id;
      const full = (await (await get(`/api/me/decks/${deck.id}`, cookie)).json()) as { name: string; cards: { prompt: string }[] };
      expect(full).toMatchObject({ name: "Class 10B", cards: [{ prompt: "Zorblaxium" }] });
      expect(((await (await get("/api/me/decks", cookie)).json()) as { cards: number }[])[0]!.cards).toBe(1);
      expect((await send("DELETE", `/api/me/decks/${deck.id}/cards/${cardId}`, undefined, cookie)).status).toBe(204);
      expect((await send("DELETE", `/api/me/decks/${deck.id}`, undefined, cookie)).status).toBe(204);
      expect((await get(`/api/me/decks/${deck.id}`, cookie)).status).toBe(404);
    });

    it("are private: another account gets 404 for every operation", async () => {
      const deck = (await (await send("POST", "/api/me/decks", { name: "Mine" }, cookie)).json()) as { id: string };
      const added = (await (await send("POST", `/api/me/decks/${deck.id}/cards`, card, cookie)).json()) as { id: string };
      expect((await get(`/api/me/decks/${deck.id}`, otherCookie)).status).toBe(404);
      expect((await send("POST", `/api/me/decks/${deck.id}/cards`, card, otherCookie)).status).toBe(404);
      expect((await send("DELETE", `/api/me/decks/${deck.id}/cards/${added.id}`, undefined, otherCookie)).status).toBe(404);
      expect((await send("DELETE", `/api/me/decks/${deck.id}`, undefined, otherCookie)).status).toBe(404);
      expect(await (await get("/api/me/decks", otherCookie)).json()).toEqual([]);
    });

    it("validate every field and block rude text", async () => {
      const deck = (await (await send("POST", "/api/me/decks", { name: "Valid" }, cookie)).json()) as { id: string };
      for (const bad of [{}, { ...card, forbidden: ["only", "two"] }, { ...card, level: 9 }, { ...card, type: "formula" }, { ...card, extra: 1 }, { ...card, prompt: "x" }]) {
        expect((await send("POST", `/api/me/decks/${deck.id}/cards`, bad, cookie)).status).toBe(400);
      }
      const rude = await send("POST", `/api/me/decks/${deck.id}/cards`, { ...card, explanation: "This is such shit that nobody should read it." }, cookie);
      expect(rude.status).toBe(400);
      expect(await rude.json()).toEqual({ error: "blocked_content" });
      expect((await send("POST", "/api/me/decks", { name: "" }, cookie)).status).toBe(400);
      expect((await send("POST", "/api/me/decks", { name: "fuck class" }, cookie)).status).toBe(400);
      expect((await get("/api/me/decks/not-a-uuid", cookie)).status).toBe(404);
      expect((await send("POST", "/api/me/decks/not-a-uuid/cards", card, cookie)).status).toBe(400);
    });

    it("stop at the deck limit with a clear conflict response", async () => {
      for (let i = 0; i < 20; i++) expect((await send("POST", "/api/me/decks", { name: `Deck ${i}` }, cookie)).status).toBe(201);
      const over = await send("POST", "/api/me/decks", { name: "21st" }, cookie);
      expect(over.status).toBe(409);
      expect(await over.json()).toEqual({ error: "deck_limit" });
    });
  });
});
