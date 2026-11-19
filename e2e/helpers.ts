import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SUBJECTS = ["maths", "physics", "chemistry", "biology", "computing"];

export interface DeckCard {
  id: string;
  prompt: string;
  subject: string;
  type: string;
  answers: string[];
  forbidden: string[];
  explanation: string;
}

export async function allCards(request: APIRequestContext, base = ""): Promise<DeckCard[]> {
  const parts = await Promise.all(SUBJECTS.map(async (s) => (await request.get(`${base}/api/decks/${s}/cards`)).json() as Promise<DeckCard[]>));
  return parts.flat();
}

/** A player in its own browser context, so sessionStorage, cookies and sockets are separate. */
export interface Player {
  name: string;
  context: BrowserContext;
  page: Page;
  /** Every raw Socket.IO frame this browser received. */
  frames: string[];
  /** Console errors and uncaught exceptions, including Content-Security-Policy violations. */
  problems: string[];
}

export async function newPlayer(browser: Browser, name: string, origin = ""): Promise<Player> {
  const context = await browser.newContext(origin ? { baseURL: origin } : {});
  const page = await context.newPage();
  const frames: string[] = [];
  const problems: string[] = [];
  page.on("websocket", (ws) => ws.on("framereceived", (f) => frames.push(String(f.payload))));
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  return { name, context, page, frames, problems };
}

/** A freshly booted server on a busy machine can take a while to answer its first requests. */
const JOIN_TIMEOUT = { timeout: 30_000 };

export async function createRoom(p: Player, base = ""): Promise<string> {
  await p.page.goto(`${base}/#/online`);
  await p.page.getByLabel("Your nickname").fill(p.name);
  await p.page.getByRole("button", { name: "Create a room" }).click();
  const heading = p.page.getByRole("heading", { name: /^Room code/ });
  await expect(heading).toBeVisible(JOIN_TIMEOUT);
  return ((await heading.textContent()) ?? "").trim();
}

export async function joinRoom(p: Player, code: string, base = ""): Promise<void> {
  await p.page.goto(`${base}/#/online`);
  await p.page.getByLabel("Your nickname").fill(p.name);
  await p.page.getByLabel("Room code").fill(code);
  await p.page.getByRole("button", { name: "Join room" }).click();
  await expect(p.page.getByRole("heading", { name: /^Room code/ })).toBeVisible(JOIN_TIMEOUT);
}

export async function roster(p: Player): Promise<string[]> {
  const items = p.page.getByRole("list").first().getByRole("listitem");
  return (await items.allInnerTexts()).map((t) => t.replace(/[●\n]/g, " ").replace(/\s+/g, " ").replace(/ ?Remove.*$/, "").trim());
}

/** Spawn a private server so a test can stop and restart it. */
export interface TestServer {
  url: string;
  stop: () => Promise<void>;
}
export async function startServer(port: number): Promise<TestServer> {
  // A leftover server on this port would silently answer for the new one and hide a failed restart.
  if (await fetch(`http://localhost:${port}/healthz`).then((r) => r.ok, () => false)) {
    throw new Error(`port ${port} is already in use; stop the other server first`);
  }
  // One process (not the tsx wrapper): killing a wrapper can leave the real server running.
  const child: ChildProcess = spawn(process.execPath, ["--import", "tsx", "server/src/index.ts"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), NODE_ENV: "production", ALLOW_DRAFT_CARDS: "1" },
    stdio: "ignore",
  });
  const url = `http://localhost:${port}`;
  // A busy or small machine can take a minute or more to boot. Wait for it, and fail loudly rather than carry on
  // with a server that never came up.
  let up = false;
  for (let i = 0; i < 480 && !up; i++) {
    try {
      up = (await fetch(`${url}/healthz`)).ok;
    } catch {
      /* not up yet */
    }
    if (!up) await new Promise((r) => setTimeout(r, 250));
  }
  if (!up) {
    child.kill("SIGKILL");
    throw new Error(`test server on port ${port} did not become healthy within 2 minutes`);
  }
  return {
    url,
    stop: () =>
      new Promise((resolve) => {
        // A process killed by a signal has exitCode null but signalCode set; both mean "already gone".
        if (child.exitCode !== null || child.signalCode !== null) return resolve();
        child.once("exit", () => resolve());
        child.kill("SIGKILL");
      }),
  };
}
