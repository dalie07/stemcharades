import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { EVENTS, type Card, type CreateRoomResponse, type ErrorPayload, type JoinAck, type RoomView } from "@stemcharades/shared";
import { createApp } from "../src/app.js";
import { createSessionToken } from "../src/auth/session.js";
import { REVEAL_MS } from "../src/game/roundEngine.js";
import * as repo from "../src/db/repo.js";
import { tickGames } from "../src/realtime/handlers.js";
import { testDb } from "./helpers/testDb.js";

const SECRET = "test-secret-that-is-long-enough";
const BUILT_IN: Card = { id: "phy-0001", type: "term", subject: "Physics", course: "secondary-physics", topic: "Zorbology", level: 2, prompt: "Zorblaxium", answers: ["zorblaxium"], forbidden: ["alphaword", "betaword", "gammaword"], explanation: "Quuxplanation: a deliberately unusual explanation.", status: "reviewed" };

let db: repo.Db;
let closeDb: () => Promise<void>;
let url: string;
let app: ReturnType<typeof createApp>;
let now: number;
const sockets: Socket[] = [];

beforeAll(async () => {
  const t = await testDb();
  db = t.db;
  closeDb = t.close;
});
afterAll(async () => closeDb());
afterEach(async () => {
  sockets.splice(0).forEach((s) => s.disconnect());
  await new Promise<void>((r) => void app.io.close(() => r()));
});

const PROVIDER = { id: "github" as const, label: "GitHub", authUrl: "https://x/a", tokenUrl: "https://x/t", userUrl: "https://x/u", scope: "s", clientId: "i", clientSecret: "s" };

// Accounts are only enabled when a provider is configured, so give the test app one.
beforeEach(async () => {
  now = 1_000_000;
  app = createApp({
    cards: [BUILT_IN], db, sessionSecret: SECRET, clock: () => now, rng: () => 0,
    providers: [PROVIDER],
  });
  await new Promise<void>((r) => app.httpServer.listen(0, r));
  url = `http://localhost:${(app.httpServer.address() as AddressInfo).port}`;
});

const newUser = (tag: string) => repo.upsertUser(db, { provider: "github", subject: `${tag}-${Math.random()}`, displayName: tag });
const cookie = (userId: string) => `sc_session=${encodeURIComponent(createSessionToken(userId, SECRET))}`;
const client = (userCookie?: string) => {
  const s = connect(url, { transports: ["websocket"], forceNew: true, extraHeaders: userCookie ? { cookie: userCookie } : {} });
  sockets.push(s);
  return s;
};
const join = (s: Socket, payload: object) => new Promise<JoinAck>((resolve) => s.emit(EVENTS.join, payload, resolve));
const state = (s: Socket, pred: (v: RoomView) => boolean) =>
  new Promise<RoomView>((resolve) => {
    const h = (v: RoomView) => {
      if (pred(v)) {
        s.off(EVENTS.state, h);
        resolve(v);
      }
    };
    s.on(EVENTS.state, h);
  });
const once = <T>(s: Socket, ev: string) => new Promise<T>((r) => s.once(ev, r));
const tick = () => tickGames(app.io, app.rooms, app.runner);
async function until<T>(fn: () => Promise<T | null | false | undefined>, ms = 3000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("timed out waiting");
}

/** Host (signed in) creates a room through the REST API, as the real client does, then joins its socket. */
async function openRoom(host: { id: string }, guests: { name: string; userId?: string }[]) {
  const res = await fetch(`${url}/api/rooms`, { method: "POST", headers: { "content-type": "application/json", cookie: cookie(host.id) }, body: JSON.stringify({ nickname: "Host" }) });
  const created = (await res.json()) as CreateRoomResponse;
  const hostSock = client(cookie(host.id));
  await join(hostSock, { code: created.code, sessionToken: created.sessionToken });
  const guestSocks: Socket[] = [];
  for (const g of guests) {
    const s = client(g.userId ? cookie(g.userId) : undefined);
    const ack = await join(s, { code: created.code, nickname: g.name });
    if (!ack.ok) throw new Error(ack.error);
    guestSocks.push(s);
  }
  return { code: created.code, host: hostSock, guests: guestSocks };
}

describe("saving a finished game", () => {
  it("records signed-in players only, plus card statistics and a revision list, and never blocks the game", async () => {
    const hostUser = await newUser("host");
    const annUser = await newUser("ann");
    const { host, guests } = await openRoom(hostUser, [{ name: "Ann", userId: annUser.id }, { name: "Gus" }]); // Gus is a guest
    host.emit(EVENTS.configure, { levels: [], courses: ["secondary-physics"], topics: [], roundSeconds: 60, rounds: 1 });
    await new Promise((r) => setTimeout(r, 50));
    host.emit(EVENTS.start);
    await state(host, (v) => v.phase === "round");

    // Ann gets it at once; the guest never does.
    const result = once(guests[0]!, EVENTS.guessResult);
    guests[0]!.emit(EVENTS.guess, { text: "zorblaxium" });
    await result;
    now += 60_000;
    tick(); // timer ends the round
    now += REVEAL_MS;
    const finished = state(host, (v) => v.phase === "finished");
    tick();
    await finished;

    const annHistory = await until(async () => {
      const h = await repo.history(db, annUser.id);
      return h.length ? h : null;
    });
    // Ann guessed at once (10 + 10); the host explained (5); the guest scored nothing and is not stored.
    expect(annHistory[0]).toMatchObject({ roomSize: 3, rounds: 1, score: 20, rank: 1 });
    const hostHistory = await repo.history(db, hostUser.id);
    expect(hostHistory[0]).toMatchObject({ score: 5, rank: 2 });
    // Exactly the two signed-in players were stored. The guest left no trace.
    const stats = await until(async () => repo.statsFor(db, "phy-0001"));
    expect(stats).toMatchObject({ timesPlayed: 1, timesGuessed: 1 });
    expect(stats.avgSecondsToGuess).toBeCloseTo(0, 5); // she guessed at the very start of the round
    expect(await repo.missedList(db, annUser.id)).toEqual([]); // Ann got the only card
    expect((await repo.missedList(db, hostUser.id)).length).toBe(0); // Host explained it: not a miss
  });

  it("does not store anything for a game that never completed a round", async () => {
    const hostUser = await newUser("quitter");
    const { host } = await openRoom(hostUser, [{ name: "Ann" }]);
    host.emit(EVENTS.start);
    await state(host, (v) => v.phase === "round");
    host.emit(EVENTS.leave);
    await new Promise((r) => setTimeout(r, 100));
    expect(await repo.history(db, hostUser.id)).toEqual([]);
  });

  it("keeps the game running when the database fails", async () => {
    // Its own database, so breaking it cannot affect the other tests.
    const broken = await testDb();
    await new Promise<void>((r) => void app.io.close(() => r()));
    app = createApp({ cards: [BUILT_IN], db: broken.db, sessionSecret: SECRET, providers: [PROVIDER], clock: () => now, rng: () => 0 });
    await new Promise<void>((r) => app.httpServer.listen(0, r));
    url = `http://localhost:${(app.httpServer.address() as AddressInfo).port}`;

    const hostUser = await repo.upsertUser(broken.db, { provider: "github", subject: "resilient", displayName: "R" });
    const annUser = await repo.upsertUser(broken.db, { provider: "github", subject: "annR", displayName: "A" });
    const { host, guests } = await openRoom(hostUser, [{ name: "Ann", userId: annUser.id }]);
    host.emit(EVENTS.configure, { levels: [], courses: ["secondary-physics"], topics: [], roundSeconds: 60, rounds: 1 });
    await new Promise((r) => setTimeout(r, 50));
    host.emit(EVENTS.start);
    await state(host, (v) => v.phase === "round");
    await broken.close(); // the database goes away mid-game
    guests[0]!.emit(EVENTS.guess, { text: "zorblaxium" });
    now += 60_000;
    tick();
    now += REVEAL_MS;
    const finished = state(host, (v) => v.phase === "finished");
    tick();
    expect((await finished).summary?.standings.length).toBe(2); // the players still get their scoreboard
  });
});

describe("private custom decks in a live room", () => {
  const customCard = { type: "term" as const, subject: "Physics" as const, topic: "Zorbology", level: 2 as const, prompt: "Customword", answers: ["customword"], forbidden: ["privateone", "privatetwo", "privatethree"], explanation: "Hiddenexplanation: only the owner's group should ever see this." };

  async function deckFor(userId: string) {
    const deck = (await repo.createDeck(db, userId, "Study group")) as { id: string };
    await repo.addCard(db, userId, deck.id, customCard);
    return deck.id;
  }

  it("lets a signed-in host use their own deck, and everyone sees only its name until the reveal", async () => {
    const hostUser = await newUser("deckhost");
    const deckId = await deckFor(hostUser.id);
    const { host, guests } = await openRoom(hostUser, [{ name: "Ann" }]);
    const seen: string[] = [];
    guests[0]!.onAny((_e: string, ...a: unknown[]) => seen.push(JSON.stringify(a)));

    const picked = state(guests[0]!, (v) => v.customDeck?.name === "Study group");
    host.emit(EVENTS.deck, { deckId });
    expect((await picked).customDeck).toEqual({ name: "Study group", count: 1 });

    host.emit(EVENTS.start);
    const round = await state(host, (v) => v.phase === "round");
    expect(round.round?.explainerCard?.prompt).toBe("Customword"); // the built-in card is not used
    expect(round.round?.explainerCard?.prompt).not.toBe("Zorblaxium");
    const raw = seen.join("\n");
    for (const secret of ["Customword", "customword", "Hiddenexplanation", "privateone"]) expect(raw).not.toContain(secret);

    // A clue using the deck's forbidden word is rejected, exactly like a built-in card.
    const rejected = once<{ reason: string }>(host, EVENTS.clueRejected);
    host.emit(EVENTS.clue, { text: "think of privateone" });
    expect((await rejected).reason).toBe("forbidden_word");

    // The guesser can score on a custom card.
    const got = once<{ result: string }>(guests[0]!, EVENTS.guessResult);
    guests[0]!.emit(EVENTS.guess, { text: "Customword" });
    expect((await got).result).toBe("correct");
  });

  it("keeps custom cards out of global statistics and the personal revision list", async () => {
    const hostUser = await newUser("deckstats");
    const annUser = await newUser("annstats");
    const deckId = await deckFor(hostUser.id);
    const { host } = await openRoom(hostUser, [{ name: "Ann", userId: annUser.id }]);
    host.emit(EVENTS.deck, { deckId });
    await state(host, (v) => v.customDeck !== undefined);
    host.emit(EVENTS.configure, { levels: [], courses: ["secondary-physics"], topics: [], roundSeconds: 60, rounds: 1 });
    await new Promise((r) => setTimeout(r, 50));
    host.emit(EVENTS.start);
    await state(host, (v) => v.phase === "round");
    now += 60_000;
    tick(); // nobody guesses
    now += REVEAL_MS;
    const finished = state(host, (v) => v.phase === "finished");
    tick();
    await finished;
    await until(async () => (await repo.history(db, annUser.id)).length > 0);
    expect(await repo.missedList(db, annUser.id)).toEqual([]);
    expect((await repo.getDeck(db, hostUser.id, deckId))!.cards).toHaveLength(1);
  });

  it("refuses a deck that is not the host's, a guest host, and a non-host", async () => {
    const hostUser = await newUser("owner1");
    const strangerDeck = await deckFor((await newUser("stranger")).id);
    const { host, guests } = await openRoom(hostUser, [{ name: "Ann" }]);

    const notOwner = once<ErrorPayload>(host, EVENTS.error);
    host.emit(EVENTS.deck, { deckId: strangerDeck });
    expect((await notOwner).code).toBe("unknown_deck");

    const notHost = once<ErrorPayload>(guests[0]!, EVENTS.error);
    guests[0]!.emit(EVENTS.deck, { deckId: await deckFor(hostUser.id) });
    expect((await notHost).code).toBe("unauthorized"); // a guest has no account, so cannot use a private deck

    const bad = once<ErrorPayload>(host, EVENTS.error);
    host.emit(EVENTS.deck, { deckId: "not-a-uuid" });
    expect((await bad).code).toBe("invalid_payload");

    // A guest who hosts a room cannot use a deck either.
    const guestRoom = (await (await fetch(`${url}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname: "GuestHost" }) })).json()) as CreateRoomResponse;
    const gh = client();
    await join(gh, { code: guestRoom.code, sessionToken: guestRoom.sessionToken });
    const denied = once<ErrorPayload>(gh, EVENTS.error);
    gh.emit(EVENTS.deck, { deckId: await deckFor(hostUser.id) });
    expect((await denied).code).toBe("unauthorized");
  });

  it("can be switched off again, and cannot be changed mid-round", async () => {
    const hostUser = await newUser("switcher");
    const deckId = await deckFor(hostUser.id);
    const { host } = await openRoom(hostUser, [{ name: "Ann" }]);
    host.emit(EVENTS.deck, { deckId });
    await state(host, (v) => v.customDeck !== undefined);
    const cleared = state(host, (v) => v.customDeck === undefined);
    host.emit(EVENTS.deck, { deckId: null });
    await cleared;
    host.emit(EVENTS.start);
    const round = await state(host, (v) => v.phase === "round");
    expect(round.round?.explainerCard?.prompt).toBe("Zorblaxium"); // back to the built-in deck
    const err = once<ErrorPayload>(host, EVENTS.error);
    host.emit(EVENTS.deck, { deckId });
    expect((await err).code).toBe("out_of_turn");
  });
});
