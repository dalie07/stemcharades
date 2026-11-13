import { nicknameSchema } from "@stemcharades/shared";
import { isBlocked } from "../game/blocklist.js";

export type FetchFn = typeof fetch;

export interface Provider {
  id: "github" | "google";
  label: string;
  authUrl: string;
  tokenUrl: string;
  userUrl: string;
  scope: string;
  clientId: string;
  clientSecret: string;
}

/** Providers are switched on by their credentials being present. */
export function loadProviders(env: NodeJS.ProcessEnv): Provider[] {
  const out: Provider[] = [];
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    out.push({
      id: "github",
      label: "GitHub",
      authUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      userUrl: "https://api.github.com/user",
      scope: "read:user", // no email scope: we never ask for or store an email
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    });
  }
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    out.push({
      id: "google",
      label: "Google",
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userUrl: "https://openidconnect.googleapis.com/v1/userinfo",
      scope: "openid profile", // profile only, no email
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    });
  }
  return out;
}

/** A safe display name: allowed characters, 2 to 20 long, nothing rude. Falls back to "Player". */
export function cleanDisplayName(raw: unknown): string {
  const cleaned = String(raw ?? "")
    .replace(/[^\p{L}\p{N} _.'-]/gu, "")
    .trim()
    .slice(0, 20);
  return nicknameSchema.safeParse(cleaned).success && !isBlocked(cleaned) ? cleaned : "Player";
}

export interface ProviderUser {
  subject: string;
  displayName: string;
}

/** Trade the one-time code for the signed-in user's id and display name. Throws on any failure. */
export async function exchangeCode(p: Provider, code: string, redirectUri: string, fetchFn: FetchFn = fetch): Promise<ProviderUser> {
  const body = new URLSearchParams({
    client_id: p.clientId,
    client_secret: p.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const tokenRes = await fetchFn(p.tokenUrl, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) throw new Error(`token endpoint ${tokenRes.status}`);
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("no access token");

  const userRes = await fetchFn(p.userUrl, {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/json", "User-Agent": "stem-game" },
  });
  if (!userRes.ok) throw new Error(`user endpoint ${userRes.status}`);
  const u = (await userRes.json()) as Record<string, unknown>;

  if (p.id === "github") {
    // The login handle is a public username, unlike the real name field.
    if (u.id === undefined) throw new Error("no github id");
    return { subject: String(u.id), displayName: cleanDisplayName(u.login) };
  }
  if (typeof u.sub !== "string") throw new Error("no google subject");
  return { subject: u.sub, displayName: cleanDisplayName(u.given_name) };
}
