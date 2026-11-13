import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_CARDS_PER_DECK, MAX_DECKS_PER_USER, type CustomCard } from "@stemcharades/shared";
import * as repo from "../src/db/repo.js";
import { testDb } from "./helpers/testDb.js";

let db: repo.Db;
let close: () => Promise<void>;
beforeAll(async () => {
  const t = await testDb();
  db = t.db;
  close = t.close;
});
afterAll(async () => close());

const mkUser = (n: string) => repo.upsertUser(db, { provider: "github", subject: n, displayName: `User${n}` });
const card = (prompt = "Zorblaxium"): CustomCard => ({
  type: "term", subject: "Physics", topic: "Zorbology", level: 2, prompt,
  answers: ["zorblaxium"], forbidden: ["alphaword", "betaword", "gammaword"],
  explanation: "A deliberately unusual explanation sentence.",
});

describe("users", () => {
  it("are found by provider and subject, and a repeat sign-in updates the display name", async () => {
    const a = await repo.upsertUser(db, { provider: "github", subject: "u1", displayName: "Old" });
    const b = await repo.upsertUser(db, { provider: "github", subject: "u1", displayName: "New" });
    expect(b.id).toBe(a.id);
    expect(b.displayName).toBe("New");
    const google = await repo.upsertUser(db, { provider: "google", subject: "u1", displayName: "G" });
    expect(google.id).not.toBe(a.id); // same subject, different provider: a different person
    expect(await repo.getUser(db, a.id)).toEqual({ id: a.id, displayName: "New" });
    expect(await repo.getUser(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("saving a finished game", () => {
  it("stores only signed-in players, with their rank, and lists it in their history", async () => {
    const ann = await mkUser("ann");
    const ben = await mkUser("ben");
    await repo.saveFinishedGame(db, {
      roomSize: 4, rounds: 3, settings: { rounds: 3 },
      players: [{ userId: ann.id, score: 40, rank: 1 }, { userId: ben.id, score: 15, rank: 3 }],
      cards: [], missed: [], got: [],
    });
    const hist = await repo.history(db, ann.id);
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ score: 40, rank: 1, roomSize: 4, rounds: 3 });
    expect((await repo.history(db, ben.id))[0]).toMatchObject({ score: 15, rank: 3 });
  });

  it("can save a game with no signed-in players at all", async () => {
    const id = await repo.saveFinishedGame(db, { roomSize: 3, rounds: 2, settings: {}, players: [], cards: [{ cardId: "phy-0001", guessed: true, secondsToGuess: 5 }], missed: [], got: [] });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps a running average of how long each card takes to guess", async () => {
    const play = (guessed: boolean, secs: number | null) =>
      repo.saveFinishedGame(db, { roomSize: 3, rounds: 1, settings: {}, players: [], cards: [{ cardId: "mat-9999", guessed, secondsToGuess: secs }], missed: [], got: [] });
    await play(true, 10);
    await play(false, null); // played but never guessed: counts as played only
    await play(true, 20);
    const s = await repo.statsFor(db, "mat-9999");
    expect(s).toMatchObject({ timesPlayed: 3, timesGuessed: 2 });
    expect(s!.avgSecondsToGuess).toBeCloseTo(15, 5);
    expect(await repo.statsFor(db, "nope-0000")).toBeNull();
  });

  it("builds a personal missed-cards list, and getting a card right later clears it", async () => {
    const cara = await mkUser("cara");
    const save = (missed: string[], got: string[]) =>
      repo.saveFinishedGame(db, { roomSize: 2, rounds: 1, settings: {}, players: [], cards: [], missed: [{ userId: cara.id, cardIds: missed }], got: [{ userId: cara.id, cardIds: got }] });
    await save(["bio-0001", "bio-0002"], []);
    expect((await repo.missedList(db, cara.id)).map((m) => m.cardId).sort()).toEqual(["bio-0001", "bio-0002"]);
    await save(["bio-0001"], ["bio-0002"]); // missed one again, finally got the other
    expect((await repo.missedList(db, cara.id)).map((m) => m.cardId)).toEqual(["bio-0001"]);
  });

  it("is atomic: a failure part-way leaves nothing behind", async () => {
    const before = (await repo.history(db, (await mkUser("dan")).id)).length;
    await expect(
      repo.saveFinishedGame(db, {
        roomSize: 2, rounds: 1, settings: {},
        players: [{ userId: "00000000-0000-4000-8000-000000000000", score: 1, rank: 1 }], // no such user: foreign key fails
        cards: [], missed: [], got: [],
      }),
    ).rejects.toThrow();
    expect((await repo.history(db, (await mkUser("dan")).id)).length).toBe(before);
  });

  it("returns history newest first and honours the limit", async () => {
    const eve = await mkUser("eve");
    for (let i = 1; i <= 3; i++) {
      await repo.saveFinishedGame(db, { roomSize: 2, rounds: i, settings: {}, players: [{ userId: eve.id, score: i, rank: 1 }], cards: [], missed: [], got: [] });
      await new Promise((r) => setTimeout(r, 15));
    }
    expect((await repo.history(db, eve.id)).map((h) => h.rounds)).toEqual([3, 2, 1]);
    expect(await repo.history(db, eve.id, 2)).toHaveLength(2);
  });
});

describe("private custom decks", () => {
  it("are created, filled, read back as cards, and deleted with their cards", async () => {
    const owner = await mkUser("owner");
    const deck = (await repo.createDeck(db, owner.id, "Year 10 Physics")) as { id: string; name: string };
    expect(deck.name).toBe("Year 10 Physics");
    const added = (await repo.addCard(db, owner.id, deck.id, card())) as { id: string };
    expect(added.id).toMatch(/^cus-/);
    await repo.addCard(db, owner.id, deck.id, { ...card("Wibblefrop"), type: "formula", latex: "E=mc^2" });

    const full = await repo.getDeck(db, owner.id, deck.id);
    expect(full!.cards).toHaveLength(2);
    expect(full!.cards[0]).toMatchObject({ id: added.id, prompt: "Zorblaxium", status: "reviewed", subject: "Physics" });
    expect(full!.cards[1]!.latex).toBe("E=mc^2");
    expect((await repo.listDecks(db, owner.id)).find((d) => d.id === deck.id)?.cards).toBe(2);

    expect(await repo.deleteCard(db, owner.id, deck.id, added.id)).toBe(true);
    expect((await repo.getDeck(db, owner.id, deck.id))!.cards).toHaveLength(1);
    expect(await repo.deleteDeck(db, owner.id, deck.id)).toBe(true);
    expect(await repo.getDeck(db, owner.id, deck.id)).toBeNull();
  });

  it("belong to their owner alone: nobody else can read, add to or delete them", async () => {
    const a = await mkUser("deckA");
    const b = await mkUser("deckB");
    const deck = (await repo.createDeck(db, a.id, "Private")) as { id: string };
    const c = (await repo.addCard(db, a.id, deck.id, card())) as { id: string };
    expect(await repo.getDeck(db, b.id, deck.id)).toBeNull();
    expect(await repo.addCard(db, b.id, deck.id, card())).toBe("not_found");
    expect(await repo.deleteCard(db, b.id, deck.id, c.id)).toBe(false);
    expect(await repo.deleteDeck(db, b.id, deck.id)).toBe(false);
    expect((await repo.listDecks(db, b.id)).some((d) => d.id === deck.id)).toBe(false);
    expect(await repo.getDeck(db, a.id, deck.id)).not.toBeNull();
  });

  it("enforce the per-user deck limit and the per-deck card limit", async () => {
    const u = await mkUser("limits");
    let last: unknown;
    for (let i = 0; i < MAX_DECKS_PER_USER; i++) last = await repo.createDeck(db, u.id, `Deck ${i}`);
    expect(typeof last).toBe("object");
    expect(await repo.createDeck(db, u.id, "One too many")).toBe("limit");

    const deck = (await repo.listDecks(db, u.id))[0]!;
    for (let i = 0; i < MAX_CARDS_PER_DECK; i++) await repo.addCard(db, u.id, deck.id, card(`Prompt ${i}`));
    expect(await repo.addCard(db, u.id, deck.id, card("Overflow"))).toBe("limit");
  }, 60_000);

  it("disappear with their owner (nothing is left behind)", async () => {
    const u = await mkUser("leaver");
    const deck = (await repo.createDeck(db, u.id, "Gone soon")) as { id: string };
    await repo.addCard(db, u.id, deck.id, card());
    await repo.deleteUser(db, u.id);
    expect(await repo.getUser(db, u.id)).toBeNull();
    expect(await repo.getDeck(db, u.id, deck.id)).toBeNull();
  });
});
