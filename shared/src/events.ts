import type {
  CluePayload,
  ClueRejection,
  DeckSelectPayload,
  ErrorPayload,
  GuessPayload,
  GuessResultPayload,
  JoinAck,
  JoinPayload,
  KickPayload,
  RoomSettings,
  RoomView,
} from "./rooms.js";

/** Socket.IO event names. Every payload has a schema or type in `rooms.ts`. */
export const EVENTS = {
  // client -> server
  join: "room:join",
  configure: "room:configure",
  leave: "room:leave",
  kick: "player:kick",
  deck: "deck:select",
  start: "game:start",
  clue: "clue:send",
  skip: "round:skip",
  guess: "guess:send",
  // server -> client
  state: "room:state",
  clueRejected: "clue:rejected",
  guessResult: "guess:result",
  error: "error",
} as const;

export interface ClientToServerEvents {
  [EVENTS.join]: (payload: JoinPayload, ack: (res: JoinAck) => void) => void;
  [EVENTS.configure]: (payload: RoomSettings) => void;
  [EVENTS.leave]: () => void;
  [EVENTS.kick]: (payload: KickPayload) => void;
  [EVENTS.deck]: (payload: DeckSelectPayload) => void;
  [EVENTS.start]: () => void;
  [EVENTS.clue]: (payload: CluePayload) => void;
  [EVENTS.skip]: () => void;
  [EVENTS.guess]: (payload: GuessPayload) => void;
}

export interface ServerToClientEvents {
  /** The whole room as this one player may see it. Sent after every change. */
  [EVENTS.state]: (view: RoomView) => void;
  /** To the explainer alone. */
  [EVENTS.clueRejected]: (rejection: ClueRejection) => void;
  /** To the guesser alone. */
  [EVENTS.guessResult]: (payload: GuessResultPayload) => void;
  [EVENTS.error]: (payload: ErrorPayload) => void;
}
