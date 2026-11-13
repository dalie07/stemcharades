import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "sc_session";
export const STATE_COOKIE = "sc_oauth_state";
export const SESSION_TTL_S = 30 * 24 * 3600;

const mac = (value: string, secret: string) => createHmac("sha256", secret).update(value).digest("base64url");

export function sign(value: string, secret: string): string {
  return `${value}.${mac(value, secret)}`;
}

/** The original value if the signature is genuine, otherwise null. Constant-time comparison. */
export function unsign(signed: string, secret: string): string | null {
  const i = signed.lastIndexOf(".");
  if (i < 1) return null;
  const value = signed.slice(0, i);
  const given = Buffer.from(signed.slice(i + 1));
  const expected = Buffer.from(mac(value, secret));
  return given.length === expected.length && timingSafeEqual(given, expected) ? value : null;
}

/** A stateless session: the user id and an expiry, signed. No session table, nothing to clean up. */
export function createSessionToken(userId: string, secret: string, now = Date.now()): string {
  return sign(`${userId}:${Math.floor(now / 1000) + SESSION_TTL_S}`, secret);
}

export function readSessionToken(token: string | undefined, secret: string, now = Date.now()): string | null {
  if (!token) return null;
  const value = unsign(token, secret);
  if (!value) return null;
  const [userId, exp] = value.split(":");
  if (!userId || !exp || Number(exp) * 1000 < now) return null;
  return userId;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function userIdFromCookies(header: string | undefined, secret: string | undefined, now = Date.now()): string | null {
  if (!secret) return null;
  return readSessionToken(parseCookies(header)[SESSION_COOKIE], secret, now);
}

export function setCookie(name: string, value: string, opts: { maxAgeS: number; secure: boolean }): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${opts.maxAgeS}${opts.secure ? "; Secure" : ""}`;
}
