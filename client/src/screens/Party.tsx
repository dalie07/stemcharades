import { useEffect, useState } from "react";
import { SUBJECTS, explainerPoints, type Card as CardData, type Level } from "@stemcharades/shared";
import { Card } from "../components/Card";
import { DeckFilterFields, RoundFields } from "../components/GameSettingsFields";
import { Timer } from "../components/Timer";
import { Button, LinkButton, Notice, ScoreList, Screen, TextLink, inputClass, mutedClass } from "../components/ui";
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
  type Outcome,
  type PartySettings,
  type PartyState,
} from "../party/partyEngine";

const MAX_PLAYERS = 12;

const OUTCOME: Record<Outcome, string> = {
  got: "✓ Got it",
  skipped: "↷ Skipped",
  timeout: "⏱ Out of time",
};

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; cards: CardData[] };

/** Every deck. The service worker caches these responses, which is what lets Party mode run offline. */
async function fetchAllCards(): Promise<CardData[]> {
  const decks = await Promise.all(
    SUBJECTS.map(async (subject) => {
      const res = await fetch(`/api/decks/${subject.toLowerCase()}/cards`);
      if (!res.ok) throw new Error(`deck request failed: ${res.status}`);
      return (await res.json()) as CardData[];
    }),
  );
  return decks.flat();
}

/** One phone passed around the room. The rules run in the browser (see `partyEngine`), with no server. */
export function Party() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [state, setState] = useState<PartyState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    fetchAllCards()
      .then((cards) => setLoad({ status: "ready", cards }))
      .catch(() => setLoad({ status: "error" }));
  }, []);

  // Drive the timer. The engine itself never reads the clock: it is told the time.
  const playing = state?.phase === "playing";
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const time = Date.now();
      setNow(time);
      setState((s) => (s ? tick(s, time) : s));
    }, 250);
    return () => clearInterval(id);
  }, [playing]);

  if (load.status === "loading") return <Screen centered>Loading cards…</Screen>;
  if (load.status === "error") {
    return (
      <Screen centered>
        <Notice tone="error">Couldn't load the cards. Connect once to download them for offline play.</Notice>
        <TextLink href="#/">Back</TextLink>
      </Screen>
    );
  }
  if (!state) return <Setup cards={load.cards} onStart={(settings) => setState(createParty(settings, load.cards))} />;

  const player = currentPlayer(state);
  const gotCount = state.turnResults.filter((r) => r.outcome === "got").length;

  if (state.phase === "ready") {
    return (
      <Screen centered>
        <p className={mutedClass}>
          Turn {state.turnIndex + 1} of {totalTurns(state.settings)}
        </p>
        <h1 className="text-3xl font-bold">Pass the phone to {player}</h1>
        <p className={mutedClass}>Only the explainer looks at the screen. {state.settings.roundSeconds}s on the clock.</p>
        <Button onClick={() => setState(startTurn(state, Date.now()))}>I'm ready – start</Button>
      </Screen>
    );
  }

  if (state.phase === "playing" && state.currentCard) {
    const secondsLeft = Math.max(0, Math.ceil(((state.endsAt ?? now) - now) / 1000));
    return (
      <Screen>
        <div className="flex w-full items-center justify-between">
          <span className="font-medium">{player}</span>
          <Timer seconds={secondsLeft} />
          <span>Got: {gotCount}</span>
        </div>
        <Card card={state.currentCard} />
        <div className="grid w-full grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setState(skip(state, Date.now()))}>
            Skip
          </Button>
          <Button variant="success" onClick={() => setState(gotIt(state, Date.now()))}>
            Got it
          </Button>
        </div>
      </Screen>
    );
  }

  if (state.phase === "reveal") {
    return (
      <Screen>
        <h1 className="text-2xl font-bold">Time's up, {player}</h1>
        <p>+{explainerPoints(gotCount)} points</p>
        <ul className="w-full space-y-3">
          {state.turnResults.map((result, i) => (
            <li key={i}>
              <p className="text-left text-sm font-medium">{OUTCOME[result.outcome]}</p>
              <Card card={result.card} reveal />
            </li>
          ))}
        </ul>
        <Button onClick={() => setState(nextTurn(state))}>Continue</Button>
      </Screen>
    );
  }

  const missed = missedCards(state);
  const standings = state.settings.players
    .map((name, i) => ({ name, score: state.scores[i] ?? 0 }))
    .sort((a, b) => b.score - a.score);
  return (
    <Screen>
      <h1 className="text-3xl font-bold">Final scores</h1>
      <ScoreList
        label="Final standings"
        rows={standings.map((p, i) => ({ key: p.name, name: `${i + 1}. ${p.name}`, score: p.score }))}
      />
      <h2 className="text-xl font-semibold">Cards to revise ({missed.length})</h2>
      {missed.length === 0 && <p>You got every card. Nice.</p>}
      <ul className="w-full space-y-3">
        {missed.map((card) => (
          <li key={card.id}>
            <Card card={card} reveal />
          </li>
        ))}
      </ul>
      <Button onClick={() => setState(null)}>Play again</Button>
      <TextLink href="#/">Home</TextLink>
    </Screen>
  );
}

function Setup({ cards, onStart }: { cards: CardData[]; onStart: (settings: PartySettings) => void }) {
  const [players, setPlayers] = useState(["Player 1", "Player 2"]);
  const [subjects, setSubjects] = useState<CardData["subject"][]>([...SUBJECTS]);
  const [levels, setLevels] = useState<Level[]>([1, 2, 3]);
  const [roundSeconds, setRoundSeconds] = useState<60 | 90>(60);
  const [rounds, setRounds] = useState(1);

  const names = players.map((p) => p.trim());
  const matching = filterPool(cards, { subjects, levels }).length;
  const namesOk = names.length >= 2 && names.every(Boolean) && new Set(names).size === names.length;

  return (
    <Screen>
      <h1 className="text-3xl font-bold">Party mode</h1>
      <p className={mutedClass}>One phone, passed around the room. Works offline.</p>

      <fieldset className="w-full space-y-2 text-left">
        <legend className="font-medium">Players</legend>
        {players.map((name, i) => (
          <div key={i} className="flex gap-2">
            <input
              aria-label={`Player ${i + 1} name`}
              className={inputClass}
              maxLength={20}
              value={name}
              onChange={(e) => setPlayers(players.map((p, j) => (j === i ? e.target.value : p)))}
            />
            {players.length > 2 && (
              <button
                type="button"
                className="min-h-11 min-w-11 rounded text-slate-400"
                aria-label={`Remove ${name || `player ${i + 1}`}`}
                onClick={() => setPlayers(players.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {players.length < MAX_PLAYERS && (
          <LinkButton onClick={() => setPlayers([...players, `Player ${players.length + 1}`])}>+ Add player</LinkButton>
        )}
      </fieldset>

      <DeckFilterFields subjects={subjects} levels={levels} onSubjects={setSubjects} onLevels={setLevels} />
      <RoundFields
        roundSeconds={roundSeconds}
        rounds={rounds}
        maxRounds={5}
        onRoundSeconds={setRoundSeconds}
        onRounds={setRounds}
      />

      <p className={`text-sm ${mutedClass}`}>
        {matching} matching cards{matching === 0 && " – pick at least one subject and level"}
      </p>
      {!namesOk && <p className={`text-sm ${mutedClass}`}>Give every player a different name.</p>}
      <Button
        wide
        disabled={!namesOk || matching === 0}
        onClick={() => onStart({ players: names, subjects, levels, roundSeconds, rounds })}
      >
        Start game
      </Button>
      <TextLink href="#/">Back</TextLink>
    </Screen>
  );
}
