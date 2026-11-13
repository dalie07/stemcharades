/** Hard caps so one abusive client cannot exhaust a 512 MB instance. */
export const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 200);
export const ROOM_IDLE_MS = 30 * 60 * 1000;
export const SWEEP_INTERVAL_MS = 60 * 1000;
export const GAME_TICK_MS = 500;
/** An explainer who stays disconnected this long loses the round; the next explainer starts. */
export const EXPLAINER_GRACE_MS = 20_000;
/** A host who stays disconnected this long hands the role on. */
export const HOST_GRACE_MS = 60_000;
export const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS ?? 600);
/** Socket.IO closes a connection that sends a bigger message than this. */
export const MAX_MESSAGE_BYTES = 16 * 1024;
export const TRUST_PROXY = process.env.TRUST_PROXY === "1";
