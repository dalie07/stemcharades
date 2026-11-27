import { expect, test, type Page } from "@playwright/test";
import { createRoom, joinRoom, newPlayer } from "./helpers";

const tile = (page: Page, name: RegExp) => page.getByRole("button", { name });
const next = (page: Page) => page.getByRole("button", { name: "Next", exact: true }).click();

test("Party mode narrows step by step to one topic, plays it, and the choice travels in a link", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/#/party");

  await expect(page.getByRole("heading", { name: "Who's playing?" })).toBeVisible();
  await next(page);
  await expect(page.getByRole("radio", { name: /^Everything/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: /^Let me choose/ }).click();
  await next(page);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled(); // a level is needed first
  await tile(page, /^Secondary/).click();
  await next(page);
  await tile(page, /^Physics/).click();
  await next(page);
  await tile(page, /^Waves/).click();
  await next(page);
  await expect(page.getByRole("heading", { name: "How long?" })).toBeVisible();
  await next(page);

  await expect(page.getByText("Secondary · Physics · Waves")).toBeVisible();
  await expect(page.getByText(/\d+ matching cards/)).toBeVisible();
  expect(decodeURIComponent(page.url())).toContain("#/party?levels=2&courses=secondary-physics&topics=secondary-physics/Waves");

  // Someone opening the link starts with the same choice already made.
  const friend = await context.newPage();
  await friend.goto(page.url());
  await next(friend);
  await expect(friend.getByRole("radio", { name: /^Let me choose/ })).toHaveAttribute("aria-checked", "true");
  await next(friend);
  await expect(tile(friend, /^Secondary/)).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Start game" }).click();
  await page.getByRole("button", { name: "I'm ready – start" }).click();
  await expect(page.locator("article p").first()).toContainText("Secondary Physics · Waves");
  await context.close();
});

test("in an online room the host chooses step by step, and every player sees the choice", async ({ browser }) => {
  const host = await newPlayer(browser, "Host");
  const ann = await newPlayer(browser, "Ann");
  const code = await createRoom(host);
  await joinRoom(ann, code);
  await expect(host.page.getByRole("img", { name: `QR code to join room ${code}` })).toBeVisible();
  await expect(ann.page.getByRole("button", { name: "Change what to play" })).toHaveCount(0); // only the host

  await host.page.getByRole("button", { name: "Change what to play" }).click();
  await host.page.getByRole("radio", { name: /^Let me choose/ }).click();
  await next(host.page);
  await tile(host.page, /^University/).click();
  await next(host.page);
  await tile(host.page, /^Calculus/).click();
  await next(host.page);
  await next(host.page); // all topics
  await host.page.getByRole("button", { name: "Done" }).click();

  await expect(ann.page.getByText("University · Calculus")).toBeVisible();
  await host.page.getByRole("button", { name: "Start game" }).click();
  await expect(host.page.getByText("You're explaining")).toBeVisible();
  await expect(host.page.locator("article p").first()).toContainText("University Maths · ");
  for (const p of [host, ann]) expect(p.problems, `${p.name} console/CSP problems`).toEqual([]);
});

test("an invite link fills in the room code", async ({ page }) => {
  await page.goto("/#/online?join=ABCDE");
  await expect(page.getByLabel("Room code")).toHaveValue("ABCDE");
});

test("joining says what is missing instead of doing nothing, and forgives spaces and lowercase", async ({ browser }) => {
  const host = await newPlayer(browser, "Host");
  const code = await createRoom(host);
  const ann = await newPlayer(browser, "Ann");
  const page = ann.page;
  await page.goto("/#/online");
  await page.getByRole("button", { name: /^Join a room/ }).click();

  // The code typed first, as on a second phone, with no nickname yet: the button explains instead of staying grey.
  await page.getByLabel("Room code").fill(` ${code.slice(0, 2).toLowerCase()} ${code.slice(2).toLowerCase()} `);
  await expect(page.getByLabel("Room code")).toHaveValue(code);
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page.getByRole("alert")).toContainText("Enter your nickname first");
  await expect(page.getByLabel("Your nickname")).toBeFocused();

  // A look-alike character gets a specific hint.
  await page.getByLabel("Room code").fill("ABC0E");
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page.getByRole("alert")).toContainText("never use O, 0, I or 1");

  await page.getByLabel("Room code").fill(code);
  await page.getByLabel("Your nickname").fill("Ann");
  await page.getByRole("button", { name: "Join room" }).click();
  await expect(page.getByRole("heading", { name: /^Room code/ })).toBeVisible({ timeout: 30_000 });
});
