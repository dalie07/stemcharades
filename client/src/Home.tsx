import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { refreshMe } from "./state/account";
import { useGameStore } from "./state/gameStore";
import {
  EVENTS,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@stemcharades/shared";

type Status = "connecting" | "connected" | "disconnected";

export function Home() {
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [reply, setReply] = useState<string | null>(null);
  const notice = useGameStore((s) => s.notice);
  const me = useGameStore((s) => s.me);
  const dismiss = () => useGameStore.setState({ notice: null });
  const signInFailed = location.hash.includes("signin=failed");
  useEffect(() => {
    void refreshMe();
  }, []);

  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io();
    socketRef.current = socket;
    socket.on("connect", () => setStatus("connected"));
    socket.on("disconnect", () => setStatus("disconnected"));
    socket.on(EVENTS.pong, (p) =>
      setReply(`"${p.message}" echoed at ${new Date(p.serverTime).toLocaleTimeString()}`),
    );
    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-3xl font-bold">STEMCHARADES</h1>
      <p className="text-slate-600">Explain it without saying it.</p>
      <a className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-medium text-white" href="#/party" onClick={dismiss}>
        Party mode · one phone
      </a>
      <a className="w-full rounded-lg bg-slate-800 px-4 py-3 font-medium text-white" href="#/online" onClick={dismiss}>
        Online room · play with friends
      </a>
      {notice && <p role="status" className="rounded bg-amber-100 px-3 py-2 text-sm">{notice}</p>}
      {signInFailed && <p role="alert" className="rounded bg-amber-100 px-3 py-2 text-sm">Sign-in did not work. You can try again, or just play as a guest.</p>}
      {me?.authEnabled && (
        <p className="text-sm text-slate-600">
          {me.user ? (
            <>Signed in as <strong>{me.user.displayName}</strong> · <a className="underline" href="#/me" onClick={dismiss}>My account</a></>
          ) : (
            <a className="underline" href="#/me" onClick={dismiss}>Sign in (optional) to save your games</a>
          )}
        </p>
      )}
      <a className="text-sm text-slate-600 underline" href="#/cards" onClick={dismiss}>Browse cards</a>

      <details className="mt-6 text-sm text-slate-600">
        <summary>Server connection · {status}</summary>
        <button
          className="mt-2 rounded border px-3 py-1 disabled:opacity-50"
          disabled={status !== "connected"}
          onClick={() => socketRef.current?.emit(EVENTS.ping, { message: "hello" })}
        >
          Send ping
        </button>
        {reply && <p aria-live="polite">{reply}</p>}
      </details>
    </main>
  );
}
