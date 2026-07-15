import type { ServerWebSocket } from "bun";
import { isValidCard } from "../domain/deck";
import * as domain from "../domain/room";
import type { RoomStore } from "../domain/store";
import type { Room } from "../domain/types";
import { toRoomStateDTO, type ClientMessage, type ServerMessage } from "./protocol";

export interface SocketData {
  roomId: string;
  participantId: string;
}

const sockets = new Map<string, Set<ServerWebSocket<SocketData>>>();

function socketKey(roomId: string, participantId: string): string {
  return `${roomId}:${participantId}`;
}

function registerSocket(ws: ServerWebSocket<SocketData>): void {
  const key = socketKey(ws.data.roomId, ws.data.participantId);
  let conns = sockets.get(key);
  if (!conns) {
    conns = new Set();
    sockets.set(key, conns);
  }
  conns.add(ws);
}

function unregisterSocket(ws: ServerWebSocket<SocketData>): void {
  const key = socketKey(ws.data.roomId, ws.data.participantId);
  const conns = sockets.get(key);
  if (!conns) return;
  conns.delete(ws);
  if (conns.size === 0) sockets.delete(key);
}

function send(roomId: string, participantId: string, message: ServerMessage): void {
  const conns = sockets.get(socketKey(roomId, participantId));
  if (!conns) return;
  const payload = JSON.stringify(message);
  for (const conn of conns) conn.send(payload);
}

function broadcastRoomState(room: Room): void {
  const evaluation = domain.computeEvaluation(room);
  for (const participant of room.participants.values()) {
    const dto = toRoomStateDTO(room, evaluation, participant.id);
    send(room.id, participant.id, { type: "roomState", room: dto });
  }
}

function broadcastReaction(room: Room, from: string, to: string, emoji: string): void {
  for (const participant of room.participants.values()) {
    send(room.id, participant.id, { type: "reaction", from, to, emoji });
  }
}

function maybeAutoReveal(room: Room): void {
  if (room.phase === "voting" && domain.allVotesIn(room)) {
    domain.reveal(room);
  }
}

export function createWebSocketHandlers(store: RoomStore) {
  return {
    open(ws: ServerWebSocket<SocketData>) {
      registerSocket(ws);
      const room = store.get(ws.data.roomId);
      const participant = room?.participants.get(ws.data.participantId);
      if (!room || !participant) return;

      send(room.id, participant.id, {
        type: "joined",
        roomId: room.id,
        participantId: participant.id,
        token: participant.token,
      });
      broadcastRoomState(room);
    },

    message(ws: ServerWebSocket<SocketData>, raw: string | Buffer) {
      const room = store.get(ws.data.roomId);
      if (!room) return;
      const participant = room.participants.get(ws.data.participantId);
      if (!participant) return;

      let message: ClientMessage;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }

      switch (message.type) {
        case "vote": {
          if (participant.isSpectator || room.phase !== "voting") return;
          if (!isValidCard(message.card)) return;
          domain.castVote(participant, message.card);
          maybeAutoReveal(room);
          broadcastRoomState(room);
          return;
        }
        case "toggleSpectator": {
          domain.toggleSpectator(participant);
          maybeAutoReveal(room);
          broadcastRoomState(room);
          return;
        }
        case "newRound": {
          if (room.hostId !== participant.id) return;
          domain.startNewRound(room);
          broadcastRoomState(room);
          return;
        }
        case "reaction": {
          if (!room.participants.has(message.to)) return;
          broadcastReaction(room, participant.id, message.to, message.emoji);
          return;
        }
      }
    },

    close(ws: ServerWebSocket<SocketData>) {
      unregisterSocket(ws);
      const room = store.get(ws.data.roomId);
      if (!room) return;
      domain.disconnectParticipant(room, ws.data.participantId);
      broadcastRoomState(room);
    },
  };
}
