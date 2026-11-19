import { useState } from "react";
import { ROOM_CODE_LENGTH } from "@stemcharades/shared";
import { Button, Notice, Screen, TextLink, inputClass, mutedClass } from "../components/ui";
import { useGameStore } from "../state/gameStore";
import { createRoom, joinRoom, type ActionResult } from "../state/socket";

/** Create a room, or join one with its code. */
export function Online() {
  const notice = useGameStore((s) => s.notice);
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<ActionResult>) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) return setError(result.message);
    useGameStore.setState({ notice: null });
    location.hash = "#/room";
  }

  const name = nickname.trim();
  const nameOk = name.length >= 2;

  return (
    <Screen centered>
      <h1 className="text-3xl font-bold">Online room</h1>
      {notice && <Notice tone="warning">{notice}</Notice>}

      <label className="w-full text-left">
        Your nickname
        <input className={inputClass} maxLength={20} value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </label>
      <Button wide disabled={!nameOk || busy} onClick={() => run(() => createRoom(name))}>
        Create a room
      </Button>

      <p className={mutedClass}>or join a friend's room</p>
      <label className="w-full text-left">
        Room code
        <input
          className={`${inputClass} text-center text-2xl uppercase tracking-widest`}
          maxLength={ROOM_CODE_LENGTH}
          autoCapitalize="characters"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
      </label>
      <Button wide disabled={!nameOk || code.length !== ROOM_CODE_LENGTH || busy} onClick={() => run(() => joinRoom(code, name))}>
        Join room
      </Button>

      {error && <Notice tone="error">{error}</Notice>}
      <TextLink href="#/">Back</TextLink>
    </Screen>
  );
}
