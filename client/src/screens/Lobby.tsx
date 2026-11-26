import { useEffect, useState } from "react";
import { GENERAL, MAX_PLAYERS_PER_ROOM, describeSelection, type RoomSettings, type RoomView, type Selection } from "@stemcharades/shared";
import {
  CourseChoice,
  LengthChoice,
  LevelChoice,
  TopicChoice,
  WhatChoice,
  chooseSteps,
  courseStepTitle,
  describeLength,
  type Length,
  type PlayMode,
} from "../components/ChooseSteps";
import { QrCode } from "../components/QrCode";
import { Step } from "../components/Steps";
import { Button, LinkButton, Notice, Screen, mutedClass, panelClass, selectClass } from "../components/ui";
import { api, type DeckSummary } from "../state/account";
import { NO_COUNTS, fetchCatalog, type Counts } from "../state/catalog";
import { useGameStore, type Session } from "../state/gameStore";
import { takePreset } from "../state/preset";
import { configureRoom, kickPlayer, leaveRoom, selectDeck, startGame } from "../state/socket";

const isGeneral = (s: Selection) => !s.levels.length && !s.courses.length && !s.topics.length;

/**
 * Waiting for players: the room code (and a QR code to scan), who is here, and what will be played. The host
 * changes what to play in the same one-decision-per-screen steps as Party mode.
 */
export function Lobby({ room, session }: { room: RoomView; session: Session }) {
  const actionError = useGameStore((s) => s.actionError);
  const signedIn = useGameStore((s) => Boolean(s.me?.user));
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [counts, setCounts] = useState<Counts>(NO_COUNTS);
  const [choosing, setChoosing] = useState(false);
  const [copied, setCopied] = useState(false);

  const isHost = room.hostId === session.playerId;
  const canUseDecks = isHost && signedIn;
  const enoughPlayers = room.players.filter((p) => p.connected).length >= 2;
  const settings = room.settings;
  const invite = `${location.origin}/#/online?join=${room.code}`;

  useEffect(() => {
    if (canUseDecks) void api.decks().then((r) => r.ok && setDecks(r.data.filter((d) => d.cards > 0)));
  }, [canUseDecks]);

  // The card counts shown while choosing.
  useEffect(() => {
    let live = true;
    void fetchCatalog().then((c) => live && c && setCounts(c));
    return () => {
      live = false;
    };
  }, []);

  // A host who arrived through a shared link (#/online?courses=…) starts with that choice.
  useEffect(() => {
    const preset = isHost ? takePreset() : null;
    if (preset) configureRoom({ ...settings, levels: [...preset.levels], courses: [...preset.courses], topics: [...preset.topics] });
  }, []); // once, on arrival

  if (choosing && isHost) {
    return (
      <ChooseForRoom
        counts={counts}
        settings={settings}
        onCancel={() => setChoosing(false)}
        onDone={(next) => {
          configureRoom(next);
          setChoosing(false);
        }}
      />
    );
  }

  return (
    <Screen>
      <p className={`font-hand text-xl ${mutedClass}`}>Room code</p>
      <h1 className="-mt-4 font-chalk text-6xl tracking-[0.2em]" aria-label={`Room code ${room.code.split("").join(" ")}`}>
        {room.code}
      </h1>

      <section className="w-full text-left">
        <h2 className="font-hand text-2xl">
          Players ({room.players.length}/{MAX_PLAYERS_PER_ROOM})
        </h2>
        <ul className="mt-2 space-y-2">
          {room.players.map((p) => (
            <li key={p.id} className="flex min-h-12 items-center justify-between rounded-xl bg-surface px-4">
              <span>
                <span aria-label={p.connected ? "online" : "offline"} className={p.connected ? "text-good" : "text-ink-muted"}>
                  ●
                </span>{" "}
                {p.nickname}
                {p.id === session.playerId && " (you)"}
              </span>
              {p.isHost && <span className="font-hand text-lg text-accent">HOST</span>}
              {isHost && !p.isHost && (
                <LinkButton
                  danger
                  aria-label={`Remove ${p.nickname} from the room`}
                  onClick={() => confirm(`Remove ${p.nickname} from the room?`) && kickPlayer(p.id)}
                >
                  Remove
                </LinkButton>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className={`${panelClass} flex flex-col items-center gap-3 text-center`} aria-label="Invite players">
        <QrCode value={invite} label={`QR code to join room ${room.code}`} />
        <p className={`text-sm ${mutedClass}`}>Scan to join, or enter the code on the Online screen.</p>
        <LinkButton
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(invite);
              setCopied(true);
            } catch {
              window.prompt("Copy this invite link:", invite);
            }
          }}
        >
          {copied ? "Invite link copied" : "Copy invite link"}
        </LinkButton>
      </section>

      {room.customDeck && (
        <Notice tone="info" align="left">
          Playing the private deck <strong>{room.customDeck.name}</strong> ({room.customDeck.count} cards)
        </Notice>
      )}
      {canUseDecks && decks.length > 0 && (
        <label className="w-full text-left">
          Card deck
          <select
            className={selectClass}
            value={decks.find((d) => d.name === room.customDeck?.name)?.id ?? ""}
            onChange={(e) => selectDeck(e.target.value || null)}
          >
            <option value="">Built-in cards</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.cards})
              </option>
            ))}
          </select>
        </label>
      )}

      <section className={panelClass} aria-label="Game settings">
        <dl className="space-y-3">
          {/* A private deck replaces the built-in cards, so the curriculum choice does not apply. */}
          {!room.customDeck && (
            <div>
              <dt className="font-hand text-lg text-ink-muted">Playing</dt>
              <dd>{isGeneral(settings) ? "Everything (General)" : describeSelection(settings)}</dd>
            </div>
          )}
          <div>
            <dt className="font-hand text-lg text-ink-muted">Length</dt>
            <dd>{describeLength("online", settings)}</dd>
          </div>
        </dl>
        {isHost ? (
          <Button variant="secondary" wide onClick={() => setChoosing(true)}>
            Change what to play
          </Button>
        ) : (
          <p className={`mt-2 text-sm ${mutedClass}`}>The host chooses what to play.</p>
        )}
      </section>

      {actionError && <Notice tone="error">{actionError}</Notice>}
      <Button wide disabled={!isHost || !enoughPlayers} onClick={startGame}>
        Start game
      </Button>
      <p className={`text-sm ${mutedClass}`}>
        {!isHost
          ? "Waiting for the host to start."
          : enoughPlayers
            ? "Everyone in? Start when ready."
            : "Waiting for at least one more player."}
      </p>
      <LeaveRoom />
    </Screen>
  );
}

type StepId = "what" | "level" | "course" | "topic" | "length";

/** The host's choice, one decision per screen. Nothing is sent until Done, so others see one clean change. */
function ChooseForRoom({
  counts,
  settings,
  onCancel,
  onDone,
}: {
  counts: Counts;
  settings: RoomSettings;
  onCancel: () => void;
  onDone: (next: RoomSettings) => void;
}) {
  const [mode, setMode] = useState<PlayMode>(isGeneral(settings) ? "general" : "choose");
  const [selection, setSelection] = useState<Selection>(settings);
  const [length, setLength] = useState<Length>({ roundSeconds: settings.roundSeconds, rounds: settings.rounds });
  const [at, setAt] = useState<StepId>("what");

  const steps: StepId[] = [...chooseSteps(mode).filter((s) => s !== "topic" || selection.courses.length > 0), "length"];
  const index = Math.max(0, steps.indexOf(at));
  const last = index === steps.length - 1;
  const choice = mode === "choose" ? selection : GENERAL;
  const finish = () => onDone({ levels: [...choice.levels], courses: [...choice.courses], topics: [...choice.topics], ...length });
  const frame = {
    step: index + 1,
    total: steps.length,
    onBack: index > 0 ? () => setAt(steps[index - 1]!) : onCancel,
    onNext: last ? finish : () => setAt(steps[index + 1]!),
    nextLabel: last ? "Done" : "Next",
  };

  switch (at) {
    case "what":
      return (
        <Step {...frame} title="What shall we play?" sub="Everything, or narrow it down.">
          <WhatChoice mode={mode} onMode={setMode} total={Object.values(counts.levels).reduce((a, b) => a + b, 0)} misses={0} />
        </Step>
      );
    case "level":
      return (
        <Step {...frame} title="Pick a level" sub="One, several or all." nextDisabled={!selection.levels.length} hint={!selection.levels.length && "Pick at least one level."}>
          <LevelChoice value={selection} onChange={setSelection} counts={counts} />
        </Step>
      );
    case "course":
      return (
        <Step {...frame} title={courseStepTitle(selection.levels)} sub="Or keep them all.">
          <CourseChoice value={selection} onChange={setSelection} counts={counts} />
        </Step>
      );
    case "topic":
      return (
        <Step {...frame} title="Any topics in particular?" sub="Stars show what you have mastered.">
          <TopicChoice value={selection} onChange={setSelection} counts={counts} />
        </Step>
      );
    case "length":
      return (
        <Step {...frame} title="How long?">
          <LengthChoice kind="online" value={length} onChange={setLength} maxRounds={10} />
        </Step>
      );
  }
}

export function LeaveRoom() {
  return (
    <LinkButton
      onClick={() => {
        leaveRoom();
        location.hash = "#/";
      }}
    >
      Leave room
    </LinkButton>
  );
}
