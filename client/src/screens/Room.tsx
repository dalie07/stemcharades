import { useEffect } from "react";
import { Screen } from "../components/ui";
import { useGameStore } from "../state/gameStore";
import { connect } from "../state/socket";
import { Lobby } from "./Lobby";
import { Reveal } from "./Reveal";
import { Round } from "./Round";
import { Scoreboard } from "./Scoreboard";

/**
 * The online game. Guards the session (a refresh lands here and rejoins on connect) and shows the screen
 * for the phase the server says the room is in. The client never decides the phase itself.
 */
export function Room() {
  const { room, session, connection, notice } = useGameStore();

  useEffect(() => {
    // A notice means we were just sent away (removed, room expired, server restarted): show it on the home screen.
    if (!session) location.hash = notice ? "#/" : "#/online";
    else connect();
  }, [session, notice]);

  if (!session) return null;
  if (!room) {
    return (
      <Screen centered>
        <p role="status">{connection === "connected" ? "Joining room…" : "Reconnecting…"}</p>
      </Screen>
    );
  }

  return (
    <>
      {connection !== "connected" && (
        <p role="status" className="sticky top-0 z-10 bg-amber-900 px-3 py-2 text-center text-sm text-amber-100">
          Connection lost. Reconnecting…
        </p>
      )}
      {room.phase === "round" && room.round ? (
        <Round room={room} session={session} />
      ) : room.phase === "reveal" && room.round && room.reveal ? (
        <Reveal room={room} />
      ) : room.phase === "finished" && room.summary ? (
        <Scoreboard room={room} session={session} />
      ) : (
        <Lobby room={room} session={session} />
      )}
    </>
  );
}
