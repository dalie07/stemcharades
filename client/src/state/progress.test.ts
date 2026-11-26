import { describe, expect, it } from "vitest";
import { EMPTY, missedIds, stars, streak, today, withDayPlayed, withResult } from "./progress";

const waves = (id: string) => ({ id, course: "secondary-physics", topic: "Waves" });
const TOPIC = "secondary-physics/Waves";

describe("learning progress", () => {
  it("keeps each card's latest result, so a miss stays to revise until it is got again", () => {
    let p = withResult(EMPTY, waves("phy-0001"), false);
    p = withResult(p, waves("phy-0002"), true);
    expect(missedIds(p)).toEqual(["phy-0001"]);
    p = withResult(p, waves("phy-0001"), true);
    expect(missedIds(p)).toEqual([]);
    expect(p.cards["phy-0001"]).toEqual({ topic: TOPIC, got: 1, missed: 1, last: "got" });
  });

  it("gives up to three stars per topic: any card learned, half of them, all of them", () => {
    let p = EMPTY;
    expect(stars(p, TOPIC, 4)).toBe(0);
    p = withResult(p, waves("a"), true);
    expect(stars(p, TOPIC, 4)).toBe(1);
    p = withResult(p, waves("b"), true);
    expect(stars(p, TOPIC, 4)).toBe(2);
    p = withResult(withResult(p, waves("c"), true), waves("d"), true);
    expect(stars(p, TOPIC, 4)).toBe(3);
    p = withResult(p, waves("d"), false); // missed again: loses that card's credit
    expect(stars(p, TOPIC, 4)).toBe(2);
    expect(stars(p, "secondary-physics/Energy", 4)).toBe(0);
    expect(stars(p, TOPIC, 0)).toBe(0);
  });

  it("counts a daily streak that survives until a day is actually missed", () => {
    let p = EMPTY;
    for (const d of ["2026-11-20", "2026-11-21", "2026-11-22"]) p = withDayPlayed(p, d);
    expect(streak(p, "2026-11-22")).toBe(3);
    expect(streak(p, "2026-11-23")).toBe(3); // not played yet today: the streak is still alive
    expect(streak(p, "2026-11-24")).toBe(0); // a whole day missed
    expect(withDayPlayed(p, "2026-11-22")).toBe(p); // playing twice in a day changes nothing
    expect(streak(withDayPlayed(p, "2026-12-01"), "2026-12-01")).toBe(1);
  });

  it("crosses month and year boundaries", () => {
    let p = EMPTY;
    for (const d of ["2026-12-30", "2026-12-31", "2027-01-01"]) p = withDayPlayed(p, d);
    expect(streak(p, "2027-01-01")).toBe(3);
    expect(today(new Date(2027, 0, 5))).toBe("2027-01-05");
  });
});
