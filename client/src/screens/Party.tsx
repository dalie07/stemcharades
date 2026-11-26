import { useEffect, useMemo, useRef, useState } from "react";
import {
  GENERAL,
  SUBJECTS,
  describeSelection,
  explainerPoints,
  selectionFromQuery,
  selectionToQuery,
  type Card as CardData,
  type Selection,
} from "@stemcharades/shared";
import { Card } from "../components/Card";
import {
  CourseChoice,
  LengthChoice,
  LevelChoice,
  TopicChoice,
  WhatChoice,
  chooseSteps,
  courseStepTitle,
  defaultLength,
  describeLength,
  type Length,
  type PlayMode,
} from "../components/ChooseSteps";
import { Dust } from "../components/Dust";
import { Step } from "../components/Steps";
import { Timer } from "../components/Timer";
import { Button, Heading, LinkButton, Notice, ScoreList, Screen, TextLink, inputClass, mutedClass, panelClass } from "../components/ui";
import { cue } from "../lib/feedback";
import {
  createParty,
  currentPlayer,
  currentRun,
  filterPool,
  gotIt,
  highlights,
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
import { countCards } from "../state/catalog";
import { missedIds, useProgress } from "../state/progress";
import { place } from "./Scoreboard";

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
  const { record, played } = useProgress();
  const recorded = useRef(0);

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

  // Every card played is remembered on this device: got cards earn stars, missed ones come back for revision.
  useEffect(() => {
    if (!state) return void (recorded.current = 0);
    for (const h of state.history.slice(recorded.current)) record(h.card, h.outcome === "got");
    recorded.current = state.history.length;
  }, [state, record]);

  if (load.status === "loading") {
    return (
      <Screen centered>
        <p className="font-hand text-2xl" role="status">
          Getting the cards out…
        </p>
      </Screen>
    );
  }
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
        onStart={(settings, deck, priority) => {
          played();
          setState(createParty(settings, deck, priority));
        }}
      />
    );
  }

  const player = currentPlayer(state);
  const gotCount = state.turnResults.filter((r) => r.outcome === "got").length;

  if (state.phase === "ready") {
    return (
      <Screen centered>
        <p className={`font-hand text-xl ${mutedClass}`}>
          Turn {state.turnIndex + 1} of {totalTurns(state.settings)}
        </p>
        <Heading sub={`Only the explainer looks. ${state.settings.roundSeconds} seconds on the clock.`}>Pass the phone to {player}</Heading>
        <Button
          wide
          onClick={() => {
            cue("start");
            setState(startTurn(state, Date.now()));
          }}
        >
          I'm ready – start
        </Button>
      </Screen>
    );
  }

  if (state.phase === "playing" && state.currentCard) {
    const secondsLeft = Math.max(0, Math.ceil(((state.endsAt ?? now) - now) / 1000));
    const run = currentRun(state);
    return (
      <Screen>
        <div className="flex w-full items-center justify-between">
          <span className="font-hand text-2xl">{player}</span>
          <Timer seconds={secondsLeft} total={state.settings.roundSeconds} />
          <span className="font-hand text-2xl">Got: {gotCount}</span>
        </div>
        <div className="relative w-full">
          <Card key={state.currentCard.id} card={state.currentCard} />
          {run >= 3 && (
            <p key={run} role="status" className="pop absolute -top-3 right-3 rounded-full bg-accent px-3 py-1 font-hand text-lg text-accent-ink">
              On fire ×{run}!
              <Dust />
            </p>
          )}
        </div>
        <div className="grid w-full grid-cols-2 gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              cue("wrong");
              setState(skip(state, Date.now()));
            }}
          >
            Skip
          </Button>
          <Button
            variant="success"
            onClick={() => {
              const next = gotIt(state, Date.now());
              cue(currentRun(next) >= 3 ? "combo" : "correct");
              setState(next);
            }}
          >
            Got it
          </Button>
        </div>
      </Screen>
    );
  }

  if (state.phase === "reveal") {
    return (
      <Screen>
        <Heading sub={`+${explainerPoints(gotCount)} points`}>Time's up, {player}</Heading>
        <ul className="w-full space-y-4">
          {state.turnResults.map((result, i) => (
            <li key={i}>
              <p className={`mb-1 text-left font-hand text-xl ${result.outcome === "got" ? "text-good" : mutedClass}`}>{OUTCOME[result.outcome]}</p>
              <Card card={result.card} reveal />
            </li>
          ))}
        </ul>
        <Button wide onClick={() => setState(nextTurn(state))}>
          Continue
        </Button>
      </Screen>
    );
  }

  return <PartySummary state={state} onAgain={() => setState(null)} />;
}

function PartySummary({ state, onAgain }: { state: PartyState; onAgain: () => void }) {
  const missed = missedCards(state);
  const h = highlights(state);
  const standings = state.settings.players
    .map((name, i) => ({ name, score: state.scores[i] ?? 0 }))
    .sort((a, b) => b.score - a.score);

  useEffect(() => cue("reveal"), []);

  return (
    <Screen>
      <div className="relative">
        <Heading sub={`${standings[0]!.name} wins!`}>Final scores</Heading>
        <Dust count={20} />
      </div>
      <ScoreList
        label="Final standings"
        rows={standings.map((p, i) => ({
          key: p.name,
          name: (
            <>
              <span className="mr-2 font-hand text-lg text-accent">{place(i + 1)}</span>
              {p.name}
            </>
          ),
          score: p.score,
        }))}
      />

      <section className={panelClass} aria-labelledby="highlights">
        <h2 id="highlights" className="font-chalk text-2xl">
          Highlights
        </h2>
        <ul className="mt-2 space-y-2">
          {h.fastest && (
            <li>
              <strong className="font-hand text-lg text-accent">Fastest</strong> {h.fastest.player} got “{h.fastest.prompt}” in {h.fastest.seconds} s
            </li>
          )}
          {h.longestRun && (
            <li>
              <strong className="font-hand text-lg text-accent">On fire</strong> {h.longestRun.player}, {h.longestRun.count} in a row
            </li>
          )}
          <li>
            <strong className="font-hand text-lg text-accent">Learned today</strong>{" "}
            {h.learned.length ? `${h.learned.length} card${h.learned.length === 1 ? "" : "s"} you had missed before` : "keep playing to revise your misses"}
          </li>
        </ul>
      </section>

      <h2 className="font-chalk text-2xl">Cards to revise ({missed.length})</h2>
      {missed.length === 0 ? (
        <p>You got every card. Nice.</p>
      ) : (
        <p className={`text-sm ${mutedClass}`}>They will come back in your next games until you get them.</p>
      )}
      <ul className="w-full space-y-3">
        {missed.map((card) => (
          <li key={card.id}>
            <Card card={card} reveal />
          </li>
        ))}
      </ul>
      <Button wide onClick={onAgain}>
        Play again
      </Button>
      <TextLink href="#/">Home</TextLink>
    </Screen>
  );
}

type StepId = "players" | "what" | "level" | "course" | "topic" | "length" | "ready";

/** Setting up, one decision per screen: players, what to play (as narrowly as wanted), how long, then go. */
function Setup({ cards, onStart }: { cards: CardData[]; onStart: (settings: PartySettings, deck: CardData[], priority: string[]) => void }) {
  // A shared link (#/party?levels=2&courses=…) opens with its choice already made.
  const preset = useMemo(() => selectionFromQuery(location.hash.split("?")[1] ?? ""), []);
  const hasPreset = preset.levels.length + preset.courses.length + preset.topics.length > 0;

  const [players, setPlayers] = useState(["Player 1", "Player 2"]);
  const [mode, setMode] = useState<PlayMode>(hasPreset ? "choose" : "general");
  const [selection, setSelection] = useState<Selection>(hasPreset ? preset : GENERAL);
  const [length, setLength] = useState<Length>(defaultLength("party"));
  const [at, setAt] = useState<StepId>("players");
  const [copied, setCopied] = useState(false);
  const progressCards = useProgress((s) => s.cards);

  const counts = useMemo(() => countCards(cards), [cards]);
  const missed = useMemo(() => {
    const ids = new Set(missedIds({ cards: progressCards, days: [] }));
    return cards.filter((c) => ids.has(c.id));
  }, [cards, progressCards]);

  const choice = mode === "choose" ? selection : GENERAL;
  const deck = mode === "misses" ? missed : cards;
  const matching = mode === "misses" ? missed.length : filterPool(cards, choice).length;

  const names = players.map((p) => p.trim());
  const namesOk = names.length >= 2 && names.every(Boolean) && new Set(names).size === names.length;

  // The steps this setup needs: the course step only once a level is picked, topics only once a course is.
  const steps: StepId[] = [
    "players",
    ...chooseSteps(mode).filter((s) => s !== "topic" || selection.courses.length > 0),
    "length",
    "ready",
  ];
  const index = Math.max(0, steps.indexOf(at));
  const go = (delta: number) => setAt(steps[Math.min(steps.length - 1, Math.max(0, index + delta))]!);
  const back = index > 0 ? () => go(-1) : () => (location.hash = "#/");
  const frame = { step: index + 1, total: steps.length, onBack: back };

  const query = mode === "choose" ? selectionToQuery(selection) : "";
  const link = `${location.origin}/#/party${query ? `?${query}` : ""}`;

  // Keep the address bar in step with the choice, so it can be bookmarked or shared as it is.
  useEffect(() => {
    history.replaceState(null, "", `#/party${query ? `?${query}` : ""}`);
    setCopied(false);
  }, [query]);

  switch (at) {
    case "players":
      return (
        <Step {...frame} title="Who's playing?" sub="One phone, passed around. Works offline." onNext={() => go(1)} nextDisabled={!namesOk} hint={!namesOk && "Give every player a different name."}>
          <ol className="w-full space-y-2">
            {players.map((name, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-7 font-hand text-xl text-ink-muted" aria-hidden="true">
                  {i + 1}.
                </span>
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
                    className="min-h-11 min-w-11 rounded-xl text-xl text-ink-muted"
                    aria-label={`Remove ${name || `player ${i + 1}`}`}
                    onClick={() => setPlayers(players.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ol>
          {players.length < MAX_PLAYERS && (
            <LinkButton onClick={() => setPlayers([...players, `Player ${players.length + 1}`])}>+ Add a player</LinkButton>
          )}
        </Step>
      );
    case "what":
      return (
        <Step {...frame} title="What shall we play?" sub="Everything, or narrow it down." onNext={() => go(1)}>
          <WhatChoice mode={mode} onMode={setMode} total={cards.length} misses={missed.length} />
        </Step>
      );
    case "level":
      return (
        <Step {...frame} title="Pick a level" sub="One, several or all." onNext={() => go(1)} nextDisabled={!selection.levels.length} hint={!selection.levels.length && "Pick at least one level."}>
          <LevelChoice value={selection} onChange={setSelection} counts={counts} />
        </Step>
      );
    case "course":
      return (
        <Step {...frame} title={courseStepTitle(selection.levels)} sub="Or keep them all." onNext={() => go(1)}>
          <CourseChoice value={selection} onChange={setSelection} counts={counts} />
        </Step>
      );
    case "topic":
      return (
        <Step {...frame} title="Any topics in particular?" sub="Stars show what you have mastered." onNext={() => go(1)}>
          <TopicChoice value={selection} onChange={setSelection} counts={counts} />
        </Step>
      );
    case "length":
      return (
        <Step {...frame} title="How long?" onNext={() => go(1)}>
          <LengthChoice kind="party" value={length} onChange={setLength} maxRounds={5} />
        </Step>
      );
    case "ready":
      return (
        <Step
          {...frame}
          title="Ready?"
          nextLabel="Start game"
          nextDisabled={!namesOk || matching === 0}
          onNext={() => onStart({ players: names, ...choice, ...length }, deck, missed.map((c) => c.id))}
        >
          <dl className={`${panelClass} space-y-3`}>
            <div>
              <dt className="font-hand text-lg text-ink-muted">Players</dt>
              <dd>{names.join(", ")}</dd>
            </div>
            <div>
              <dt className="font-hand text-lg text-ink-muted">Playing</dt>
              <dd>{mode === "misses" ? "Revise my misses" : describeSelection(choice)}</dd>
            </div>
            <div>
              <dt className="font-hand text-lg text-ink-muted">Length</dt>
              <dd>{describeLength("party", length)}</dd>
            </div>
          </dl>
          <p className={`text-sm ${mutedClass}`}>
            {matching} matching cards{matching === 0 && " – go back and choose something wider"}
          </p>
          {mode === "choose" && (
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
          )}
        </Step>
      );
  }
}
