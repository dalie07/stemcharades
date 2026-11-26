import { expect, test } from "@playwright/test";
import { createRoom, joinRoom, newPlayer, startServer } from "./helpers";

test("when the server restarts mid-game, clients say so clearly and return to the home screen", async ({ browser }) => {
  test.setTimeout(240_000); // boots two servers; slow machines need the room
  const port = 3153;
  let server = await startServer(port);
  const base = server.url;
  try {
    const host = await newPlayer(browser, "Host", base);
    const ann = await newPlayer(browser, "Ann", base);
    const code = await createRoom(host, base);
    await joinRoom(ann, code, base);
    await host.page.getByRole("button", { name: "Start game" }).click();
    await expect(host.page.getByText("You're explaining")).toBeVisible();

    await server.stop(); // the free Render instance restarted: every room is wiped
    server = await startServer(port);

    for (const p of [host, ann]) {
      await expect(p.page.getByRole("heading", { name: "STEMCHARADES" })).toBeVisible({ timeout: 45_000 });
      await expect(p.page.getByRole("status").filter({ hasText: "server restarted" })).toBeVisible();
    }
    // And they can simply start again.
    const fresh = await createRoom(host, base);
    expect(fresh).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
  } finally {
    await server.stop();
  }
});

test("Party mode plays a whole turn with the server switched off", async ({ browser }) => {
  test.setTimeout(180_000);
  const port = 3154;
  const server = await startServer(port);
  const base = server.url;
  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    // Downloading every deck through a newly installed service worker can be slow on a small machine.
    const ready = { timeout: 45_000 };
    // Players, what to play (Everything), length, then the Ready screen with its Start button.
    const toReady = async () => {
      for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next", exact: true }).click(i === 0 ? ready : undefined);
      await expect(page.getByRole("button", { name: "Start game" })).toBeEnabled(ready);
    };
    await page.goto("/#/party");
    await toReady();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload(); // now controlled by the service worker, so this load is what fills the cache
    await toReady();

    await server.stop();
    await page.reload();
    await toReady();
    await expect(page.getByText(/\d+ matching cards/)).toBeVisible();
    await page.getByRole("button", { name: "Start game" }).click();
    await page.getByRole("button", { name: "I'm ready – start" }).click();
    const first = await page.locator("article h2").textContent();
    await page.getByRole("button", { name: "Got it" }).click();
    await expect(page.getByText("Got: 1")).toBeVisible();
    expect(await page.locator("article h2").textContent()).not.toBe(first);
    await page.getByRole("button", { name: "Skip" }).click();
  } finally {
    await context.close();
    await server.stop();
  }
});

test("a sleeping server shows a wake screen with progress, then the app", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  // The instance is asleep: every health check hangs until the test says it has finished booting. (A fixed delay
  // would race the page load on a slow machine, and the server could be "awake" before the page even asked.)
  let wake!: () => void;
  const awake = new Promise<void>((resolve) => (wake = resolve));
  await page.route("**/healthz", async (route) => {
    await awake;
    await route.continue().catch(() => undefined); // the page may have given up on this request already
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Waking the server…" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("progressbar", { name: "Waking the server" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Play Party mode meanwhile" })).toBeVisible();
  wake();
  await expect(page.getByRole("heading", { name: "STEMCHARADES" })).toBeVisible({ timeout: 30_000 });
  await context.close();
});
