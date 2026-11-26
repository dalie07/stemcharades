import { expect, test, type Page } from "@playwright/test";
import { allCards, createRoom, joinRoom, newPlayer, type Player } from "./helpers";

const SUBJECTS_LOWER = ["maths", "physics", "chemistry", "biology", "computing"];
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const contains = (raw: string, word: string) => new RegExp(`(^|[^a-z0-9])${escapeRe(word.toLowerCase())}([^a-z0-9]|$)`).test(raw.toLowerCase());

/** Every string value in a Socket.IO frame (`42["state",{...}]`), without its keys or numbers. */
function textValues(frame: string): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  try {
    walk(JSON.parse(frame.replace(/^\d+/, "") || "null"));
    return out;
  } catch {
    return [frame]; // not JSON: search all of it
  }
}

async function promptOf(page: Page): Promise<string> {
  return ((await page.locator("article h1").textContent()) ?? "").trim();
}

test("a full round runs across devices and a guesser's browser never receives the answer", async ({ browser, request }) => {
  const cards = await allCards(request);
  const [host, ann, ben] = await Promise.all(["Host", "Ann", "Ben"].map((n) => newPlayer(browser, n)));
  const players: Player[] = [host!, ann!, ben!];
  const code = await createRoom(host!);
  await joinRoom(ann!, code);
  await joinRoom(ben!, code);
  await host!.page.getByRole("button", { name: "Start game" }).click();

  await expect(host!.page.getByText("You're explaining")).toBeVisible();
  for (const g of [ann!, ben!]) await expect(g.page.getByText("Host is explaining")).toBeVisible();
  const prompt = await promptOf(host!.page);
  const secret = cards.find((c) => c.prompt === prompt)!;
  await expect(host!.page.getByText("Don't say:")).toBeVisible();
  await expect(host!.page.getByRole("timer")).toContainText(/\d+s/);

  // Guessers see only type and subject.
  await expect(ann!.page.getByText(`A ${secret.type} from ${secret.subject}`)).toBeVisible();
  await expect(ann!.page.locator("body")).not.toContainText(prompt);

  // A clue giving the answer away is refused for the explainer alone. (On a question card the prompt is the
  // question, not the answer, so the clue uses an accepted answer the filter enforces, or else a forbidden word.)
  const enforced = secret.answers.find((a) => a.replace(/[^a-z0-9]/gi, "").length >= 3 || /^\d+$/.test(a));
  const giveaway = `it is ${secret.type === "question" ? (enforced ?? secret.forbidden[0]) : prompt}`;
  await host!.page.getByLabel("Type a clue").fill(giveaway);
  await host!.page.getByRole("button", { name: "Send" }).click();
  await expect(host!.page.getByRole("alert")).toContainText("Not allowed");
  await host!.page.getByLabel("Type a clue").fill("a perfectly harmless opening hint");
  await host!.page.getByRole("button", { name: "Send" }).click();
  for (const g of [ann!, ben!]) await expect(g.page.getByText("a perfectly harmless opening hint")).toBeVisible();
  for (const g of [ann!, ben!]) await expect(g.page.locator("body")).not.toContainText(giveaway);

  // The explainer's refresh restores role, card and clues.
  await host!.page.reload();
  await expect(host!.page.getByText("You're explaining")).toBeVisible();
  await expect(host!.page.getByText("a perfectly harmless opening hint")).toBeVisible();
  expect(await promptOf(host!.page)).toBe(prompt);

  // Raw network traffic to guessers contains none of the card. Only the text values sent are searched: field names
  // ("type", "code", "number") and numbers (timestamps, settings) are protocol, and a card that happens to use one
  // (a card about "Code", say) must not be reported as a leak. Words the protocol sends to everyone as values
  // (phase names, card types, subjects) are public by design for the same reason.
  const PUBLIC_WORDS = new Set(["lobby", "round", "reveal", "finished", "term", "formula", "question", ...SUBJECTS_LOWER]);
  const secrets = [...new Set([secret.prompt, ...secret.answers, ...secret.forbidden].filter((w) => w.length >= 3 && !PUBLIC_WORDS.has(w.toLowerCase())))];
  for (const g of [ann!, ben!]) {
    const raw = g.frames.flatMap(textValues).join("\n");
    expect(g.frames.length).toBeGreaterThan(0);
    for (const word of secrets) expect(contains(raw, word), `${g.name} received "${word}"`).toBe(false);
    expect(raw.toLowerCase()).not.toContain(secret.explanation.toLowerCase().slice(0, 30));
  }

  // A wrong guess, then a close one, then the answer. A guesser's refresh keeps their score.
  await ann!.page.getByLabel("Type your guess").fill("zzzz banana");
  await ann!.page.getByRole("button", { name: "Guess" }).click();
  await expect(ann!.page.getByText("isn't it")).toBeVisible();
  await ann!.page.getByLabel("Type your guess").fill(secret.answers[0]!.toUpperCase());
  await ann!.page.getByRole("button", { name: "Guess" }).click();
  await expect(ann!.page.getByText("You got it!")).toBeVisible();
  await expect(host!.page.getByText("Got it: Ann")).toBeVisible();
  await ann!.page.reload();
  await expect(ann!.page.getByText("You got it!")).toBeVisible(); // same seat, same state after refresh

  // Ben gets it with an alias: everyone has it, so the round ends and shows the reveal.
  await ben!.page.getByLabel("Type your guess").fill(secret.answers[secret.answers.length - 1]!);
  await ben!.page.getByRole("button", { name: "Guess" }).click();
  for (const p of players) {
    await expect(p.page.getByRole("heading", { name: "Everyone got it!" })).toBeVisible();
    await expect(p.page.getByText(secret.explanation.slice(0, 30))).toBeVisible();
    await expect(p.page.getByText(/Next round in \d+s/)).toBeVisible();
  }
  const awards = await ann!.page.getByRole("list", { name: "Points this round" }).getByRole("listitem").allInnerTexts();
  expect(awards.some((a) => a.includes("Host") && a.includes("+10"))).toBe(true); // 5 for each of two guessers
  for (const p of players) expect(p.problems, `${p.name} console/CSP problems`).toEqual([]);

  // After the pause the next round starts with the next explainer.
  await expect(ann!.page.getByText("You're explaining")).toBeVisible({ timeout: 20_000 });
});

test("the explainer skipping ends the round with nobody scoring", async ({ browser }) => {
  const [host, ann] = await Promise.all(["Host", "Ann"].map((n) => newPlayer(browser, n)));
  const code = await createRoom(host!);
  await joinRoom(ann!, code);
  await host!.page.getByRole("button", { name: "Start game" }).click();
  await host!.page.getByRole("button", { name: "Skip this card" }).click();
  for (const p of [host!, ann!]) {
    await expect(p.page.getByRole("heading", { name: "Skipped" })).toBeVisible();
    await expect(p.page.getByText("Nobody scored this round")).toBeVisible();
  }
});
