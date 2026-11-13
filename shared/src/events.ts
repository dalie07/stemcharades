import type {
  CluePayload,
  DeckSelectPayload,
  ClueRejection,
  ErrorPayload,
  GuessPayload,
  GuessResultPayload,
  JoinAck,
  JoinPayload,
  KickPayload,
  RoomSettings,
  RoomView,
} from "./rooms.js";

// Event names shared by client and server.
export const EVENTS = {
  ping: "ping:send",
  pong: "ping:reply",
  join: "room:join",
  configure: "room:configure",
  leave: "room:leave",
  kick: "player:kick",
  deck: "deck:select",
  start: "game:start",
  clue: "clue:send",
  skip: "round:skip",
  guess: "guess:send",
  guessResult: "guess:result",
  clueRejected: "clue:rejected",
  state: "room:state",
  error: "error",
} as const;

export interface PingPayload {
  message: string;
}

export interface PongPayload {
  message: string;
  serverTime: number;
}

export interface ClientToServerEvents {
  [EVENTS.ping]: (payload: PingPayload) => void;
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
  [EVENTS.pong]: (payload: PongPayload) => void;
  [EVENTS.state]: (view: RoomView) => void;
  [EVENTS.error]: (payload: ErrorPayload) => void;
  [EVENTS.clueRejected]: (rejection: ClueRejection) => void;
  [EVENTS.guessResult]: (payload: GuessResultPayload) => void;
}
