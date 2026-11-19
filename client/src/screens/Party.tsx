import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SUBJECTS,
  explainerPoints,
  selectionFromQuery,
  selectionToQuery,
  type Card as CardData,
  type Selection,
} from "@stemcharades/shared";
import { Card } from "../components/Card";
import { RoundFields } from "../components/GameSettingsFields";
import { SelectionPicker } from "../components/SelectionPicker";
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
import { countCards, fetchCatalog, warmAi } from "../state/catalog";

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
  const [ai, setAi] = useState(false);
  const [state, setState] = useState<PartyState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    fetchAllCards()
      .then((cards) => setLoad({ status: "ready", cards }))
      .catch(() => setLoad({ status: "error" }));
    // Online, the AI may be writing cards too. Offline this quietly stays false.
    void fetchCatalog().then((catalog) => setAi(Boolean(catalog?.ai)));
  }, []);

  /** Download the decks again, picking up cards the AI has written since. Keeps the old ones if offline. */
  const refresh = useCallback(async (): Promise<CardData[] | null> => {
    try {
      const cards = await fetchAllCards();
      setLoad({ status: "ready", cards });
      return cards;
    } catch {
      return null;
    }
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
  if (!state) {
    return (
      <Setup
        cards={load.cards}
        ai={ai}
        refresh={refresh}
        onStart={async (settings) => {
          // Pick up any cards written while the players were typing their names.
          const latest = (ai && (await refresh())) || load.cards;
          setState(createParty(settings, filterPool(latest, settings).length ? latest : load.cards));
        }}
      />
    );
  }

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

interface SetupProps {
  cards: CardData[];
  ai: boolean;
  refresh: () => Promise<CardData[] | null>;
  onStart: (settings: PartySettings) => void;
}

function Setup({ cards, ai, refresh, onStart }: SetupProps) {
  const [players, setPlayers] = useState(["Player 1", "Player 2"]);
  // A shared link (#/party?levels=2&courses=…) opens straight onto its choice.
  const [selection, setSelection] = useState<Selection>(() => selectionFromQuery(location.hash.split("?")[1] ?? ""));
  const [roundSeconds, setRoundSeconds] = useState<60 | 90>(60);
  const [rounds, setRounds] = useState(1);
  const [copied, setCopied] = useState(false);

  const names = players.map((p) => p.trim());
  const counts = useMemo(() => countCards(cards), [cards]);
  const matching = filterPool(cards, selection).length;
  const namesOk = names.length >= 2 && names.every(Boolean) && new Set(names).size === names.length;
  const query = selectionToQuery(selection);
  const link = `${location.origin}/#/party${query ? `?${query}` : ""}`;

  // Keep the address bar in step with the choice, so it can be bookmarked or shared as it is.
  useEffect(() => {
    history.replaceState(null, "", `#/party${query ? `?${query}` : ""}`);
    setCopied(false);
  }, [query]);

  // Ask the AI to start on this choice while the players are still getting ready.
  useEffect(() => {
    if (!ai) return;
    const id = setTimeout(() => warmAi(selection), 600);
    return () => clearTimeout(id);
  }, [ai, selection]);

  // Nothing to play yet but the AI is writing: look for the new cards every few seconds.
  useEffect(() => {
    if (!ai || matching > 0) return;
    const id = setInterval(() => void refresh(), 4000);
    return () => clearInterval(id);
  }, [ai, matching, refresh]);

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

      <SelectionPicker value={selection} onChange={setSelection} counts={counts} ai={ai} />
      <LinkButton
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          } catch {
            window.prompt("Copy this link:", link);
          }
        }}
      >
        {copied ? "Link copied" : "Copy a link to this choice"}
      </LinkButton>

      <RoundFields
        roundSeconds={roundSeconds}
        rounds={rounds}
        maxRounds={5}
        onRoundSeconds={setRoundSeconds}
        onRounds={setRounds}
      />

      <p className={`text-sm ${mutedClass}`}>
        {matching} matching cards
        {matching === 0 && (ai ? " – fresh ones are being written, give it a few seconds" : " – choose something wider")}
      </p>
      {!namesOk && <p className={`text-sm ${mutedClass}`}>Give every player a different name.</p>}
      <Button wide disabled={!namesOk || matching === 0} onClick={() => onStart({ players: names, ...selection, roundSeconds, rounds })}>
        Start game
      </Button>
      <TextLink href="#/">Back</TextLink>
    </Screen>
  );
}
