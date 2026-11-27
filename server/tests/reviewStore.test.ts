import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Card } from "@stemcharades/shared";
import { deleteDraft, editCard, readDecks, writeDeck, type Decks } from "../src/content/reviewStore.js";

const card = (over: Partial<Card>): Card => ({
  id: "phy-0001",
  type: "term",
  subject: "Physics",
  course: "secondary-physics",
  topic: "Waves",
  level: 2,
  prompt: "Wavelength",
  answers: ["wavelength"],
  forbidden: ["distance", "crest", "peak"],
  explanation: "The distance between two matching points on neighbouring waves, such as two crests.",
  status: "draft",
  ...over,
});

const decks = (): Decks =>
  new Map([
    ["physics.json", [card({}), card({ id: "phy-0002", prompt: "Frequency", answers: ["frequency"], forbidden: ["hertz", "per second", "waves"], status: "reviewed" })]],
  ]);

describe("the review tool's model", () => {
  it("approves a draft", () => {
    const d = decks();
    const r = editCard(d, "phy-0001", { status: "reviewed" });
    expect(r).toMatchObject({ ok: true, file: "physics.json", card: { status: "reviewed" } });
    expect(d.get("physics.json")![0]!.status).toBe("reviewed");
  });

  it("saves an edit, tidied the way the importer tidies cards", () => {
    const d = decks();
    const r = editCard(d, "phy-0001", { prompt: "  Wavelength ", answers: ["lambda", "lambda"], forbidden: ["distance", "Wavelength", "crest", "peak"] });
    expect(r.ok).toBe(true);
    expect(d.get("physics.json")![0]).toMatchObject({ answers: ["Wavelength", "lambda"], forbidden: ["distance", "crest", "peak"] });
  });

  it("refuses an edit that would break the library, and changes nothing", () => {
    const d = decks();
    expect(editCard(d, "phy-0001", { answers: ["frequency"], type: "question", prompt: "What is measured crest to crest?" })).toEqual({
      ok: false,
      problems: ['answer "frequency" is also an answer of phy-0002 at the same level'],
    });
    expect(editCard(d, "phy-0001", { forbidden: ["one"] })).toMatchObject({ ok: false });
    expect(editCard(d, "phy-0001", { topic: "Knitting" })).toMatchObject({ ok: false });
    expect(editCard(d, "phy-0001", { type: "formula" })).toMatchObject({ ok: false, problems: ["latex: formula cards need latex"] });
    expect(editCard(d, "phy-9999", { status: "reviewed" })).toEqual({ ok: false, problems: ["no card phy-9999"] });
    expect(d.get("physics.json")![0]).toEqual(card({}));
  });

  it("deletes drafts but never a reviewed card", () => {
    const d = decks();
    expect(deleteDraft(d, "phy-0002")).toMatchObject({ ok: false });
    expect(deleteDraft(d, "phy-0001")).toEqual({ ok: true, file: "physics.json" });
    expect(d.get("physics.json")!.map((c) => c.id)).toEqual(["phy-0002"]);
  });

  it("reads and writes deck files in the library's format", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "decks-"));
    writeFileSync(path.join(dir, "physics.json"), JSON.stringify([card({})], null, 2) + "\n");
    const d = readDecks(dir);
    editCard(d, "phy-0001", { status: "reviewed" });
    writeDeck(dir, "physics.json", d.get("physics.json")!);
    const text = readFileSync(path.join(dir, "physics.json"), "utf8");
    expect(JSON.parse(text)).toEqual([card({ status: "reviewed" })]);
    expect(text.startsWith('[\n  {\n    "id": "phy-0001"')).toBe(true); // two-space indent, like every deck file
    expect(text.endsWith("]\n")).toBe(true);
  });
});
