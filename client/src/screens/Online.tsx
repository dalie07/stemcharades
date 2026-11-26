import { useState } from "react";
import { ROOM_CODE_LENGTH } from "@stemcharades/shared";
import { Button, Heading, Notice, Screen, TextLink, inputClass, mutedClass } from "../components/ui";
import { useGameStore } from "../state/gameStore";
import { savePresetFromHash } from "../state/preset";
import { createRoom, joinRoom, type ActionResult } from "../state/socket";

/** Create a room, or join one with its code. */
export function Online() {
  const notice = useGameStore((s) => s.notice);
  const [nickname, setNickname] = useState("");
  // An invite link or QR code (#/online?join=ABCDE) arrives with the room code filled in.
  const [code, setCode] = useState(() => {
    const join = new URLSearchParams(location.hash.split("?")[1] ?? "").get("join") ?? "";
    return join.toUpperCase().slice(0, ROOM_CODE_LENGTH);
  });
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
      <Heading sub="Everyone plays on their own phone.">Online room</Heading>
      {notice && <Notice tone="warning">{notice}</Notice>}

      <label className="w-full text-left font-hand text-xl">
        Your nickname
        <input className={inputClass} maxLength={20} value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </label>
      <Button
        wide
        disabled={!nameOk || busy}
        onClick={() => {
          // A link like #/online?courses=… carries a choice for the new room's lobby.
          savePresetFromHash(location.hash);
          void run(() => createRoom(name));
        }}
      >
        Create a room
      </Button>

      <p className={`font-hand text-xl ${mutedClass}`}>or join a friend's room</p>
      <label className="w-full text-left font-hand text-xl">
        Room code
        <input
          className={`${inputClass} text-center font-chalk text-3xl uppercase tracking-[0.3em]`}
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
