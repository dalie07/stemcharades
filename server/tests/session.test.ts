import { describe, expect, it } from "vitest";
import { createSessionToken, parseCookies, readSessionToken, SESSION_TTL_S, sign, unsign, userIdFromCookies } from "../src/auth/session.js";

const SECRET = "test-secret-that-is-long-enough";
const USER = "7f9c1a52-1b2e-4c3d-8e9f-0a1b2c3d4e5f";

describe("signed values", () => {
  it("round-trip, and reject tampering or the wrong secret", () => {
    const signed = sign("hello", SECRET);
    expect(unsign(signed, SECRET)).toBe("hello");
    expect(unsign(signed.replace("hello", "jello"), SECRET)).toBeNull();
    expect(unsign(signed, "another-secret")).toBeNull();
    expect(unsign("no-signature", SECRET)).toBeNull();
    expect(unsign(".", SECRET)).toBeNull();
    expect(unsign(`${signed}x`, SECRET)).toBeNull();
  });
});

describe("session tokens", () => {
  it("identify the user until they expire", () => {
    const t0 = 1_700_000_000_000;
    const token = createSessionToken(USER, SECRET, t0);
    expect(readSessionToken(token, SECRET, t0 + 1000)).toBe(USER);
    expect(readSessionToken(token, SECRET, t0 + (SESSION_TTL_S - 5) * 1000)).toBe(USER);
    expect(readSessionToken(token, SECRET, t0 + (SESSION_TTL_S + 5) * 1000)).toBeNull();
  });
  it("cannot be forged by editing the user id or expiry", () => {
    const token = createSessionToken(USER, SECRET, 1_700_000_000_000);
    const [value, mac] = [token.slice(0, token.lastIndexOf(".")), token.slice(token.lastIndexOf(".") + 1)];
    const other = value.replace(USER, "00000000-0000-4000-8000-000000000000");
    expect(readSessionToken(`${other}.${mac}`, SECRET, 1_700_000_001_000)).toBeNull();
    const forever = `${USER}:99999999999.${mac}`;
    expect(readSessionToken(forever, SECRET, 1_700_000_001_000)).toBeNull();
    expect(readSessionToken(undefined, SECRET)).toBeNull();
    expect(readSessionToken("", SECRET)).toBeNull();
  });
});

describe("cookies", () => {
  it("parse a header with several cookies and encoded values", () => {
    expect(parseCookies("a=1; b=two%20words;c=3")).toEqual({ a: "1", b: "two words", c: "3" });
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies("garbage")).toEqual({});
  });
  it("find the signed-in user, and ignore everything when no secret is configured", () => {
    const token = createSessionToken(USER, SECRET);
    const header = `other=1; sc_session=${encodeURIComponent(token)}`;
    expect(userIdFromCookies(header, SECRET)).toBe(USER);
    expect(userIdFromCookies(header, undefined)).toBeNull();
    expect(userIdFromCookies("sc_session=bogus", SECRET)).toBeNull();
  });
});
