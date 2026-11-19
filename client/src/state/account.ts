import type { Card, CustomCard } from "@stemcharades/shared";
import { useGameStore, type Me } from "./gameStore";

/** Ask the server who is signed in. Never throws: if it fails, the player simply plays as a guest. */
export async function refreshMe(): Promise<Me> {
  let me: Me = { authEnabled: false, providers: [], user: null };
  try {
    const res = await fetch("/api/me");
    if (res.ok) me = (await res.json()) as Me;
  } catch {
    /* offline or asleep: guest play still works */
  }
  useGameStore.setState({ me });
  return me;
}

export async function signOut(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    useGameStore.setState((s) => ({ me: s.me ? { ...s.me, user: null } : s.me }));
  }
}

export interface HistoryRow {
  playedAt: string;
  score: number;
  rank: number;
  roomSize: number;
  rounds: number;
}
export interface DeckSummary {
  id: string;
  name: string;
  cards: number;
}
export interface DeckDetail {
  id: string;
  name: string;
  cards: Card[];
}
export type MissedCard = Card & { lastMissedAt: string };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string };

const MESSAGES: Record<string, string> = {
  invalid_payload: "Something in that was not valid. Check every field.",
  blocked_content: "Please keep it friendly. That text was not accepted.",
  deck_limit: "You have reached the limit of 20 decks.",
  card_limit: "This deck has reached the limit of 200 cards.",
  unauthorized: "Please sign in again.",
  rate_limited: "Slow down a little and try again.",
  unknown_deck: "That deck could not be found.",
};

async function call<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
    if (!res.ok) return { ok: false, message: MESSAGES[json.error ?? ""] ?? "Something went wrong." };
    return { ok: true, data: json };
  } catch {
    return { ok: false, message: "Could not reach the server." };
  }
}

export const api = {
  history: () => call<HistoryRow[]>("GET", "/api/me/history"),
  missed: () => call<MissedCard[]>("GET", "/api/me/missed-cards"),
  decks: () => call<DeckSummary[]>("GET", "/api/me/decks"),
  deck: (id: string) => call<DeckDetail>("GET", `/api/me/decks/${id}`),
  createDeck: (name: string) => call<{ id: string; name: string }>("POST", "/api/me/decks", { name }),
  deleteDeck: (id: string) => call<void>("DELETE", `/api/me/decks/${id}`),
  addCard: (id: string, card: CustomCard) => call<{ id: string }>("POST", `/api/me/decks/${id}/cards`, card),
  deleteCard: (id: string, cardId: string) => call<void>("DELETE", `/api/me/decks/${id}/cards/${cardId}`),
};
