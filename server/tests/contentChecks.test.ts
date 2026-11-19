import { describe, expect, it } from "vitest";
import type { Card } from "@stemcharades/shared";
import { contentProblems } from "../src/content/contentChecks.js";

const card: Card = {
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
};

describe("content checks", () => {
  it("pass a clean card", () => expect(contentProblems([card])).toEqual([]));

  it("catch rude words and links anywhere on a card", () => {
    expect(contentProblems([{ ...card, explanation: "A wave is a shit way to carry energy from place to place." }])).toEqual([
      "phy-0001: contains blocked language",
    ]);
    expect(contentProblems([{ ...card, answers: ["wavelength", "see www.example.com"] }])).toEqual(["phy-0001: contains a link"]);
  });

  it("catch a question that prints its own answer, but allow forbidden words in it", () => {
    const question: Card = { ...card, type: "question", prompt: "Is sound transverse or longitudinal?", answers: ["longitudinal"] };
    expect(contentProblems([question])).toEqual(["phy-0001: the question gives away its answer"]);
    expect(contentProblems([{ ...question, prompt: "Which wave type has crests and a distance between them?" }])).toEqual([]);
  });
});
