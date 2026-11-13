import express, { type ErrorRequestHandler, type Router } from "express";
import {
  createRoomBodySchema,
  roomCodeSchema,
  type CreateRoomResponse,
  type RoomStatusResponse,
} from "@stemcharades/shared";
import { isBlocked } from "../game/blocklist.js";
import type { RoomManager } from "../game/roomManager.js";
import { userIdFromCookies } from "../auth/session.js";
import type { Limits } from "../realtime/rateLimit.js";

export function roomsRouter(rooms: RoomManager, limits: Limits, sessionSecret?: string): Router {
  const router = express.Router();
  router.use(express.json({ limit: "2kb" }));

  const tooMany = (res: express.Response) => {
    res.setHeader("Retry-After", "30");
    res.status(429).json({ error: "rate_limited" });
  };

  router.post("/", (req, res) => {
    if (!limits.create.take(req.ip ?? "unknown")) return tooMany(res);
    const body = createRoomBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    if (isBlocked(body.data.nickname)) {
      res.status(400).json({ error: "blocked_content" });
      return;
    }
    const seat = rooms.createRoom(body.data.nickname, userIdFromCookies(req.headers.cookie, sessionSecret) ?? undefined);
    if (!seat.ok) {
      res.status(503).json({ error: seat.error });
      return;
    }
    const response: CreateRoomResponse = {
      code: seat.value.room.code,
      playerId: seat.value.player.id,
      sessionToken: seat.value.sessionToken,
    };
    res.status(201).json(response);
  });

  router.get("/:code", (req, res) => {
    if (!limits.probe.take(req.ip ?? "unknown")) return tooMany(res);
    const code = roomCodeSchema.safeParse(req.params.code);
    if (!code.success) {
      res.status(400).json({ error: "invalid_payload" });
      return;
    }
    const response: RoomStatusResponse = rooms.status(code.data);
    res.json(response);
  });

  // Express only treats a handler as an error handler when it declares four parameters.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onError: ErrorRequestHandler = (_err, _req, res, _next) => {
    res.status(400).json({ error: "invalid_payload" });
  };
  router.use(onError);
  return router;
}
