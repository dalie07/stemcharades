import { useEffect } from "react";
import { useGameStore } from "../state/gameStore";
import { connect } from "../state/socket";
import { Lobby } from "./Lobby";
import { Reveal } from "./Reveal";
import { Round } from "./Round";
import { Scoreboard } from "./Scoreboard";

/** Guards the session (a refresh lands here and rejoins on connect) and picks the screen for the phase. */
export function Room() {
  const { room, session, connection, notice } = useGameStore();

  useEffect(() => {
    // A notice means we were just sent away (kicked, room expired, server restarted): show it on the home screen.
    if (!session) location.hash = notice ? "#/" : "#/online";
    else connect();
  }, [session, notice]);

  if (!session) return null;
  if (!room) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center p-4">
        <p role="status">{connection === "connected" ? "Joining room…" : "Reconnecting…"}</p>
      </main>
    );
  }
  // The lobby draws its own banner; every other screen gets this one so a dropped connection is never silent.
  const banner =
    connection !== "connected" && room.phase !== "lobby" ? (
      <p role="status" className="sticky top-0 z-10 bg-amber-900 px-3 py-2 text-center text-sm text-amber-100">
        Connection lost. Reconnecting…
      </p>
    ) : null;
  if (room.phase === "round" && room.round) return <>{banner}<Round room={room} session={session} /></>;
  if (room.phase === "reveal" && room.round && room.reveal) return <>{banner}<Reveal room={room} /></>;
  if (room.phase === "finished" && room.summary) return <>{banner}<Scoreboard room={room} session={session} /></>;
  return <Lobby room={room} session={session} />;
}
