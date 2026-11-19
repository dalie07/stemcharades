import { describe, expect, it } from "vitest";
import {
  COURSES,
  GENERAL,
  LEVELS,
  coursesAt,
  describeSelection,
  inSelection,
  selectedTopicKeys,
  selectionFromQuery,
  selectionToQuery,
  tidySelection,
  topicKey,
} from "./taxonomy.js";
import { selectionSchema, settingsSchema, DEFAULT_SETTINGS } from "./rooms.js";

describe("the curriculum map", () => {
  it("has unique course ids, unique topics within each course, and subjects or courses at every level", () => {
    expect(new Set(COURSES.map((c) => c.id)).size).toBe(COURSES.length);
    for (const c of COURSES) {
      expect(new Set(c.topics).size, c.id).toBe(c.topics.length);
      expect(c.topics.length, c.id).toBeGreaterThan(0);
      expect(c.id.startsWith(["", "primary", "secondary", "university", "advanced"][c.level]!), c.id).toBe(true);
    }
    for (const level of LEVELS) expect(coursesAt(level).length).toBeGreaterThanOrEqual(3);
    expect(coursesAt(1).map((c) => c.name)).toEqual(["Maths", "Science", "Computing"]);
    expect(coursesAt(2).map((c) => c.name)).toEqual(["Maths", "Physics", "Chemistry", "Biology", "Computer Science"]);
  });
});

describe("selections", () => {
  const wave = { level: 2 as const, course: "secondary-physics", topic: "Waves" };
  const cells = { level: 3 as const, course: "university-cell-biology", topic: "Cells" };

  it("treat an empty list as everything, so the empty selection is General", () => {
    expect(inSelection(wave, GENERAL)).toBe(true);
    expect(inSelection(wave, { levels: [2], courses: [], topics: [] })).toBe(true);
    expect(inSelection(cells, { levels: [2], courses: [], topics: [] })).toBe(false);
    expect(inSelection(wave, { levels: [], courses: ["secondary-physics"], topics: [] })).toBe(true);
    expect(inSelection(wave, { levels: [], courses: [], topics: [topicKey("secondary-physics", "Energy")] })).toBe(false);
    expect(selectedTopicKeys(GENERAL).length).toBe(COURSES.reduce((n, c) => n + c.topics.length, 0));
    expect(selectedTopicKeys({ levels: [], courses: ["secondary-physics"], topics: [] })).toContain("secondary-physics/Waves");
  });

  it("drop choices that no longer fit when a wider choice is unticked", () => {
    const s = { levels: [3 as const], courses: ["secondary-physics", "university-calculus"], topics: ["secondary-physics/Waves", "university-calculus/Limits"] };
    expect(tidySelection(s)).toEqual({ levels: [3], courses: ["university-calculus"], topics: ["university-calculus/Limits"] });
  });

  it("travel in links, and a tampered link degrades to a wider choice instead of failing", () => {
    const s = { levels: [2 as const], courses: ["secondary-physics"], topics: ["secondary-physics/Waves"] };
    expect(selectionFromQuery(selectionToQuery(s))).toEqual(s);
    expect(selectionToQuery(GENERAL)).toBe("");
    expect(selectionFromQuery("levels=2,9,x&courses=secondary-physics,evil&topics=secondary-physics/Nope")).toEqual({
      levels: [2],
      courses: ["secondary-physics"],
      topics: [],
    });
  });

  it("describe themselves in a few words", () => {
    expect(describeSelection(GENERAL)).toBe("General: everything");
    expect(describeSelection({ levels: [2], courses: ["secondary-physics"], topics: ["secondary-physics/Waves"] })).toBe(
      "Secondary · Physics · Waves",
    );
    expect(describeSelection({ levels: [3, 4], courses: ["university-calculus", "advanced-quantum"], topics: [] })).toBe(
      "University + Advanced · 2 subjects or courses",
    );
  });

  it("are validated: unknown courses and topics are refused", () => {
    expect(settingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
    expect(selectionSchema.safeParse({ levels: [5], courses: [], topics: [] }).success).toBe(false);
    expect(selectionSchema.safeParse({ levels: [], courses: ["made-up"], topics: [] }).success).toBe(false);
    expect(selectionSchema.safeParse({ levels: [], courses: [], topics: ["secondary-physics/Knitting"] }).success).toBe(false);
  });
});
