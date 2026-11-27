import { describe, expect, it } from "vitest";
import type { Card } from "@stemcharades/shared";
import { importBatch } from "../src/content/importCards.js";

const library: Card[] = [
  {
    id: "phy-0007",
    type: "term",
    subject: "Physics",
    course: "secondary-physics",
    topic: "Waves",
    level: 2,
    prompt: "Frequency",
    answers: ["frequency"],
    forbidden: ["hertz", "waves", "second"],
    explanation: "The number of waves passing a point each second, measured in hertz.",
    status: "reviewed",
  },
];

const draft = (over: Record<string, unknown> = {}) => ({
  topic: "Waves",
  type: "term",
  prompt: "Wavelength",
  latex: "",
  answers: ["wavelength"],
  forbidden: ["distance", "crest", "peak"],
  explanation: "The distance between two matching points on neighbouring waves, such as two crests.",
  ...over,
});

describe("importing an AI-drafted batch", () => {
  it("turns good cards into numbered drafts placed in the curriculum", () => {
    const { accepted, rejected } = importBatch({ course: "secondary-physics", cards: [draft(), draft({ prompt: "Amplitude", answers: [] })] }, library);
    expect(rejected).toEqual([]);
    expect(accepted.map((c) => c.id)).toEqual(["phy-0008", "phy-0009"]);
    expect(accepted[0]).toMatchObject({ course: "secondary-physics", topic: "Waves", level: 2, subject: "Physics", status: "draft" });
    expect(accepted[1]!.answers).toEqual(["Amplitude"]); // the prompt of a term card is always an answer
  });

  it("explains every card it refuses, and keeps the rest", () => {
    const { accepted, rejected } = importBatch(
      {
        course: "secondary-physics",
        cards: [
          draft({ prompt: "Frequency of a wave", answers: ["frequency"] }),
          draft({ topic: "Knitting" }),
          draft({ forbidden: ["one", "two"] }),
          draft({ type: "formula" }),
          draft({ prompt: "Which wave property is measured crest to crest?", type: "question", answers: ["wavelength"] }),
          draft({ type: "question", prompt: "What is the wavelength called?", answers: ["wavelength"] }),
          { prompt: "missing fields" },
          draft({ prompt: "Crest", answers: [], forbidden: ["top", "highest", "peak"] }),
          draft({ prompt: "Crest", answers: ["crest"], forbidden: ["top", "highest", "peak"] }),
        ],
      },
      library,
    );
    expect(accepted.map((c) => c.prompt)).toEqual(["Which wave property is measured crest to crest?", "Crest"]);
    expect(rejected.map((r) => r.reason)).toEqual([
      'answer "frequency" already belongs to phy-0007',
      '"Knitting" is not a topic of secondary-physics: add it to the curriculum map first',
      "forbidden: Too small: expected array to have >=3 items",
      "latex: formula cards need latex",
      "the question gives away its answer",
      "missing or wrong field: topic",
      '"Crest" is already a card in Waves',
    ]);
  });

  it("needs the subject only for courses that span several, and rejects an unknown course or shape", () => {
    const science = importBatch(
      {
        course: "primary-science",
        cards: [
          draft({ topic: "Plants", prompt: "Leaf", answers: ["leaf"], forbidden: ["green", "tree", "flat"], subject: "Biology", explanation: "A leaf is the flat green part of a plant that makes food from sunlight." }),
          draft({ topic: "Plants", prompt: "Bud", answers: ["bud"], forbidden: ["flower", "grow", "new"], explanation: "A bud is a small swelling on a plant that will grow into a leaf or a flower." }),
        ],
      },
      library,
    );
    expect(science.accepted.map((c) => [c.id, c.subject, c.level])).toEqual([["bio-0001", "Biology", 1]]);
    expect(science.rejected[0]!.reason).toBe("subject must be one of Physics, Chemistry, Biology for primary-science");
    expect(importBatch({ course: "nope", cards: [draft()] }, library).rejected[0]!.reason).toBe('unknown course "nope"');
    expect(importBatch([draft()], library).rejected[0]!.reason).toMatch(/not a batch/);
  });
});
