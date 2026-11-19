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
    await page.goto("/#/party");
    await expect(page.getByRole("button", { name: "Start game" })).toBeEnabled(ready);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload(); // now controlled by the service worker, so this load is what fills the cache
    await expect(page.getByRole("button", { name: "Start game" })).toBeEnabled(ready);

    await server.stop();
    await page.reload();
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
  // The instance is asleep: every health check hangs until it has finished booting, 6 seconds from now.
  const awakeAt = Date.now() + 6000;
  await page.route("**/healthz", async (route) => {
    const wait = awakeAt - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    await route.continue().catch(() => undefined); // the page may have given up on this request already
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Waking the server…" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Waking the server" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Play Party mode meanwhile" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "STEMCHARADES" })).toBeVisible({ timeout: 30_000 });
  await context.close();
});
