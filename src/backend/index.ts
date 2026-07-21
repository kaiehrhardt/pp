import homepage from "../frontend/index.html";
import pkg from "../../package.json";
import { readChangelog } from "./changelog";
import { createDb, migrate } from "./domain/db";
import * as domain from "./domain/room";
import { RoomStore } from "./domain/store";
import { logger } from "./logger";
import { publisher } from "./redis/pubsub";
import { createWebSocketHandlers } from "./ws/handler";
import { createRoomChannel, type SocketData } from "./ws/roomChannel";

const CHANGELOG_PATH = `${import.meta.dir}/../../CHANGELOG.md`;

const db = createDb();
await migrate(db);
logger.info("database migrated");

// Fail loudly at boot on a bad TURSO_DATABASE_URL/TURSO_AUTH_TOKEN or REDIS_URL rather
// than crash-loop or serve a half-working process on the first real request.
try {
  await db.execute("SELECT 1");
  await publisher.ping();
} catch (err) {
  logger.error("startup dependency check failed", { err });
  throw err;
}

const store = new RoomStore(db);
store.startCleanup();
const roomChannel = createRoomChannel(store);

const server = Bun.serve<SocketData>({
  routes: {
    "/": homepage,
    "/room/*": homepage,
    "/api/rooms": {
      async POST() {
        const room = await store.create();
        logger.info("room created", { roomId: room.id });
        return Response.json({ roomId: room.id });
      },
    },
    "/api/rooms/:id": {
      async GET(req: Bun.BunRequest<"/api/rooms/:id">) {
        const room = await store.get(req.params.id);
        if (!room) return new Response("Room not found", { status: 404 });
        return Response.json({ full: domain.isRoomFull(room) });
      },
    },
    "/api/version": {
      GET() {
        return Response.json({ version: pkg.version });
      },
    },
    "/api/changelog": {
      async GET() {
        const versions = await readChangelog(CHANGELOG_PATH);
        return Response.json({ versions });
      },
    },
    "/api/ready": {
      async GET() {
        try {
          await Promise.all([db.execute("SELECT 1"), publisher.ping()]);
          return Response.json({ ready: true });
        } catch (err) {
          logger.warn("readiness check failed", { err });
          return new Response("Not ready", { status: 503 });
        }
      },
    },
  },
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname !== "/ws") return new Response("Not found", { status: 404 });

    const roomId = url.searchParams.get("roomId");
    if (!roomId) return new Response("roomId required", { status: 400 });

    const room = await store.get(roomId);
    if (!room) {
      logger.warn("ws upgrade rejected: room not found", { roomId });
      return new Response("Room not found", { status: 404 });
    }

    const token = url.searchParams.get("token");
    const existing = token ? domain.findParticipantByToken(room, token) : undefined;

    let participantId: string;
    if (existing) {
      await store.reconnectParticipant(roomId, existing.id);
      participantId = existing.id;
    } else {
      const name = url.searchParams.get("name");
      if (!name) return new Response("name required", { status: 400 });
      const isSpectator = url.searchParams.get("spectator") === "true";
      const avatar = url.searchParams.get("avatar") ?? "";
      // Capacity is enforced inside addParticipant's own transaction (closes a
      // cross-pod join race a separate pre-check here couldn't) — see store.ts.
      const result = await store.addParticipant(roomId, name, isSpectator, avatar);
      if (result === "full") {
        logger.info("ws upgrade rejected: room full", { roomId });
        return new Response("Room is full", { status: 403 });
      }
      if (result === "not_found") {
        logger.warn("ws upgrade rejected: room not found", { roomId });
        return new Response("Room not found", { status: 404 });
      }
      participantId = result.participant.id;
    }

    const upgraded = server.upgrade(req, {
      data: { roomId, participantId },
    });
    if (!upgraded) {
      logger.warn("ws upgrade failed", { roomId, participantId });
      return new Response("Upgrade failed", { status: 400 });
    }
    return undefined;
  },
  error(error) {
    logger.error("unhandled request error", { err: error });
    return new Response("Internal Server Error", { status: 500 });
  },
  websocket: createWebSocketHandlers(store, roomChannel),
  port: process.env.PORT ?? 3000,
  development: process.env.NODE_ENV !== "production",
});

logger.info("server listening", { url: server.url.toString() });
