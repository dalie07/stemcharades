import { useEffect, useState } from "react";
import { SUBJECTS, type RoomSettings, type RoomView } from "@stemcharades/shared";
import { api, type DeckSummary } from "../state/account";
import { useGameStore, type Session } from "../state/gameStore";
import { configureRoom, kickPlayer, leaveRoom, selectDeck, startGame } from "../state/socket";

const toggle = <T,>(list: T[], item: T): T[] => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

export function Lobby({ room, session }: { room: RoomView; session: Session }) {
  const { connection, actionError, me } = useGameStore();
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const isHost = room.hostId === session.playerId;
  const canUseDecks = isHost && Boolean(me?.user);
  useEffect(() => {
    if (canUseDecks) void api.decks().then((r) => r.ok && setDecks(r.data));
  }, [canUseDecks]);
  const s = room.settings;
  const update = (patch: Partial<RoomSettings>) => {
    const next = { ...s, ...patch };
    // Keep at least one subject and one level selected.
    if (next.subjects.length && next.levels.length) configureRoom(next);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center gap-4 p-4 text-center">
      {connection !== "connected" && (
        <p role="status" className="w-full rounded bg-amber-900 px-3 py-2 text-sm">Reconnecting…</p>
      )}
      <p className="text-slate-400">Room code</p>
      <h1 className="text-5xl font-bold tracking-widest" aria-label={`Room code ${room.code.split("").join(" ")}`}>
        {room.code}
      </h1>

      <section className="w-full text-left">
        <h2 className="font-medium">Players ({room.players.length}/12)</h2>
        <ul className="mt-1 space-y-1">
          {room.players.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded bg-slate-800 px-3 py-2">
              <span>
                <span aria-label={p.connected ? "online" : "offline"} className={p.connected ? "text-green-500" : "text-slate-400"}>●</span>{" "}
                {p.nickname}
                {p.id === session.playerId && " (you)"}
              </span>
              {p.isHost && <span className="text-xs font-medium text-indigo-300">HOST</span>}
              {isHost && !p.isHost && (
                <button
                  className="min-h-11 min-w-11 rounded text-red-400 underline"
                  aria-label={`Remove ${p.nickname} from the room`}
                  onClick={() => {
                    if (confirm(`Remove ${p.nickname} from the room?`)) kickPlayer(p.id);
                  }}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {room.customDeck && (
        <p className="w-full rounded bg-indigo-950 px-3 py-2 text-left text-indigo-100">
          Playing the private deck <strong>{room.customDeck.name}</strong> ({room.customDeck.count} cards)
        </p>
      )}
      {canUseDecks && decks.length > 0 && (
        <label className="w-full text-left">
          Card deck
          <select
            className="mt-1 w-full rounded border border-slate-600 px-2 py-3"
            value={decks.find((d) => d.name === room.customDeck?.name)?.id ?? ""}
            onChange={(e) => selectDeck(e.target.value || null)}
          >
            <option value="">Built-in cards</option>
            {decks.filter((d) => d.cards > 0).map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.cards})</option>
            ))}
          </select>
        </label>
      )}

      <section className="w-full space-y-3 text-left">
        <h2 className="font-medium">Game settings {!isHost && <span className="text-sm font-normal text-slate-400">(host only)</span>}</h2>
        <fieldset disabled={!isHost} className="space-y-3">
          {!room.customDeck && (<>
          <div className="flex flex-wrap gap-3">
            {SUBJECTS.map((sub) => (
              <label key={sub} className="flex min-h-11 items-center gap-2">
                <input type="checkbox" checked={s.subjects.includes(sub)} onChange={() => update({ subjects: toggle(s.subjects, sub) })} />
                {sub}
              </label>
            ))}
          </div>
          <div className="flex gap-4">
            {([1, 2, 3] as const).map((l) => (
              <label key={l} className="flex min-h-11 items-center gap-2">
                <input type="checkbox" checked={s.levels.includes(l)} onChange={() => update({ levels: toggle(s.levels, l) })} />
                {l === 1 ? "School" : l === 2 ? "University" : "Advanced"}
              </label>
            ))}
          </div>
          </>)}
          <div className="flex gap-4">
            <label className="flex-1">
              Round length
              <select className="mt-1 w-full rounded border border-slate-600 px-2 py-2" value={s.roundSeconds} onChange={(e) => update({ roundSeconds: Number(e.target.value) as 60 | 90 })}>
                <option value={60}>60 seconds</option>
                <option value={90}>90 seconds</option>
              </select>
            </label>
            <label className="flex-1">
              Rounds
              <select className="mt-1 w-full rounded border border-slate-600 px-2 py-2" value={s.rounds} onChange={(e) => update({ rounds: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>
      </section>

      {actionError && <p role="alert" className="text-red-400">{actionError}</p>}
      <button
        className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-medium text-white disabled:opacity-40"
        disabled={!isHost || room.players.filter((p) => p.connected).length < 2}
        onClick={startGame}
      >
        Start game
      </button>
      {isHost && room.players.filter((p) => p.connected).length < 2 && (
        <p className="text-sm text-slate-400">Waiting for at least one more player.</p>
      )}
      {!isHost && <p className="text-sm text-slate-400">Waiting for the host to start.</p>}
      <button
        className="text-indigo-400 underline"
        onClick={() => {
          leaveRoom();
          location.hash = "#/";
        }}
      >
        Leave room
      </button>
    </main>
  );
}
