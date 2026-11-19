import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { EVENTS, type Card, type CreateRoomResponse, type ErrorPayload, type JoinAck, type RoomView } from "@stemcharades/shared";
import { createApp, type App } from "../src/app.js";
import type { CardWriter } from "../src/ai/aiService.js";
import type { Catalog } from "../src/http/decks.js";

const LIBRARY: Card = {
  id: "phy-0001",
  type: "term",
  subject: "Physics",
  course: "secondary-physics",
  topic: "Waves",
  level: 2,
  prompt: "Frequency",
  answers: ["frequency"],
  forbidden: ["hertz", "waves", "second"],
  explanation: "The number of waves passing a point each second, measured in hertz.",
  status: "reviewed",
};

/** Writes primary maths cards about shapes, as many as asked. */
const shapes: CardWriter = async (req) =>
  ["Triangle", "Square", "Circle", "Pentagon", "Hexagon", "Rectangle"].slice(0, req.count).map((prompt) => ({
    type: "term",
    subject: "Maths",
    prompt,
    latex: "",
    answers: [prompt.toLowerCase()],
    forbidden: ["sides", "corners", "shape"],
    explanation: `A ${prompt.toLowerCase()} is a flat shape. Children learn to spot it by counting its sides and corners.`,
  }));

let app: App;
let url: string;
const sockets: Socket[] = [];

async function start(withAi: boolean) {
  app = createApp({ cards: [LIBRARY], rng: () => 0, ...(withAi ? { ai: { writer: shapes } } : {}) });
  await new Promise<void>((r) => app.httpServer.listen(0, r));
  url = `http://localhost:${(app.httpServer.address() as AddressInfo).port}`;
}
afterEach(async () => {
  sockets.splice(0).forEach((s) => s.disconnect());
  await new Promise<void>((r) => void app.io.close(() => r()));
});

const post = (path: string, body: unknown) =>
  fetch(`${url}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const client = () => {
  const s = connect(url, { transports: ["websocket"], forceNew: true });
  sockets.push(s);
  return s;
};
const join = (s: Socket, payload: object) => new Promise<JoinAck>((resolve) => s.emit(EVENTS.join, payload, resolve));
const next = <T>(s: Socket, ev: string, pred: (v: T) => boolean = () => true) =>
  new Promise<T>((resolve) => {
    const h = (v: T) => {
      if (pred(v)) {
        s.off(ev, h);
        resolve(v);
      }
    };
    s.on(ev, h);
  });

/** A host and a guest in a lobby, with the given courses chosen. */
async function lobby(courses: string[]) {
  const created = (await (await post("/api/rooms", { nickname: "Host" })).json()) as CreateRoomResponse;
  const host = client();
  await join(host, { code: created.code, sessionToken: created.sessionToken });
  const guest = client();
  await join(guest, { code: created.code, nickname: "Ann" });
  const configured = next<RoomView>(host, EVENTS.state, (v) => v.settings.courses.join() === courses.join());
  host.emit(EVENTS.configure, { levels: [], courses, topics: [], roundSeconds: 60, rounds: 1 });
  await configured;
  return { host, guest };
}

describe("with the AI writing cards", () => {
  it("reports itself in the catalog, with counts per level, course and topic", async () => {
    await start(true);
    const catalog = (await (await fetch(`${url}/api/catalog`)).json()) as Catalog;
    expect(catalog).toEqual({
      ai: true,
      levels: { 2: 1 },
      courses: { "secondary-physics": 1 },
      topics: { "secondary-physics/Waves": 1 },
    });
  });

  it("says cards are being written when a choice has none yet, then plays the AI's cards", async () => {
    await start(true);
    const { host, guest } = await lobby(["primary-maths"]); // choosing it already queued the writing
    const error = next<ErrorPayload>(host, EVENTS.error);
    host.emit(EVENTS.start);
    expect((await error).code).toBe("cards_preparing");

    await app.ai!.pump();
    const decks = (await (await fetch(`${url}/api/decks/maths/cards`)).json()) as Card[];
    expect(decks.length).toBe(6);
    expect(decks.every((c) => c.status === "generated" && c.course === "primary-maths")).toBe(true);

    const explaining = next<RoomView>(host, EVENTS.state, (v) => v.phase === "round");
    const guessing = next<RoomView>(guest, EVENTS.state, (v) => v.phase === "round");
    host.emit(EVENTS.start);
    const h = await explaining;
    const g = await guessing;
    expect(h.round?.explainerCard).toMatchObject({ generated: true, level: 1 });
    expect(g.round?.explainerCard).toBeUndefined();
    expect(g.round?.card).toEqual({ type: "term", subject: "Maths" }); // a guesser learns nothing more

    const revealed = next<RoomView>(guest, EVENTS.state, (v) => v.phase === "reveal");
    host.emit(EVENTS.skip);
    expect((await revealed).reveal).toMatchObject({ generated: true });
  });

  it("starts writing as soon as someone picks a choice, and validates what it is sent", async () => {
    await start(true);
    expect((await post("/api/ai/warm", { levels: [9] })).status).toBe(400);
    expect((await post("/api/ai/warm", { levels: [], courses: ["nope"], topics: [] })).status).toBe(400);
    const res = await post("/api/ai/warm", { levels: [1], courses: [], topics: ["primary-maths/Shapes"] });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ writing: true });
  });

  it("takes reports on AI cards only, counting each person once", async () => {
    await start(true);
    app.ai!.warm({ levels: [], courses: [], topics: ["primary-maths/Shapes"] });
    await app.ai!.pump();
    const [card] = app.bank.all().filter((c) => c.status === "generated");
    expect((await post(`/api/cards/phy-0001/flag`, {})).status).toBe(404);
    expect((await post(`/api/cards/ai-000000000000/flag`, {})).status).toBe(404);
    expect(await (await post(`/api/cards/${card!.id}/flag`, {})).json()).toEqual({ retired: false });
    expect(await (await post(`/api/cards/${card!.id}/flag`, {})).json()).toEqual({ retired: false });
  });
});

describe("without the AI", () => {
  it("says so, never claims cards are coming, and plays the library exactly as before", async () => {
    await start(false);
    expect(((await (await fetch(`${url}/api/catalog`)).json()) as Catalog).ai).toBe(false);
    expect(await (await post("/api/ai/warm", { levels: [], courses: [], topics: [] })).json()).toEqual({ writing: false });

    const { host } = await lobby(["primary-maths"]);
    const error = next<ErrorPayload>(host, EVENTS.error);
    host.emit(EVENTS.start);
    expect((await error).code).toBe("no_cards");
  });
});
