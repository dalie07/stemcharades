import { describe, expect, it } from "vitest";
import { cardSchema, checkDeck, type Card } from "@stemcharades/shared";

const base: Card = {
  id: "phy-0001",
  type: "term",
  subject: "Physics",
  topic: "Mechanics",
  level: 1,
  prompt: "Velocity",
  answers: ["velocity"],
  forbidden: ["speed", "direction", "metres", "time"],
  explanation: "Velocity is the rate of change of displacement with time.",
  status: "draft",
};

describe("card schema", () => {
  it("accepts a valid card", () => expect(cardSchema.safeParse(base).success).toBe(true));
  it("rejects a missing field", () => {
    const rest: Partial<Card> = { ...base };
    delete rest.explanation;
    expect(cardSchema.safeParse(rest).success).toBe(false);
  });
  it("requires latex for formula cards", () =>
    expect(cardSchema.safeParse({ ...base, type: "formula" }).success).toBe(false));
  it("rejects a wrong id prefix", () =>
    expect(cardSchema.safeParse({ ...base, id: "bio-0001" }).success).toBe(false));
  it("rejects too few forbidden words", () =>
    expect(cardSchema.safeParse({ ...base, forbidden: ["a1", "b2"] }).success).toBe(false));
});

describe("checkDeck", () => {
  it("flags duplicate ids", () =>
    expect(checkDeck([base, { ...base, answers: ["other"] }]).join()).toContain("duplicate id"));
  it("flags shared answers", () =>
    expect(checkDeck([base, { ...base, id: "phy-0002" }]).join()).toContain("also an answer"));
  it("flags a forbidden word that is an answer", () =>
    expect(checkDeck([{ ...base, forbidden: ["velocity", "x1", "y2"] }]).join()).toContain("forbidden"));
});
