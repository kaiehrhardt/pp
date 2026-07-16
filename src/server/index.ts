import homepage from "../client/index.html";
import pkg from "../../package.json";
import { readChangelog } from "./changelog";
import * as domain from "./domain/room";
import { RoomStore } from "./domain/store";
import { createWebSocketHandlers, type SocketData } from "./ws/handler";

const CHANGELOG_PATH = `${import.meta.dir}/../../CHANGELOG.md`;

const store = new RoomStore();
store.startCleanup();

const server = Bun.serve<SocketData>({
  routes: {
    "/": homepage,
    "/room/*": homepage,
    "/api/rooms": {
      POST() {
        const room = store.create();
        return Response.json({ roomId: room.id });
      },
    },
    "/api/rooms/:id": {
      GET(req: Bun.BunRequest<"/api/rooms/:id">) {
        const room = store.get(req.params.id);
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
  },
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname !== "/ws") return new Response("Not found", { status: 404 });

    const roomId = url.searchParams.get("roomId");
    if (!roomId) return new Response("roomId required", { status: 400 });

    const room = store.get(roomId);
    if (!room) return new Response("Room not found", { status: 404 });

    const token = url.searchParams.get("token");
    let participant = token ? domain.findParticipantByToken(room, token) : undefined;

    if (participant) {
      domain.reconnectParticipant(room, participant);
    } else {
      const name = url.searchParams.get("name");
      if (!name) return new Response("name required", { status: 400 });
      if (domain.isRoomFull(room)) return new Response("Room is full", { status: 403 });
      const isSpectator = url.searchParams.get("spectator") === "true";
      participant = domain.addParticipant(room, name, isSpectator);
    }

    const upgraded = server.upgrade(req, {
      data: { roomId: room.id, participantId: participant.id },
    });
    if (!upgraded) return new Response("Upgrade failed", { status: 400 });
    return undefined;
  },
  websocket: createWebSocketHandlers(store),
  port: process.env.PORT ?? 3000,
  development: process.env.NODE_ENV !== "production",
});

console.log(`Listening on ${server.url}`);
