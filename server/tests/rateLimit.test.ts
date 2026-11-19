import { describe, expect, it } from "vitest";
import { RateLimiter, clientIp, createLimits, limitKey, sweepLimits } from "../src/realtime/rateLimit.js";
import { sameOrigin } from "../src/app.js";
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

describe("per-address keys", () => {
  it("use IPv4 as it is, unwrap IPv4-mapped IPv6, and group IPv6 by its /64", () => {
    expect(limitKey("1.2.3.4")).toBe("1.2.3.4");
    expect(limitKey("::ffff:1.2.3.4")).toBe("1.2.3.4");
    expect(limitKey(undefined)).toBe("unknown");
    const key = "2001:db8:1:2::/64";
    for (const ip of ["2001:db8:1:2::1", "2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd", "2001:DB8:1:2:ffff::9", "2001:db8:1:2::1%eth0"]) {
      expect(limitKey(ip), ip).toBe(key);
    }
    expect(limitKey("2001:db8:1:3::1")).not.toBe(key);
    expect(limitKey("::1")).toBe("0:0:0:0::/64");
  });
});

describe("socket origin check", () => {
  it("allows no Origin or the same host, and refuses any other", () => {
    expect(sameOrigin(undefined, "game.example")).toBe(true);
    expect(sameOrigin("https://game.example", "game.example")).toBe(true);
    expect(sameOrigin("http://localhost:5173", "localhost:5173")).toBe(true);
    expect(sameOrigin("https://evil.example", "game.example")).toBe(false);
    expect(sameOrigin("https://game.example.evil.example", "game.example")).toBe(false);
    expect(sameOrigin("garbage", "game.example")).toBe(false);
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
