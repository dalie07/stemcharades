import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const tsx = path.join(root, "node_modules/.bin/tsx");
const script = path.join(root, "scripts/validate-cards.ts");
const good = JSON.parse(readFileSync(path.join(root, "content/decks/physics.json"), "utf8")) as Record<string, unknown>[];

function validate(cards: unknown): { code: number; out: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "decks-"));
  try {
    writeFileSync(path.join(dir, "test.json"), JSON.stringify(cards));
    execFileSync(tsx, [script, dir], { encoding: "utf8", stdio: "pipe" });
    return { code: 0, out: "" };
  } catch (e) {
    const err = e as { status: number; stderr: string; stdout: string };
    return { code: err.status, out: `${err.stderr}${err.stdout}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("deck validation (the CI gate)", () => {
  it("passes the real decks", () => {
    expect(validate(good.slice(0, 5)).code).toBe(0);
  });
  it("fails when a field is missing", () => {
    const broken = { ...good[0] };
    delete broken.explanation;
    const r = validate([broken, ...good.slice(1, 3)]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("explanation");
  });
  it("fails on a duplicate id", () => {
    const r = validate([good[0], { ...good[1], id: good[0]!.id }]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("duplicate id");
  });
  it("fails when two cards share an answer", () => {
    const r = validate([good[0], { ...good[1], answers: good[0]!.answers }]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("also an answer");
  });
  it("fails when a forbidden word is itself an accepted answer", () => {
    const r = validate([{ ...good[0], forbidden: [(good[0]!.answers as string[])[0], "aaa", "bbb"] }]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("forbidden word");
  });
  it("fails on a formula card with no latex and on an unknown field", () => {
    expect(validate([{ ...good[0], type: "formula", latex: undefined }]).code).toBe(1);
    expect(validate([{ ...good[0], surprise: true }]).code).toBe(1);
  });
});
