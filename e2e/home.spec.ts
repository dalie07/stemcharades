import { expect, test } from "@playwright/test";

const daysAgo = (n: number) => {
  const t = new Date();
  t.setDate(t.getDate() - n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

test("the streak flame counts consecutive days played and grows with the streak", async ({ browser }) => {
  const context = await browser.newContext();
  // Played on each of the last eight days, today included: a Blaze.
  const days = Array.from({ length: 8 }, (_, i) => daysAgo(7 - i));
  await context.addInitScript((p) => localStorage.setItem("stemcharades.progress", JSON.stringify(p)), { cards: {}, days });
  const page = await context.newPage();
  await page.goto("/");
  const flame = page.getByRole("button", { name: "8-day streak, Blaze" });
  await expect(flame).toBeVisible();
  await flame.click();
  await expect(page.getByRole("heading", { name: "8-day streak" })).toBeVisible();
  await expect(page.getByText("6 more days in a row to reach Inferno.")).toBeVisible();
  await expect(page.getByText("You've played today.")).toBeVisible();
  await context.close();
});

test("a new player sees an unlit flame", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "No streak yet" })).toBeVisible();
});

test("the app can be installed on a phone: a full-screen manifest with proper and maskable icons", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ name: "STEMCHARADES", display: "standalone", start_url: "/", orientation: "portrait" });
  expect(manifest.icons.map((i: { purpose: string }) => i.purpose).sort()).toEqual(["any", "any", "maskable"]);
  for (const icon of manifest.icons) expect((await request.get(`/${icon.src}`)).status()).toBe(200);
  expect((await request.get("/apple-touch-icon.png")).status()).toBe(200);
  expect((await request.get("/sw.js")).status()).toBe(200);
});
