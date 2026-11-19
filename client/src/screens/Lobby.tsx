import { useEffect, useState } from "react";
import { MAX_PLAYERS_PER_ROOM, type RoomSettings, type RoomView } from "@stemcharades/shared";
import { RoundFields } from "../components/GameSettingsFields";
import { SelectionPicker } from "../components/SelectionPicker";
import { Button, LinkButton, Notice, Screen, mutedClass, selectClass } from "../components/ui";
import { api, type DeckSummary } from "../state/account";
import { NO_COUNTS, fetchCatalog, type Catalog } from "../state/catalog";
import { takePreset } from "../state/preset";
import { useGameStore, type Session } from "../state/gameStore";
import { configureRoom, kickPlayer, leaveRoom, selectDeck, startGame } from "../state/socket";

export function Lobby({ room, session }: { room: RoomView; session: Session }) {
  const actionError = useGameStore((s) => s.actionError);
  const signedIn = useGameStore((s) => Boolean(s.me?.user));
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);

  const isHost = room.hostId === session.playerId;
  const canUseDecks = isHost && signedIn;
  const enoughPlayers = room.players.filter((p) => p.connected).length >= 2;
  const settings = room.settings;

  useEffect(() => {
    if (canUseDecks) void api.decks().then((r) => r.ok && setDecks(r.data.filter((d) => d.cards > 0)));
  }, [canUseDecks]);

  // The counts on the picker, refreshed while the lobby is open: the AI may be adding cards as people wait.
  useEffect(() => {
    let live = true;
    const load = () => void fetchCatalog().then((c) => live && c && setCatalog(c));
    load();
    const id = setInterval(load, 15_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  // A host who arrived through a shared link (#/online?courses=…) starts with that choice.
  useEffect(() => {
    const preset = isHost ? takePreset() : null;
    if (preset) configureRoom({ ...settings, levels: [...preset.levels], courses: [...preset.courses], topics: [...preset.topics] });
  }, []); // once, on arrival

  const update = (patch: Partial<RoomSettings>) => configureRoom({ ...settings, ...patch });

  return (
    <Screen>
      <p className={mutedClass}>Room code</p>
      <h1 className="text-5xl font-bold tracking-widest" aria-label={`Room code ${room.code.split("").join(" ")}`}>
        {room.code}
      </h1>

      <section className="w-full text-left">
        <h2 className="font-medium">
          Players ({room.players.length}/{MAX_PLAYERS_PER_ROOM})
        </h2>
        <ul className="mt-1 space-y-1">
          {room.players.map((p) => (
            <li key={p.id} className="flex min-h-11 items-center justify-between rounded bg-slate-800 px-3">
              <span>
                <span aria-label={p.connected ? "online" : "offline"} className={p.connected ? "text-green-500" : "text-slate-500"}>
                  ●
                </span>{" "}
                {p.nickname}
                {p.id === session.playerId && " (you)"}
              </span>
              {p.isHost && <span className="text-xs font-medium text-indigo-300">HOST</span>}
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

      <fieldset disabled={!isHost} className="w-full space-y-3 text-left">
        <legend className="font-medium">
          Game settings {!isHost && <span className={`text-sm font-normal ${mutedClass}`}>(host only)</span>}
        </legend>
        {/* A private deck replaces the built-in cards, so the curriculum choice does not apply. */}
        {!room.customDeck && (
          <SelectionPicker
            value={settings}
            onChange={({ levels, courses, topics }) => update({ levels: [...levels], courses: [...courses], topics: [...topics] })}
            counts={catalog ?? NO_COUNTS}
            ai={Boolean(catalog?.ai)}
            disabled={!isHost}
          />
        )}
        <RoundFields
          roundSeconds={settings.roundSeconds}
          rounds={settings.rounds}
          maxRounds={10}
          onRoundSeconds={(roundSeconds) => update({ roundSeconds })}
          onRounds={(rounds) => update({ rounds })}
        />
      </fieldset>

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
