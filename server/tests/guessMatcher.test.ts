import { describe, expect, it } from "vitest";
import { matchGuess } from "../src/game/guessMatcher.js";

const dna = { answers: ["dna", "deoxyribonucleic acid"] };
const mitosis = { answers: ["mitosis"] };
const ke = { answers: ["kinetic energy", "ke"] };
const half = { answers: ["half-life", "half life"] };
const num = { answers: ["180", "180 degrees"] };

describe("guess matcher", () => {
  it("matches ignoring case, spacing and punctuation", () => {
    expect(matchGuess("MITOSIS", mitosis)).toBe("correct");
    expect(matchGuess("  mi tosis ", mitosis)).toBe("correct");
    expect(matchGuess("Mitosis!!", mitosis)).toBe("correct");
    expect(matchGuess("half   life", half)).toBe("correct");
    expect(matchGuess("HALF-LIFE.", half)).toBe("correct");
    expect(matchGuess("Kinetic-Energy", ke)).toBe("correct");
  });
  it("matches listed aliases", () => {
    expect(matchGuess("DNA", dna)).toBe("correct");
    expect(matchGuess("Deoxyribonucleic Acid", dna)).toBe("correct");
    expect(matchGuess("KE", ke)).toBe("correct");
    expect(matchGuess("D.N.A.", dna)).toBe("correct");
    expect(matchGuess("A.P.I.", { answers: ["api"] })).toBe("correct"); // initialism starting with the letter "a"
  });
  it("ignores a leading article and plural endings", () => {
    expect(matchGuess("the mitosis", mitosis)).toBe("correct");
    expect(matchGuess("an mitosis", mitosis)).toBe("correct");
    expect(matchGuess("enzymes", { answers: ["enzyme"] })).toBe("correct");
    expect(matchGuess("enzyme", { answers: ["enzymes"] })).toBe("correct");
  });
  it("treats plural and singular as the same word, including cache/caches and battery/batteries", () => {
    expect(matchGuess("caches", { answers: ["cache"] })).toBe("correct");
    expect(matchGuess("cache", { answers: ["caches"] })).toBe("correct");
    expect(matchGuess("batteries", { answers: ["battery"] })).toBe("correct");
    expect(matchGuess("boxes", { answers: ["box"] })).toBe("correct");
    expect(matchGuess("rat", { answers: ["rate"] })).not.toBe("correct"); // no free points for a different word
  });
  it("marks one or two letters off as close", () => {
    expect(matchGuess("mitosys", mitosis)).toBe("close"); // substitution
    expect(matchGuess("mitoss", mitosis)).toBe("close"); // deletion
    expect(matchGuess("mitossis", mitosis)).toBe("close"); // insertion
    expect(matchGuess("mitosis", { answers: ["mitosis"] })).toBe("correct");
    expect(matchGuess("mtiosis", mitosis)).toBe("close"); // swapped neighbours
    expect(matchGuess("deoxyribonucleic acd", dna)).toBe("close");
    expect(matchGuess("deoxyribonuclic acd", dna)).toBe("close"); // two typos, long answer
  });
  it("handles apostrophes in typos of possessive answers", () => {
    const n2 = { answers: ["newton's second law"] };
    expect(matchGuess("newtons second law", n2)).toBe("correct");
    expect(matchGuess("neqton's second law", n2)).toBe("close");
  });
  it("is not generous for short or numeric answers", () => {
    expect(matchGuess("RNA", dna)).toBe("wrong");
    expect(matchGuess("181", num)).toBe("wrong");
    expect(matchGuess("170", num)).toBe("wrong");
  });
  it("does not call a different concept close", () => {
    expect(matchGuess("meiosis", mitosis)).toBe("wrong"); // two letters off, but seven letters long
    expect(matchGuess("osmosis", mitosis)).toBe("wrong");
  });
  it("marks everything else wrong, including empty input and partial answers", () => {
    expect(matchGuess("", mitosis)).toBe("wrong");
    expect(matchGuess("   ", mitosis)).toBe("wrong");
    expect(matchGuess("!!!", mitosis)).toBe("wrong");
    expect(matchGuess("kinetic", ke)).toBe("wrong");
    expect(matchGuess("potential energy", ke)).toBe("wrong");
  });
  it("matches numeric answers written in different ways", () => {
    expect(matchGuess("180", num)).toBe("correct");
    expect(matchGuess("180°", num)).toBe("correct");
    expect(matchGuess("180 Degrees", num)).toBe("correct");
    const c = { answers: ["3x10^8", "300000000"] };
    expect(matchGuess("300 000 000", c)).toBe("correct");
    expect(matchGuess("300,000,000", c)).toBe("correct");
  });
  it("never returns anything but a label", () => {
    for (const g of ["mitosis", "mitosys", "banana"]) expect(["correct", "close", "wrong"]).toContain(matchGuess(g, mitosis));
  });
});
