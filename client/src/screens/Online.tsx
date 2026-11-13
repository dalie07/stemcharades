import { useState } from "react";
import { createRoom, joinRoom } from "../state/socket";
import { useGameStore } from "../state/gameStore";

const input = "w-full rounded border border-slate-300 px-3 py-3";
const primary = "w-full rounded-lg bg-indigo-600 px-4 py-3 font-medium text-white disabled:opacity-40";

export function Online() {
  const notice = useGameStore((s) => s.notice);
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ ok: true } | { ok: false; message: string }>) {
    setBusy(true);
    setError(null);
    const res = await action();
    setBusy(false);
    if (res.ok) {
      useGameStore.setState({ notice: null });
      location.hash = "#/room";
    } else setError(res.message);
  }

  const nameOk = nickname.trim().length >= 2;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-3xl font-bold">Online room</h1>
      {notice && <p role="status" className="rounded bg-amber-100 px-3 py-2 text-sm">{notice}</p>}
      <label className="w-full text-left">
        Your nickname
        <input className={input} maxLength={20} value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </label>
      <button className={primary} disabled={!nameOk || busy} onClick={() => run(() => createRoom(nickname.trim()))}>
        Create a room
      </button>

      <p className="text-slate-600">or join a friend's room</p>
      <label className="w-full text-left">
        Room code
        <input
          className={`${input} text-center text-2xl uppercase tracking-widest`}
          maxLength={5}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
      </label>
      <button
        className={primary}
        disabled={!nameOk || code.length !== 5 || busy}
        onClick={() => run(() => joinRoom(code, nickname.trim()))}
      >
        Join room
      </button>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <a className="text-indigo-600 underline" href="#/">Back</a>
    </main>
  );
}
