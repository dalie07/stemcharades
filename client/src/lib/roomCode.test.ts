import { describe, expect, it } from "vitest";
import { cleanCode, codeProblem } from "./roomCode";

describe("room codes typed by players", () => {
  it("are cleaned of spaces, dashes and lowercase", () => {
    expect(cleanCode(" ab cde ")).toBe("ABCDE");
    expect(cleanCode("ab-cd-e")).toBe("ABCDE");
    expect(cleanCode("abcdefg")).toBe("ABCDE");
  });
  it("get a specific, actionable reason when they cannot be right", () => {
    expect(codeProblem("")).toMatch(/Enter the 5-character room code/);
    expect(codeProblem("ABC0E")).toMatch(/never use O, 0, I or 1/);
    expect(codeProblem("ABCOE")).toMatch(/never use O, 0, I or 1/);
    expect(codeProblem("AB?DE")).toMatch(/only use letters and the numbers 2 to 9/);
    expect(codeProblem("ABCD")).toMatch(/too short/);
    expect(codeProblem("ABCDE")).toBeNull();
    expect(codeProblem("XY2Z9")).toBeNull();
  });
});
