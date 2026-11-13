import { io, type Socket } from "socket.io-client";
import {
  ERROR_MESSAGES,
  EVENTS,
  type ClientToServerEvents,
  type CreateRoomResponse,
  type ErrorCode,
  type JoinAck,
  type RoomSettings,
  type ServerToClientEvents,
} from "@stemcharades/shared";
import { loadSession, saveSession, useGameStore } from "./gameStore";

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({ autoConnect: false });

const setState = useGameStore.setState;

function leaveToHome(message: string) {
  saveSession(null);
  setState({ room: null, notice: message });
  if (location.hash.startsWith("#/room")) location.hash = "#/";
}

/** Ask the server for our old seat. Runs on every (re)connect, so refreshes and network blips both recover. */
function rejoin() {
  const session = loadSession();
  if (!session) return;
  useGameStore.setState({ session });
  socket.emit(EVENTS.join, { code: session.code, sessionToken: session.sessionToken }, (res) => {
    if (res.ok) return;
    // The free server restarts and sleeps, wiping every room. Say so plainly and go home.
    const gone = res.error === "unknown_room" || res.error === "bad_session";
    leaveToHome(
      gone
        ? "The server restarted or the room expired, so that game has ended. Start a new room to keep playing."
        : ERROR_MESSAGES[res.error],
    );
  });
}

socket.on("connect", () => {
  setState({ connection: "connected" });
  rejoin();
});
socket.on("disconnect", () => setState({ connection: "disconnected" }));
socket.on(EVENTS.state, (room) =>
  setState((prev) => ({
    room,
    actionError: null,
    // A new round or phase clears the explainer's old rejection message.
    clueNotice: prev.room?.phase === room.phase && prev.room.round?.number === room.round?.number ? prev.clueNotice : null,
    guessFeedback: prev.room?.round?.number === room.round?.number ? prev.guessFeedback : null,
    clockOffset: room.round ? room.round.serverNow - Date.now() : prev.clockOffset,
  })),
);
socket.on(EVENTS.guessResult, (g) => setState({ guessFeedback: g }));
socket.on(EVENTS.clueRejected, (r) =>
  setState({
    clueNotice:
      r.reason === "contains_answer"
        ? `Not allowed: that gives away the answer ("${r.word}").`
        : `Not allowed: "${r.word}" is a forbidden word.`,
  }),
);
socket.on(EVENTS.error, (e) => {
  // The room vanished under us (expired). Other errors are transient and handled by the caller.
  if (e.code === "unknown_room" || e.code === "kicked") leaveToHome(e.message);
  else setState({ actionError: e.message });
});

export function connect() {
  if (!socket.connected && !socket.active) socket.connect();
}

function whenConnected(): Promise<void> {
  connect();
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve) => socket.once("connect", () => resolve()));
}

export type ActionResult = { ok: true } | { ok: false; message: string };
const failure = (code: ErrorCode | "network"): ActionResult => ({
  ok: false,
  message: code === "network" ? "Couldn't reach the server. Try again." : ERROR_MESSAGES[code],
});

export async function createRoom(nickname: string): Promise<ActionResult> {
  let res: Response;
  try {
    res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nickname }),
    });
  } catch {
    return failure("network");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: ErrorCode };
    return failure(body.error ?? "invalid_payload");
  }
  const created = (await res.json()) as CreateRoomResponse;
  saveSession({ code: created.code, playerId: created.playerId, sessionToken: created.sessionToken });
  // Connecting triggers rejoin(), which seats the host.
  await whenConnected();
  if (socket.connected) rejoin();
  return { ok: true };
}

export async function joinRoom(code: string, nickname: string): Promise<ActionResult> {
  await whenConnected();
  const res = await new Promise<JoinAck>((resolve) =>
    socket.emit(EVENTS.join, { code, nickname }, resolve),
  );
  if (!res.ok) return failure(res.error);
  if (res.sessionToken) saveSession({ code: code.trim().toUpperCase(), playerId: res.playerId, sessionToken: res.sessionToken });
  return { ok: true };
}

export function configureRoom(settings: RoomSettings) {
  socket.emit(EVENTS.configure, settings);
}

export function leaveRoom() {
  socket.emit(EVENTS.leave);
  saveSession(null);
  setState({ room: null });
}

export function startGame() {
  socket.emit(EVENTS.start);
}

export function sendClue(text: string) {
  setState({ clueNotice: null });
  socket.emit(EVENTS.clue, { text });
}

export function skipRound() {
  socket.emit(EVENTS.skip);
}

export function sendGuess(text: string) {
  socket.emit(EVENTS.guess, { text });
}

export function kickPlayer(playerId: string) {
  socket.emit(EVENTS.kick, { playerId });
}

/** Choose a private deck (or null for the built-in cards). Only a signed-in host can. */
export function selectDeck(deckId: string | null) {
  socket.emit(EVENTS.deck, { deckId });
}
