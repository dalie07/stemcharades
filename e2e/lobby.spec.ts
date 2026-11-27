import { expect, test } from "@playwright/test";
import { createRoom, joinRoom, newPlayer, roster } from "./helpers";

test("four browsers join one room, survive a refresh and see the same lobby", async ({ browser }) => {
  const names = ["Host", "Ann", "Ben", "Cat"];
  const players = await Promise.all(names.map((n) => newPlayer(browser, n)));
  const code = await createRoom(players[0]!);
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
  for (const p of players.slice(1)) await joinRoom(p, code);

  await expect.poll(async () => (await roster(players[3]!)).length).toBe(4);
  const rosters = await Promise.all(players.map(roster));
  const strip = (r: string[]) => r.map((x) => x.replace(" (you)", ""));
  for (const r of rosters) expect(strip(r)).toEqual(strip(rosters[0]!));
  rosters.forEach((r, i) => expect(r.some((x) => x.includes(`${names[i]} (you)`))).toBe(true));
  expect(rosters[0]!.filter((x) => x.includes("HOST"))).toHaveLength(1);

  // Ben refreshes and gets the same seat back.
  await players[2]!.page.reload();
  await expect(players[2]!.page.getByRole("heading", { name: new RegExp(`Room code`) })).toHaveText(code);
  await expect.poll(async () => (await roster(players[2]!)).find((x) => x.includes("(you)"))).toContain("Ben");
  expect(await roster(players[2]!)).toHaveLength(4);
  await expect.poll(async () => (await roster(players[0]!)).filter((x) => x.includes("Ben")).length).toBe(1);

  // Only the host can change settings; guests see what was chosen, and the change reaches everyone.
  await expect(players[1]!.page.getByRole("button", { name: "Change what to play" })).toHaveCount(0);
  await expect(players[1]!.page.getByText("The host chooses what to play.")).toBeVisible();
  const host = players[0]!.page;
  await host.getByRole("button", { name: "Change what to play" }).click();
  await host.getByRole("button", { name: "Next", exact: true }).click(); // Everything
  await host.getByRole("radio", { name: /^Standard/ }).click(); // 5 rounds
  await host.getByRole("button", { name: "Done" }).click();
  for (const p of players) await expect(p.page.getByText("Standard", { exact: true })).toBeVisible();
  await expect(players[1]!.page.getByRole("button", { name: "Start game" })).toBeDisabled();
  for (const p of players) expect(p.problems).toEqual([]);
});

test("a room that does not exist, a taken nickname and a blocked name give clear messages", async ({ browser }) => {
  const host = await newPlayer(browser, "Host");
  const code = await createRoom(host);
  const dup = await newPlayer(browser, "host");
  await dup.page.goto("/#/online");
  await dup.page.getByRole("button", { name: /^Join a room/ }).click();
  await dup.page.getByLabel("Your nickname").fill("host");
  await dup.page.getByLabel("Room code").fill(code);
  await dup.page.getByRole("button", { name: "Join room" }).click();
  await expect(dup.page.getByRole("alert")).toContainText("already has that nickname");

  const nope = await newPlayer(browser, "Zed");
  await nope.page.goto("/#/online");
  await nope.page.getByRole("button", { name: /^Join a room/ }).click();
  await nope.page.getByLabel("Your nickname").fill("Zed");
  await nope.page.getByLabel("Room code").fill("ZZZZZ");
  await nope.page.getByRole("button", { name: "Join room" }).click();
  await expect(nope.page.getByRole("alert")).toContainText("doesn't exist");

  const rude = await newPlayer(browser, "sh1t");
  await rude.page.goto("/#/online");
  await rude.page.getByRole("button", { name: /^Create a room/ }).click();
  await rude.page.getByLabel("Your nickname").fill("sh1t");
  await rude.page.getByRole("button", { name: "Create room" }).click();
  await expect(rude.page.getByRole("alert")).toContainText("friendlier");
});

test("the host can remove a player, who is told and sent home", async ({ browser }) => {
  const host = await newPlayer(browser, "Host");
  const ann = await newPlayer(browser, "Ann");
  const code = await createRoom(host);
  await joinRoom(ann, code);
  await expect.poll(async () => (await roster(host)).length).toBe(2);
  host.page.once("dialog", (d) => d.accept());
  await host.page.getByRole("button", { name: "Remove Ann from the room" }).click();
  await expect(ann.page.getByRole("status")).toContainText("removed you");
  await expect(ann.page.getByRole("heading", { name: "STEMCHARADES" })).toBeVisible();
  await expect.poll(async () => (await roster(host)).length).toBe(1);
});
