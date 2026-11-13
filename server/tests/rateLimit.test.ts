import { describe, expect, it } from "vitest";
import { RateLimiter, clientIp, createLimits, sweepLimits } from "../src/realtime/rateLimit.js";
import { isBlocked } from "../src/game/blocklist.js";

describe("rate limiter", () => {
  it("allows a burst, then refuses, then refills over time", () => {
    let t = 0;
    const l = new RateLimiter(3, 1, () => t);
    expect([1, 2, 3, 4].map(() => l.take("a"))).toEqual([true, true, true, false]);
    t += 1000;
    expect(l.take("a")).toBe(true);
    expect(l.take("a")).toBe(false);
    t += 10_000;
    expect([1, 2, 3, 4].map(() => l.take("a"))).toEqual([true, true, true, false]); // never exceeds capacity
  });
  it("keeps keys independent and can forget them", () => {
    const l = new RateLimiter(1, 0.001, () => 0);
    expect(l.take("a")).toBe(true);
    expect(l.take("a")).toBe(false);
    expect(l.take("b")).toBe(true);
    l.forget("a");
    expect(l.take("a")).toBe(true);
  });
  it("sweeps fully refilled buckets so memory does not grow", () => {
    let t = 0;
    const limits = createLimits(() => t);
    for (let i = 0; i < 100; i++) limits.join.take(`ip-${i}`);
    expect(limits.join.size).toBe(100);
    sweepLimits(limits);
    expect(limits.join.size).toBe(100); // still draining
    t += 10 * 60_000;
    sweepLimits(limits);
    expect(limits.join.size).toBe(0);
  });
  it("only trusts X-Forwarded-For when told to, and uses the entry the proxy added", () => {
    expect(clientIp({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }, "10.0.0.1", true)).toBe("1.2.3.4");
    expect(clientIp({ "x-forwarded-for": "6.6.6.6" }, "10.0.0.1", false)).toBe("10.0.0.1");
    expect(clientIp({}, "10.0.0.1", true)).toBe("10.0.0.1");
  });
});

describe("blocklist", () => {
  it("blocks listed words in any case, with leetspeak, repeats and spreading", () => {
    for (const bad of ["shit", "SHIT", "sh1t", "$h1t", "shiiit", "f u c k", "you fuck", "Big_Bitch"]) expect(isBlocked(bad), bad).toBe(true);
  });
  it("lets innocent words through, including ones that contain a listed word", () => {
    for (const ok of ["Ann", "Classic", "Scunthorpe", "Dickens fan", "assassin", "Peacock", "hello world", "Ben 2", "Mitochondria"]) {
      expect(isBlocked(ok), ok).toBe(false);
    }
  });
});
