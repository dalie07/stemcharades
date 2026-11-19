import { expect, test } from "@playwright/test";
import { createRoom, joinRoom, newPlayer } from "./helpers";

const chip = (page: import("@playwright/test").Page, name: RegExp) => page.getByRole("button", { name });

test("Party mode narrows from General to one topic, plays it, and the choice travels in a link", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/#/party");
  await expect(chip(page, /^General · everything$/)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Start game" })).toBeEnabled();

  await chip(page, /^Secondary, \d+ cards$/).click();
  await chip(page, /^Physics, \d+ cards$/).click();
  await chip(page, /^Waves, \d+ cards$/).click();
  await expect(page.getByText(/^Secondary · Physics · Waves · \d+ cards/)).toBeVisible();
  expect(decodeURIComponent(page.url())).toContain("#/party?levels=2&courses=secondary-physics&topics=secondary-physics/Waves");

  // Someone else opening the link lands on the same choice.
  const friend = await context.newPage();
  await friend.goto(page.url());
  await expect(chip(friend, /^Waves, \d+ cards$/)).toHaveAttribute("aria-pressed", "true");
  await expect(chip(friend, /^General · everything$/)).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "Start game" }).click();
  await page.getByRole("button", { name: "I'm ready – start" }).click();
  await expect(page.locator("article p").first()).toContainText("Secondary Physics · Waves");
  await context.close();
});

test("in an online room the host chooses, and every player sees the choice", async ({ browser }) => {
  const host = await newPlayer(browser, "Host");
  const ann = await newPlayer(browser, "Ann");
  const code = await createRoom(host);
  await joinRoom(ann, code);

  await chip(host.page, /^University, \d+ cards$/).click();
  await chip(host.page, /^Calculus, \d+ cards$/).click();
  await expect(ann.page.getByText(/^University · Calculus · \d+ cards/)).toBeVisible();
  await expect(chip(ann.page, /^Calculus, \d+ cards$/)).toBeDisabled(); // only the host can change it

  await host.page.getByRole("button", { name: "Start game" }).click();
  await expect(host.page.getByText("You're explaining")).toBeVisible();
  await expect(host.page.locator("article p").first()).toContainText("University Maths · ");
  for (const p of [host, ann]) expect(p.problems, `${p.name} console/CSP problems`).toEqual([]);
});
