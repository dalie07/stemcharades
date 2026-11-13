import { describe, expect, it } from "vitest";
import { flagIssueUrl, flagText } from "./flag";

const card = { id: "phy-0042", prompt: "Kinetic energy & more", subject: "Physics", topic: "Energy" };

describe("flag a card", () => {
  it("builds a prefilled GitHub issue link containing only card details", () => {
    const url = new URL(flagIssueUrl(card, "someone/stemcharades")!);
    expect(url.origin + url.pathname).toBe("https://github.com/someone/stemcharades/issues/new");
    expect(url.searchParams.get("title")).toBe("Card phy-0042: possible mistake");
    expect(url.searchParams.get("body")).toContain("phy-0042");
    expect(url.searchParams.get("body")).toContain("Kinetic energy & more"); // special characters survive encoding
    expect(url.searchParams.get("labels")).toBe("card-review");
  });
  it("returns null without a valid repository so the button falls back to copying", () => {
    expect(flagIssueUrl(card, undefined)).toBeNull();
    expect(flagIssueUrl(card, "not a repo")).toBeNull();
    expect(flagIssueUrl(card, "evil.com/../x?y=z")).toBeNull();
  });
  it("includes the subject and topic in the text", () => {
    expect(flagText(card).body).toContain("Physics / Energy");
  });
});
