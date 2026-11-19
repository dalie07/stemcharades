import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import {
  EVENTS,
  type Card,
  type ClueRejection,
  type CreateRoomResponse,
  type ErrorPayload,
  type JoinAck,
  type RoomView,
} from "@stemcharades/shared";
import { createApp } from "../src/app.js";
import { tickGames } from "../src/realtime/handlers.js";
import { REVEAL_MS } from "../src/game/roundEngine.js";

// Distinctive strings so a leak is unmistakable in raw traffic.
const SECRET_CARD: Card = {
  id: "phy-0001",
  type: "term",
  subject: "Physics",
  course: "secondary-physics",
  topic: "Zorbology",
  level: 2,
  prompt: "Zorblaxium",
  answers: ["zorblaxium", "zbxm"],
  forbidden: ["alphaword", "betaword", "gammaword"],
  explanation: "Quuxplanation: a deliberately unusual explanation sentence.",
  status: "reviewed",
};
const OTHER_CARD: Card = { ...SECRET_CARD, id: "phy-0002", prompt: "Wibblefrop", answers: ["wibblefrop"], explanation: "Another long enough explanation here." };

let url: string;
let app: ReturnType<typeof createApp>;
let now: number;
const sockets: Socket[] = [];
/** Every raw message each socket received, as JSON, tagged by socket label. */
const traffic = new Map<string, string[]>();

beforeEach(async () => {
  now = 1_000_000;
  traffic.clear();
  app = createApp({ cards: [SECRET_CARD], clock: () => now, rng: () => 0 });
  await new Promise<void>((r) => app.httpServer.listen(0, r));
  url = `http://localhost:${(app.httpServer.address() as AddressInfo).port}`;
});
afterEach(async () => {
  sockets.splice(0).forEach((s) => s.disconnect());
  await new Promise<void>((r) => void app.io.close(() => r()));
});

function client(label: string): Socket {
  const s = connect(url, { transports: ["websocket"], forceNew: true });
  traffic.set(label, []);
  s.onAny((event: string, ...args: unknown[]) => traffic.get(label)!.push(JSON.stringify({ event, args })));
  sockets.push(s);
  return s;
}
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

async function lobby(names = ["Host", "Ann", "Ben"]) {
  const created = (await (await fetch(`${url}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname: names[0] }) })).json()) as CreateRoomResponse;
  const host = client(names[0]!);
  await join(host, { code: created.code, sessionToken: created.sessionToken });
  const guests: Socket[] = [];
  for (const n of names.slice(1)) {
    const s = client(n);
    await join(s, { code: created.code, nickname: n });
    guests.push(s);
  }
  return { code: created.code, host, guests, hostToken: created.sessionToken };
}

describe("a full round across devices", () => {
  it("runs start -> clues -> reveal, and no guesser ever receives the answer", async () => {
    const { host, guests } = await lobby();
    const [ann, ben] = guests as [Socket, Socket];

    const hostRound = state(host, (v) => v.phase === "round");
    const annRound = state(ann, (v) => v.phase === "round");
    const benRound = state(ben, (v) => v.phase === "round");
    host.emit(EVENTS.start);
    const [h, a, b] = await Promise.all([hostRound, annRound, benRound]);

    // Host is first in rotation, so Host explains.
    expect(h.round?.explainerId).toBe(h.hostId);
    expect(h.round?.explainerCard).toMatchObject({ prompt: "Zorblaxium", forbidden: ["alphaword", "betaword", "gammaword"], topic: "Zorbology" });
    expect(a.round?.explainerCard).toBeUndefined();
    expect(b.round?.explainerCard).toBeUndefined();
    expect(a.round?.card).toEqual({ type: "term", subject: "Physics" });
    expect(a.round?.endsAt).toBe(now + 60_000);

    // The explainer's clue reaches everyone; a leaking clue reaches no one but its author.
    const rejected = once<ClueRejection>(host, EVENTS.clueRejected);
    host.emit(EVENTS.clue, { text: "It is ZORBLAXIUMS" });
    expect(await rejected).toEqual({ reason: "contains_answer", word: "Zorblaxium" });
    host.emit(EVENTS.clue, { text: "think of an Alphaword" });
    expect((await once<ClueRejection>(host, EVENTS.clueRejected)).reason).toBe("forbidden_word");

    const annClue = state(ann, (v) => (v.round?.clues.length ?? 0) === 1);
    host.emit(EVENTS.clue, { text: "a made-up unit of wobble" });
    expect((await annClue).round?.clues).toEqual([{ id: 1, text: "a made-up unit of wobble" }]);

    // A guesser cannot clue or skip.
    const err = once<ErrorPayload>(ann, EVENTS.error);
    ann.emit(EVENTS.clue, { text: "cheating" });
    expect((await err).code).toBe("out_of_turn");
    ann.emit(EVENTS.skip);
    expect((await once<ErrorPayload>(ann, EVENTS.error)).code).toBe("out_of_turn");

    // ---- Nothing a guesser received so far may contain the card ----
    const forbidden = ["Zorblaxium", "zorblaxium", "zbxm", "Quuxplanation", "alphaword", "Alphaword", "betaword", "gammaword", "Zorbology"];
    for (const label of ["Ann", "Ben"]) {
      const raw = traffic.get(label)!.join("\n");
      for (const secret of forbidden) expect(raw, `${label}'s traffic leaked "${secret}"`).not.toContain(secret);
    }
    // ...and the explainer never got the answers or explanation early either.
    const hostRaw = traffic.get("Host")!.join("\n");
    expect(hostRaw).not.toContain("zbxm");
    expect(hostRaw).not.toContain("Quuxplanation");
    expect(hostRaw).toContain("Zorblaxium"); // the explainer does see the prompt

    // Timer: nothing happens early, then the server ends the round by itself.
    now += 59_000;
    expect(tickGames(app.io, app.rooms, app.runner)).toEqual([]);
    const annReveal = state(ann, (v) => v.phase === "reveal");
    const benReveal = state(ben, (v) => v.phase === "reveal");
    now += 1_000;
    expect(tickGames(app.io, app.rooms, app.runner)).toHaveLength(1);
    const reveal = await annReveal;
    await benReveal;
    expect(reveal.reveal).toMatchObject({ outcome: "timeout", prompt: "Zorblaxium", answers: ["zorblaxium", "zbxm"] });
    expect(reveal.reveal?.explanation).toContain("Quuxplanation");
    // The reveal is sent to everyone, and only now.
    const benRaw = traffic.get("Ben")!.join("\n");
    expect(benRaw).toContain("Quuxplanation");

    // After the pause the next round starts with the next explainer.
    const next = state(ben, (v) => v.phase === "round" && v.round?.number === 2);
    now += REVEAL_MS;
    tickGames(app.io, app.rooms, app.runner);
    const second = await next;
    expect(second.round?.explainerId).toBe(second.players[1]!.id);
    expect(second.round?.explainerCard).toBeUndefined(); // Ben isn't the explainer, Ann is
    expect(second.round?.clues).toEqual([]);
  });

  it("starts only for the host, with enough players and cards", async () => {
    const { host, guests } = await lobby(["Host", "Ann"]);
    const err = once<ErrorPayload>(guests[0]!, EVENTS.error);
    guests[0]!.emit(EVENTS.start);
    expect((await err).code).toBe("not_host");

    const solo = await lobby(["Solo"]);
    const e2 = once<ErrorPayload>(solo.host, EVENTS.error);
    solo.host.emit(EVENTS.start);
    expect((await e2).code).toBe("not_enough_players");

    const e3 = once<ErrorPayload>(host, EVENTS.error);
    host.emit(EVENTS.configure, { levels: [], courses: ["secondary-maths"], topics: [], roundSeconds: 60, rounds: 2 });
    await new Promise((r) => setTimeout(r, 50));
    host.emit(EVENTS.start);
    expect((await e3).code).toBe("no_cards");
  });

  it("the explainer can skip, and a refresh mid-round restores the same role and clues", async () => {
    const { code, host, hostToken } = await lobby();
    host.emit(EVENTS.start);
    await state(host, (v) => v.phase === "round");
    host.emit(EVENTS.clue, { text: "first clue" });
    await state(host, (v) => (v.round?.clues.length ?? 0) === 1);

    // "Refresh" the explainer: new socket, same token.
    host.disconnect();
    const fresh = client("Host2");
    const back = state(fresh, (v) => v.phase === "round");
    await join(fresh, { code, sessionToken: hostToken });
    const view = await back;
    expect(view.round?.explainerId).toBe(view.hostId);
    expect(view.round?.explainerCard?.prompt).toBe("Zorblaxium");
    expect(view.round?.clues.map((c) => c.text)).toEqual(["first clue"]);

    const revealed = state(fresh, (v) => v.phase === "reveal");
    fresh.emit(EVENTS.skip);
    expect((await revealed).reveal?.outcome).toBe("skipped");
  });

  it("a guesser who joins mid-round or refreshes still gets only the guesser view", async () => {
    const { code, host } = await lobby(["Host", "Ann"]);
    host.emit(EVENTS.start);
    await state(host, (v) => v.phase === "round");
    const late = client("Late");
    const v = state(late, (x) => x.phase === "round");
    await join(late, { code, nickname: "Late" });
    expect((await v).round?.explainerCard).toBeUndefined();
    expect(traffic.get("Late")!.join("\n")).not.toContain("Zorblaxium");
  });

  it("finishes after the configured rounds and the host can play again", async () => {
    const solo = createApp({ cards: [SECRET_CARD, OTHER_CARD], clock: () => now, rng: () => 0 });
    await new Promise<void>((r) => solo.httpServer.listen(0, r));
    const u = `http://localhost:${(solo.httpServer.address() as AddressInfo).port}`;
    const mk = async (nick: string, code?: string) => {
      const s = connect(u, { transports: ["websocket"], forceNew: true });
      sockets.push(s);
      if (!code) {
        const r = (await (await fetch(`${u}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname: nick }) })).json()) as CreateRoomResponse;
        await join(s, { code: r.code, sessionToken: r.sessionToken });
        return { s, code: r.code };
      }
      await join(s, { code, nickname: nick });
      return { s, code };
    };
    const h = await mk("Host");
    await mk("Ann", h.code);
    h.s.emit(EVENTS.configure, { levels: [], courses: ["secondary-physics"], topics: [], roundSeconds: 60, rounds: 2 });
    await new Promise((r) => setTimeout(r, 50));
    h.s.emit(EVENTS.start);
    await state(h.s, (v) => v.phase === "round");
    now += 60_000;
    tickGames(solo.io, solo.rooms, solo.runner);
    now += REVEAL_MS;
    tickGames(solo.io, solo.rooms, solo.runner);
    const r2 = await state(h.s, (v) => v.round?.number === 2);
    expect(r2.round?.totalRounds).toBe(2);
    now += 60_000;
    tickGames(solo.io, solo.rooms, solo.runner);
    now += REVEAL_MS;
    const done = state(h.s, (v) => v.phase === "finished");
    tickGames(solo.io, solo.rooms, solo.runner);
    expect((await done).phase).toBe("finished");
    const again = state(h.s, (v) => v.phase === "round" && v.round?.number === 1);
    h.s.emit(EVENTS.start);
    await again;
    await new Promise<void>((r) => void solo.io.close(() => r()));
  });
});
