import { useEffect, useState } from "react";
import { SUBJECTS, type Card as CardData } from "@stemcharades/shared";
import { Card } from "../components/Card";
import {
  createParty,
  currentPlayer,
  filterPool,
  gotIt,
  missedCards,
  nextTurn,
  skip,
  startTurn,
  tick,
  totalTurns,
  type Level,
  type PartySettings,
  type PartyState,
} from "../party/partyEngine";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; cards: CardData[] };

async function fetchAllCards(): Promise<CardData[]> {
  const parts = await Promise.all(
    SUBJECTS.map(async (s) => {
      const r = await fetch(`/api/decks/${s.toLowerCase()}/cards`);
      if (!r.ok) throw new Error("bad response");
      return (await r.json()) as CardData[];
    }),
  );
  return parts.flat();
}

const btn = "rounded-lg px-4 py-3 font-medium disabled:opacity-40";

export function Party() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [state, setState] = useState<PartyState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    fetchAllCards()
      .then((cards) => setLoad({ status: "ready", cards }))
      .catch(() => setLoad({ status: "error" }));
  }, []);

  // Drive the timer; the engine itself never reads the clock.
  useEffect(() => {
    if (state?.phase !== "playing") return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setState((s) => (s ? tick(s, t) : s));
    }, 250);
    return () => clearInterval(id);
  }, [state?.phase]);

  if (load.status === "loading") return <Shell>Loading cards…</Shell>;
  if (load.status === "error")
    return (
      <Shell>
        <p role="alert">Couldn't load cards. Connect once to download them for offline play.</p>
        <a className="text-indigo-600 underline" href="#/">Back</a>
      </Shell>
    );

  if (!state) {
    return <Setup cards={load.cards} onStart={(s) => setState(createParty(s, load.cards))} />;
  }

  if (state.phase === "ready") {
    return (
      <Shell>
        <p className="text-slate-600">
          Turn {state.turnIndex + 1} of {totalTurns(state.settings)}
        </p>
        <h1 className="text-3xl font-bold">Pass the phone to {currentPlayer(state)}</h1>
        <p className="text-slate-600">Only the explainer looks at the screen. {state.settings.roundSeconds}s on the clock.</p>
        <button className={`${btn} bg-indigo-600 text-white`} onClick={() => setState(startTurn(state, Date.now()))}>
          I'm ready – start
        </button>
      </Shell>
    );
  }

  if (state.phase === "playing" && state.currentCard) {
    const left = Math.max(0, Math.ceil(((state.endsAt ?? now) - now) / 1000));
    const got = state.turnResults.filter((r) => r.outcome === "got").length;
    return (
      <Shell>
        <div className="flex w-full items-center justify-between">
          <span className="font-medium">{currentPlayer(state)}</span>
          <span className={`text-3xl font-bold tabular-nums ${left <= 10 ? "text-red-600" : ""}`} role="timer">
            {left}s
          </span>
          <span>Got: {got}</span>
        </div>
        <Card card={state.currentCard} />
        <div className="grid w-full grid-cols-2 gap-3">
          <button className={`${btn} bg-slate-200`} onClick={() => setState(skip(state, Date.now()))}>
            Skip
          </button>
          <button className={`${btn} bg-green-700 text-white`} onClick={() => setState(gotIt(state, Date.now()))}>
            Got it
          </button>
        </div>
      </Shell>
    );
  }

  if (state.phase === "reveal") {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">Time's up, {currentPlayer(state)}</h1>
        <p>
          +{state.turnResults.filter((r) => r.outcome === "got").length * 5} points
        </p>
        <ul className="w-full space-y-3">
          {state.turnResults.map((r, i) => (
            <li key={i}>
              <p className="text-left text-sm font-medium">
                {r.outcome === "got" ? "✓ Got it" : r.outcome === "skipped" ? "↷ Skipped" : "⏱ Out of time"}
              </p>
              <Card card={r.card} reveal />
            </li>
          ))}
        </ul>
        <button className={`${btn} bg-indigo-600 text-white`} onClick={() => setState(nextTurn(state))}>
          Continue
        </button>
      </Shell>
    );
  }

  // summary
  const missed = missedCards(state);
  const order = state.settings.players
    .map((name, i) => ({ name, score: state.scores[i] ?? 0 }))
    .sort((a, b) => b.score - a.score);
  return (
    <Shell>
      <h1 className="text-3xl font-bold">Final scores</h1>
      <ol className="w-full space-y-1">
        {order.map((p, i) => (
          <li key={p.name} className="flex justify-between rounded bg-slate-100 px-3 py-2">
            <span>{i + 1}. {p.name}</span>
            <span className="font-semibold">{p.score}</span>
          </li>
        ))}
      </ol>
      <h2 className="text-xl font-semibold">Cards to revise ({missed.length})</h2>
      {missed.length === 0 && <p>You got every card. Nice.</p>}
      <ul className="w-full space-y-3">
        {missed.map((c) => (
          <li key={c.id}>
            <Card card={c} reveal />
          </li>
        ))}
      </ul>
      <button className={`${btn} bg-indigo-600 text-white`} onClick={() => setState(null)}>
        Play again
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center gap-4 p-4 text-center">
      {children}
    </main>
  );
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function Setup({ cards, onStart }: { cards: CardData[]; onStart: (s: PartySettings) => void }) {
  const [players, setPlayers] = useState(["Player 1", "Player 2"]);
  const [subjects, setSubjects] = useState<CardData["subject"][]>([...SUBJECTS]);
  const [levels, setLevels] = useState<Level[]>([1, 2, 3]);
  const [roundSeconds, setRoundSeconds] = useState<60 | 90>(60);
  const [rounds, setRounds] = useState(1);

  const names = players.map((p) => p.trim());
  const count = filterPool(cards, { subjects, levels }).length;
  const valid = names.length >= 2 && names.every(Boolean) && new Set(names).size === names.length && count > 0;

  return (
    <Shell>
      <h1 className="text-3xl font-bold">Party mode</h1>
      <p className="text-slate-600">One phone, passed around the room. Works offline.</p>

      <fieldset className="w-full space-y-2 text-left">
        <legend className="font-medium">Players</legend>
        {players.map((p, i) => (
          <div key={i} className="flex gap-2">
            <input
              aria-label={`Player ${i + 1} name`}
              className="w-full rounded border border-slate-300 px-3 py-3"
              maxLength={20}
              value={p}
              onChange={(e) => setPlayers(players.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {players.length > 2 && (
              <button aria-label={`Remove ${p}`} onClick={() => setPlayers(players.filter((_, j) => j !== i))}>
                ✕
              </button>
            )}
          </div>
        ))}
        {players.length < 12 && (
          <button className="text-indigo-600" onClick={() => setPlayers([...players, `Player ${players.length + 1}`])}>
            + Add player
          </button>
        )}
      </fieldset>

      <fieldset className="w-full text-left">
        <legend className="font-medium">Subjects</legend>
        <div className="flex flex-wrap gap-3">
          {SUBJECTS.map((s) => (
            <label key={s} className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={subjects.includes(s)} onChange={() => setSubjects(toggle(subjects, s))} />
              {s}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="w-full text-left">
        <legend className="font-medium">Difficulty</legend>
        <div className="flex gap-4">
          {([1, 2, 3] as Level[]).map((l) => (
            <label key={l} className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={levels.includes(l)} onChange={() => setLevels(toggle(levels, l))} />
              {l === 1 ? "School" : l === 2 ? "University" : "Advanced"}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex w-full gap-4 text-left">
        <label className="flex-1">
          Round length
          <select
            className="mt-1 w-full rounded border border-slate-300 px-2 py-2"
            value={roundSeconds}
            onChange={(e) => setRoundSeconds(Number(e.target.value) as 60 | 90)}
          >
            <option value={60}>60 seconds</option>
            <option value={90}>90 seconds</option>
          </select>
        </label>
        <label className="flex-1">
          Rounds
          <select
            className="mt-1 w-full rounded border border-slate-300 px-2 py-2"
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-sm text-slate-600">
        {count} matching cards{count === 0 ? " – pick at least one subject and level" : ""}
      </p>
      <button
        className={`${btn} w-full bg-indigo-600 text-white`}
        disabled={!valid}
        onClick={() => onStart({ players: names, subjects, levels, roundSeconds, rounds })}
      >
        Start game
      </button>
      <a className="text-indigo-600 underline" href="#/">Back</a>
    </Shell>
  );
}
