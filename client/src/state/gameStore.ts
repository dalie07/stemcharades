import { create } from "zustand";
import type { GuessResultPayload, RoomView } from "@stemcharades/shared";

export interface Session {
  code: string;
  playerId: string;
  sessionToken: string;
}

export interface Me {
  /** False when the server has no database or sign-in providers: the game works exactly as before. */
  authEnabled: boolean;
  providers: { id: string; label: string }[];
  user: { id: string; displayName: string } | null;
}

export type Connection = "connecting" | "connected" | "disconnected";

interface GameStore {
  connection: Connection;
  session: Session | null;
  /** The room view the server last sent. The client never computes game state itself. */
  room: RoomView | null;
  /** Who is signed in, or null until the first check completes. Guests simply have no user. */
  me: Me | null;
  /** One-shot message shown on the home screen (e.g. the room expired). */
  notice: string | null;
  /** Why the explainer's last clue was refused. Seen by the explainer only. */
  clueNotice: string | null;
  /** Result of this player's latest guess this round (correct / close / wrong). */
  guessFeedback: GuessResultPayload | null;
  /** The last action error from the server (e.g. "need two players"). */
  actionError: string | null;
  /** Server clock minus client clock, so countdowns are right even if the phone's clock is off. */
  clockOffset: number;
}

// sessionStorage, not localStorage: survives a refresh but keeps two tabs as two separate players.
const KEY = "stemcharades.session";

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export const useGameStore = create<GameStore>(() => ({
  connection: "connecting",
  // A refresh must start from the saved seat, or the lobby would bounce us to the home screen.
  session: loadSession(),
  room: null,
  me: null,
  notice: null,
  clueNotice: null,
  guessFeedback: null,
  actionError: null,
  clockOffset: 0,
}));

export function saveSession(session: Session | null): void {
  try {
    if (session) sessionStorage.setItem(KEY, JSON.stringify(session));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the player simply can't rejoin after a refresh */
  }
  useGameStore.setState({ session });
}
