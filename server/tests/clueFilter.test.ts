import { describe, expect, it } from "vitest";
import type { Card } from "@stemcharades/shared";
import { checkClue } from "../src/game/clueFilter.js";

const card = (over: Partial<Card>): Card => ({
  id: "bio-0001",
  type: "term",
  subject: "Biology",
  course: "secondary-biology",
  topic: "Plants",
  level: 2,
  prompt: "Photosynthesis",
  answers: ["photosynthesis"],
  forbidden: ["plants", "light", "glucose"],
  explanation: "Plants make glucose using light energy.",
  status: "reviewed",
  ...over,
});

const photo = card({});

describe("clue filter", () => {
  it("allows a clean clue", () => {
    expect(checkClue("how green things make their food from sunshine", photo)).toEqual({ ok: true });
  });
  it("rejects the answer in any case", () => {
    expect(checkClue("It is PhotoSynthesis!", photo)).toMatchObject({ ok: false, reason: "contains_answer" });
  });
  it("rejects a forbidden word in any case and names it", () => {
    expect(checkClue("Think of GLUCOSE", photo)).toEqual({ ok: false, reason: "forbidden_word", word: "glucose" });
  });
  it("rejects plural forms", () => {
    expect(checkClue("many plant", photo)).toMatchObject({ ok: false, reason: "forbidden_word" });
    expect(checkClue("lights everywhere", photo)).toMatchObject({ ok: false });
    expect(checkClue("one plants", photo)).toMatchObject({ ok: false });
    const enzyme = card({ prompt: "Enzyme", answers: ["enzyme"], forbidden: ["protein", "catalyst", "substrate"] });
    expect(checkClue("these enzymes work", enzyme)).toMatchObject({ ok: false, reason: "contains_answer" });
    expect(checkClue("a catalysts", enzyme)).toMatchObject({ ok: false });
  });
  it("rejects plurals of words where a stemmer would disagree with itself", () => {
    const cache = card({ prompt: "Cache", answers: ["cache"], forbidden: ["fast", "memory", "store"] });
    expect(checkClue("many caches", cache)).toMatchObject({ ok: false });
    const extinct = card({ prompt: "Extinction", answers: ["extinction"], forbidden: ["species", "die", "population"] });
    expect(checkClue("they all dies", extinct)).toMatchObject({ ok: false, word: "die" });
    const energy = card({ prompt: "Joule", answers: ["joule"], forbidden: ["unit", "calorie", "si"] });
    expect(checkClue("a few calories", energy)).toMatchObject({ ok: false, word: "calorie" });
    const battery = card({ prompt: "Cell", answers: ["cell"], forbidden: ["battery", "power", "chemical"] });
    expect(checkClue("two batteries", battery)).toMatchObject({ ok: false });
    expect(checkClue("a boxes of bats", card({ prompt: "Box", answers: ["box"], forbidden: ["cube", "lid", "cardboard"] }))).toMatchObject({ ok: false });
  });
  it("rejects an answer split across words or punctuation", () => {
    expect(checkClue("photo synthesis", photo)).toMatchObject({ ok: false });
    expect(checkClue("photo-synthesis", photo)).toMatchObject({ ok: false });
    expect(checkClue("p.h.o.t.o.s.y.n.t.h.e.s.i.s", photo)).toMatchObject({ ok: true }); // too many pieces: out of scope
    const dna = card({ prompt: "DNA", answers: ["dna", "deoxyribonucleic acid"], forbidden: ["genetic", "helix", "bases"] });
    expect(checkClue("d n a", dna)).toMatchObject({ ok: false });
  });
  it("rejects multi-word answers only as a phrase", () => {
    const ke = card({ prompt: "Kinetic energy", answers: ["kinetic energy", "ke"], forbidden: ["motion", "moving", "mass"] });
    expect(checkClue("it is kinetic energy", ke)).toMatchObject({ ok: false });
    expect(checkClue("the Kinetic   Energy!", ke)).toMatchObject({ ok: false });
    expect(checkClue("energy of a moving", ke)).toMatchObject({ ok: false }); // 'moving' is forbidden
    expect(checkClue("energy stored in a spring", ke)).toEqual({ ok: true });
  });
  it("handles apostrophes and hyphens", () => {
    const n2 = card({ prompt: "Newton's second law", answers: ["newton's second law", "second law of motion"], forbidden: ["force", "mass", "acceleration"] });
    expect(checkClue("newtons second law", n2)).toMatchObject({ ok: false });
    expect(checkClue("Newton's second law", n2)).toMatchObject({ ok: false });
    const hl = card({ prompt: "Half-life", answers: ["half-life", "half life"], forbidden: ["decay", "radioactive", "isotope"] });
    expect(checkClue("the half life of it", hl)).toMatchObject({ ok: false });
  });
  it("does not block innocent words that merely contain a blocked word", () => {
    const mole = card({ prompt: "Mole", answers: ["mole", "mol"], forbidden: ["avogadro", "atoms", "amount"] });
    expect(checkClue("a molecule is made of bonded things", mole)).toEqual({ ok: true });
    expect(checkClue("the gentle animal is a mole", mole)).toMatchObject({ ok: false });
  });
  it("ignores answers of one or two letters but still blocks them from the prompt or forbidden list", () => {
    const he = card({ type: "question", prompt: "Which element has atomic number 2?", answers: ["helium", "he"], forbidden: ["noble", "balloon", "atomic"] });
    expect(checkClue("he said it floats a balloon", he)).toMatchObject({ ok: false, word: "balloon" });
    expect(checkClue("he said it is a lighter than air", he)).toEqual({ ok: true });
    const ph = card({ prompt: "pH", answers: ["ph"], forbidden: ["acid", "alkaline", "scale"] });
    expect(checkClue("the PH of lemon", ph)).toMatchObject({ ok: false });
  });
  it("does not block the prompt of a question card", () => {
    const q = card({ type: "question", prompt: "What is the SI unit of force?", answers: ["newton"], forbidden: ["unit", "si", "kilogram"] });
    expect(checkClue("What is it called, the thing in a push", q)).toEqual({ ok: true });
    expect(checkClue("named after Newton", q)).toMatchObject({ ok: false, reason: "contains_answer" });
  });
  it("blocks numeric answers", () => {
    const tri = card({ type: "question", prompt: "Sum of interior angles of a triangle?", answers: ["180", "180 degrees"], forbidden: ["triangle", "angles", "degrees"] });
    expect(checkClue("it is 180", tri)).toMatchObject({ ok: false });
  });
  it("blocks one- and two-digit numeric answers too, which no ordinary clue needs", () => {
    const sum = card({ type: "question", prompt: "What is 7 + 8?", answers: ["15", "fifteen"], forbidden: ["seven", "eight", "add"] });
    expect(checkClue("15", sum)).toEqual({ ok: false, reason: "contains_answer", word: "15" });
    expect(checkClue("one more than 14", sum)).toEqual({ ok: true });
    const hex = card({ type: "question", prompt: "How many sides does a hexagon have?", answers: ["6", "six"], forbidden: ["shape", "bee", "honeycomb"] });
    expect(checkClue("it is 6", hex)).toMatchObject({ ok: false, reason: "contains_answer" });
  });
  it("is silent about what it matched beyond the single word", () => {
    const res = checkClue("glucose", photo);
    expect(Object.keys(res).sort()).toEqual(["ok", "reason", "word"]);
  });
});
