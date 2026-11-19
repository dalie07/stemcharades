import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import {
  EVENTS,
  type Card,
  type CreateRoomResponse,
  type ErrorPayload,
  type GuessResultPayload,
  type JoinAck,
  type RoomView,
} from "@stemcharades/shared";
import { createApp } from "../src/app.js";
import { tickGames } from "../src/realtime/handlers.js";
import { REVEAL_MS } from "../src/game/roundEngine.js";

const base = {
  type: "term" as const,
  subject: "Physics" as const,
  course: "secondary-physics",
  topic: "Zorbology",
  level: 2 as const,
  forbidden: ["alphaword", "betaword", "gammaword"],
  status: "reviewed" as const,
};
const CARD_A: Card = { ...base, id: "phy-0001", prompt: "Zorblaxium", answers: ["zorblaxium", "zbxm"], explanation: "Quuxplanation: the first unusual explanation." };
const CARD_B: Card = { ...base, id: "phy-0002", prompt: "Wibblefrop", answers: ["wibblefrop"], explanation: "Frobnication: the second unusual explanation." };

let url: string;
let app: ReturnType<typeof createApp>;
let now: number;
const sockets: Socket[] = [];

beforeEach(async () => {
  now = 1_000_000;
  app = createApp({ cards: [CARD_A, CARD_B], clock: () => now, rng: () => 0 });
  await new Promise<void>((r) => app.httpServer.listen(0, r));
  url = `http://localhost:${(app.httpServer.address() as AddressInfo).port}`;
});
afterEach(async () => {
  sockets.splice(0).forEach((s) => s.disconnect());
  await new Promise<void>((r) => void app.io.close(() => r()));
});

const client = () => {
  const s = connect(url, { transports: ["websocket"], forceNew: true });
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
const guess = async (s: Socket, text: string) => {
  const res = once<GuessResultPayload>(s, EVENTS.guessResult);
  s.emit(EVENTS.guess, { text });
  return res;
};
const tick = () => tickGames(app.io, app.rooms, app.runner);

describe("scoring over sockets", () => {
  it("plays a 3-round game to a correct scoreboard", async () => {
    const created = (await (await fetch(`${url}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname: "Host" }) })).json()) as CreateRoomResponse;
    const host = client();
    await join(host, { code: created.code, sessionToken: created.sessionToken });
    const ann = client();
    await join(ann, { code: created.code, nickname: "Ann" });
    const ben = client();
    await join(ben, { code: created.code, nickname: "Ben" });

    host.emit(EVENTS.configure, { levels: [], courses: ["secondary-physics"], topics: [], roundSeconds: 60, rounds: 3 });
    await new Promise((r) => setTimeout(r, 50));
    host.emit(EVENTS.start);
    await state(host, (v) => v.phase === "round");

    // ---- Round 1: Host explains card A. Ann and Ben both get it. ----
    const explainerErr = once<ErrorPayload>(host, EVENTS.error);
    host.emit(EVENTS.guess, { text: "zorblaxium" });
    expect((await explainerErr).code).toBe("out_of_turn");

    expect(await guess(ann, "banana")).toEqual({ result: "wrong", guess: "banana" });
    const close = await guess(ann, "zorblaxiun");
    expect(close.result).toBe("close");
    expect(JSON.stringify(close)).not.toMatch(/zorblaxium|zbxm/i); // the feedback never reveals the answer

    const hostSeesAnn = state(host, (v) => v.round?.guessedCorrect.length === 1);
    expect((await guess(ann, "ZORBLAXIUM")).result).toBe("correct"); // at elapsed 0s: 10 + 10
    const midRound = await hostSeesAnn;
    expect(midRound.players.find((p) => p.nickname === "Ann")?.score).toBe(20);
    expect(midRound.players.find((p) => p.nickname === "Host")?.score).toBe(5);
    expect(midRound.round?.guessedCorrect).toEqual([midRound.players.find((p) => p.nickname === "Ann")!.id]);

    now += 30_000; // halfway: speed bonus 5
    const revealed = state(ben, (v) => v.phase === "reveal");
    expect((await guess(ben, "zbxm")).result).toBe("correct"); // alias, 10 + 5
    const r1 = await revealed;
    expect(r1.reveal?.outcome).toBe("all_guessed");
    expect(Object.fromEntries(r1.reveal!.awards.map((a) => [r1.players.find((p) => p.id === a.playerId)!.nickname, a.points]))).toEqual({ Ann: 20, Ben: 15, Host: 10 });

    // ---- Round 2: Ann explains card B. Nobody guesses; the timer runs out. ----
    const round2 = state(ann, (v) => v.round?.number === 2 && v.phase === "round");
    now += REVEAL_MS;
    tick();
    expect((await round2).round?.explainerCard?.prompt).toBe("Wibblefrop");
    expect((await guess(host, "nothing close")).result).toBe("wrong");
    const r2 = state(host, (v) => v.phase === "reveal" && v.round?.number === 2);
    now += 60_000;
    tick();
    expect((await r2).reveal?.outcome).toBe("timeout");
    expect((await r2).reveal?.awards).toEqual([]);

    // ---- Round 3: Ben explains card A. Only Host gets it before time runs out. ----
    const round3 = state(ben, (v) => v.round?.number === 3 && v.phase === "round");
    now += REVEAL_MS;
    tick();
    expect((await round3).round?.explainerCard?.prompt).toBe("Zorblaxium");
    expect((await guess(host, "Zorblaxium")).result).toBe("correct"); // elapsed 0s: 20, Ben +5
    const r3 = state(ann, (v) => v.phase === "reveal" && v.round?.number === 3);
    now += 60_000;
    tick();
    expect((await r3).reveal?.outcome).toBe("timeout");

    // ---- Finished: scoreboard and missed cards ----
    const finished = state(host, (v) => v.phase === "finished");
    now += REVEAL_MS;
    tick();
    const end = await finished;
    const score = (n: string) => end.players.find((p) => p.nickname === n)!.score;
    expect(score("Host")).toBe(5 + 5 + 20); // explained r1 (two guessers), guessed r3
    expect(score("Ann")).toBe(20);
    expect(score("Ben")).toBe(15 + 5);
    expect(end.summary!.standings.map((s) => [s.rank, s.nickname, s.score])).toEqual([
      [1, "Host", 30],
      [2, expect.stringMatching(/^(Ann|Ben)$/), 20],
      [2, expect.stringMatching(/^(Ann|Ben)$/), 20], // a tie shares a rank
    ]);
    expect(end.summary!.missed.map((m) => m.prompt)).toEqual(["Wibblefrop"]); // round 2's card: nobody got it
    expect(end.summary!.missed[0]).toMatchObject({ answers: ["wibblefrop"], explanation: "Frobnication: the second unusual explanation." });

    // Play again resets everything.
    const again = state(host, (v) => v.phase === "round" && v.round?.number === 1);
    host.emit(EVENTS.start);
    const fresh = await again;
    expect(fresh.players.every((p) => p.score === 0)).toBe(true);
    expect(fresh.summary).toBeUndefined();
  });

  it("a guesser who already has it gets no second score, and a guess flood is capped", async () => {
    const created = (await (await fetch(`${url}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname: "Host" }) })).json()) as CreateRoomResponse;
    const host = client();
    await join(host, { code: created.code, sessionToken: created.sessionToken });
    const ann = client();
    await join(ann, { code: created.code, nickname: "Ann" });
    const ben = client();
    await join(ben, { code: created.code, nickname: "Ben" });
    host.emit(EVENTS.start);
    await state(host, (v) => v.phase === "round");

    expect((await guess(ann, "zorblaxium")).result).toBe("correct");
    const err = once<ErrorPayload>(ann, EVENTS.error);
    ann.emit(EVENTS.guess, { text: "zorblaxium" });
    expect((await err).code).toBe("out_of_turn");
    const view = app.rooms.view(app.rooms.get(created.code)!);
    expect(view.players.find((p) => p.nickname === "Ann")?.score).toBe(20); // scored once, not twice

    const bad = once<ErrorPayload>(ben, EVENTS.error);
    ben.emit(EVENTS.guess, { text: "" });
    expect((await bad).code).toBe("invalid_payload");
    const bad2 = once<ErrorPayload>(ben, EVENTS.error);
    ben.emit(EVENTS.guess, { text: "x".repeat(500) });
    expect((await bad2).code).toBe("invalid_payload");
  });
});
