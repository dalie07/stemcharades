import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { EVENTS, type Card } from "@stemcharades/shared";
import { createApp } from "../src/app.js";

const testCard: Card = {
  id: "phy-0001",
  type: "term",
  subject: "Physics",
  topic: "Mechanics",
  level: 1,
  prompt: "Velocity",
  answers: ["velocity"],
  forbidden: ["speed", "direction", "metres", "time"],
  explanation: "Velocity is the rate of change of displacement with time.",
  status: "reviewed",
};

let close: () => Promise<void>;
let url: string;
let client: Socket | undefined;

beforeEach(async () => {
  const { httpServer, io } = createApp({ cards: [testCard] });
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
  close = () =>
    new Promise<void>((resolve) => {
      void io.close(() => resolve());
    });
});

afterEach(async () => {
  client?.disconnect();
  await close();
});

describe("server", () => {
  it("answers /healthz", async () => {
    const res = await fetch(`${url}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("lists deck counts and cards by subject", async () => {
    const decks = (await (await fetch(`${url}/api/decks`)).json()) as { subject: string; count: number }[];
    expect(decks.find((d) => d.subject === "Physics")?.count).toBe(1);
    const cards = (await (await fetch(`${url}/api/decks/physics/cards`)).json()) as Card[];
    expect(cards).toHaveLength(1);
    expect((await fetch(`${url}/api/decks/nope/cards`)).status).toBe(404);
  });

  it("echoes a ping over Socket.IO", async () => {
    client = connect(url, { transports: ["websocket"] });
    const reply = await new Promise<{ message: string; serverTime: number }>((resolve) => {
      client!.on(EVENTS.pong, resolve);
      client!.on("connect", () => client!.emit(EVENTS.ping, { message: "hello" }));
    });
    expect(reply.message).toBe("hello");
    expect(typeof reply.serverTime).toBe("number");
  });
});
