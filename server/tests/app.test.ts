import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { io as connect } from "socket.io-client";
import type { Card } from "@stemcharades/shared";
import { createApp, type App, type AppOptions } from "../src/app.js";

const card = (id: string, subject: Card["subject"], level: Card["level"]): Card => ({
  id,
  type: "term",
  subject,
  course: "secondary-physics",
  topic: "Mechanics",
  level,
  prompt: `Prompt ${id}`,
  answers: [`answer ${id}`],
  forbidden: ["speed", "direction", "metres"],
  explanation: "An explanation that is long enough.",
  status: "reviewed",
});
const CARDS = [card("phy-0001", "Physics", 1), card("phy-0002", "Physics", 3), card("mat-0001", "Maths", 2)];

let app: App | undefined;
let clientDir: string | undefined;

async function start(options: AppOptions = {}): Promise<string> {
  app = createApp({ cards: CARDS, ...options });
  await new Promise<void>((resolve) => app!.httpServer.listen(0, resolve));
  return `http://localhost:${(app.httpServer.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await new Promise<void>((resolve) => void app?.io.close(() => resolve()));
  if (clientDir) rmSync(clientDir, { recursive: true, force: true });
  app = clientDir = undefined;
});

describe("http", () => {
  it("answers the health check", async () => {
    const res = await fetch(`${await start()}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("summarises the decks by subject and level", async () => {
    const decks = (await (await fetch(`${await start()}/api/decks`)).json()) as {
      subject: string;
      count: number;
      levels: { level: number; count: number }[];
    }[];
    expect(decks.map((d) => d.subject)).toEqual(["Maths", "Physics", "Chemistry", "Biology", "Computing"]);
    expect(decks.find((d) => d.subject === "Physics")).toEqual({
      subject: "Physics",
      count: 2,
      levels: [
        { level: 1, count: 1 },
        { level: 2, count: 0 },
        { level: 3, count: 1 },
        { level: 4, count: 0 },
      ],
    });
    expect(decks.find((d) => d.subject === "Biology")?.count).toBe(0);
  });

  it("counts the cards per level, course and topic for the picker", async () => {
    const catalog = await (await fetch(`${await start()}/api/catalog`)).json();
    expect(catalog).toEqual({
      levels: { 1: 1, 2: 1, 3: 1 },
      courses: { "secondary-physics": 3 },
      topics: { "secondary-physics/Mechanics": 3 },
    });
  });

  it("returns one subject's cards, whatever the capitalisation, and 404 for an unknown subject", async () => {
    const url = await start();
    const cards = (await (await fetch(`${url}/api/decks/PHYSICS/cards`)).json()) as Card[];
    expect(cards.map((c) => c.id)).toEqual(["phy-0001", "phy-0002"]);
    const missing = await fetch(`${url}/api/decks/alchemy/cards`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "unknown_subject" });
  });

  it("serves the built client, and the app shell for any other path", async () => {
    clientDir = mkdtempSync(path.join(tmpdir(), "client-"));
    writeFileSync(path.join(clientDir, "index.html"), "<!doctype html><title>shell</title>");
    writeFileSync(path.join(clientDir, "asset.txt"), "static file");
    const url = await start({ clientDir });
    expect(await (await fetch(`${url}/asset.txt`)).text()).toBe("static file");
    expect(await (await fetch(`${url}/some/deep/link`)).text()).toContain("<title>shell</title>");
    expect((await fetch(`${url}/healthz`)).headers.get("content-type")).toContain("application/json");
  });

  it("works without a built client (API and sockets only)", async () => {
    const url = await start({ clientDir: "/definitely/not/here" });
    expect((await fetch(`${url}/`)).status).toBe(404);
    expect((await fetch(`${url}/healthz`)).status).toBe(200);
  });
});

describe("sockets", () => {
  it("accept a connection on the same server", async () => {
    const socket = connect(await start(), { transports: ["websocket"] });
    await new Promise<void>((resolve) => socket.on("connect", () => resolve()));
    expect(socket.connected).toBe(true);
    socket.disconnect();
  });
});
