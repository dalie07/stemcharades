import { randomBytes, timingSafeEqual } from "node:crypto";
import express, { type Request, type Router } from "express";
import { exchangeCode, type FetchFn, type Provider } from "../auth/providers.js";
import { createSessionToken, parseCookies, SESSION_COOKIE, SESSION_TTL_S, setCookie, STATE_COOKIE } from "../auth/session.js";
import type { Db } from "../db/repo.js";
import { upsertUser } from "../db/repo.js";
import { limitKey, type Limits } from "../realtime/rateLimit.js";

export interface AuthDeps {
  db: Db;
  providers: Provider[];
  secret: string;
  limits: Limits;
  /** Public origin, e.g. https://stemcharades.onrender.com. Falls back to the request's own host. */
  publicUrl?: string;
  fetchFn?: FetchFn;
}

const secure = (req: Request) => req.secure || req.headers["x-forwarded-proto"] === "https";
const origin = (req: Request, publicUrl?: string) => publicUrl?.replace(/\/$/, "") ?? `${req.protocol}://${req.get("host")}`;

/** Sign in with an OAuth provider. We keep an id and a display name, never an email or a password. */
export function authRouter(d: AuthDeps): Router {
  const router = express.Router();
  const find = (id: string) => d.providers.find((p) => p.id === id);

  router.get("/:provider", (req, res) => {
    if (!d.limits.probe.take(limitKey(req.ip))) return void res.status(429).json({ error: "rate_limited" });
    const p = find(req.params.provider ?? "");
    if (!p) return void res.status(404).json({ error: "unknown_provider" });
    const state = randomBytes(16).toString("hex");
    const url = new URL(p.authUrl);
    url.searchParams.set("client_id", p.clientId);
    url.searchParams.set("redirect_uri", `${origin(req, d.publicUrl)}/api/auth/${p.id}/callback`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", p.scope);
    url.searchParams.set("state", state);
    // The state cookie ties the callback to the browser that started the sign-in (CSRF protection).
    res.setHeader("Set-Cookie", setCookie(STATE_COOKIE, state, { maxAgeS: 600, secure: secure(req) }));
    res.redirect(302, url.toString());
  });

  router.get("/:provider/callback", async (req, res) => {
    if (!d.limits.probe.take(limitKey(req.ip))) return void res.status(429).json({ error: "rate_limited" });
    const p = find(req.params.provider ?? "");
    if (!p) return void res.status(404).json({ error: "unknown_provider" });

    const state = typeof req.query.state === "string" ? req.query.state : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const saved = parseCookies(req.headers.cookie)[STATE_COOKIE] ?? "";
    const ok = state.length > 0 && state.length === saved.length && timingSafeEqual(Buffer.from(state), Buffer.from(saved));
    const clearState = setCookie(STATE_COOKIE, "", { maxAgeS: 0, secure: secure(req) });
    if (!ok || !code) {
      res.setHeader("Set-Cookie", clearState);
      return void res.redirect(302, "/#/?signin=failed");
    }
    try {
      const info = await exchangeCode(p, code, `${origin(req, d.publicUrl)}/api/auth/${p.id}/callback`, d.fetchFn);
      const user = await upsertUser(d.db, { provider: p.id, subject: info.subject, displayName: info.displayName });
      res.setHeader("Set-Cookie", [
        clearState,
        setCookie(SESSION_COOKIE, createSessionToken(user.id, d.secret), { maxAgeS: SESSION_TTL_S, secure: secure(req) }),
      ]);
      res.redirect(302, "/#/me"); // a fixed destination: never a redirect to a URL the caller supplied
    } catch (err) {
      console.error("sign-in failed", err instanceof Error ? err.message : err);
      res.setHeader("Set-Cookie", clearState);
      res.redirect(302, "/#/?signin=failed");
    }
  });

  router.post("/logout", (req, res) => {
    res.setHeader("Set-Cookie", setCookie(SESSION_COOKIE, "", { maxAgeS: 0, secure: secure(req) }));
    res.status(204).end();
  });

  return router;
}
