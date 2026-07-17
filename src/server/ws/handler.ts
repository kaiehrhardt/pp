import type { ServerWebSocket } from "bun";
import { isValidCard } from "../domain/deck";
import * as duelDomain from "../domain/duel";
import * as domain from "../domain/room";
import type { RoomStore } from "../domain/store";
import type { ChatMessage, Duel, Room, RpsMove } from "../domain/types";
import { toRoomStateDTO, type ClientMessage, type ServerMessage } from "./protocol";

const MAX_CHAT_MESSAGE_LENGTH = 500;

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

function closeSockets(roomId: string, participantId: string): void {
  const conns = sockets.get(socketKey(roomId, participantId));
  if (!conns) return;
  for (const conn of conns) conn.close();
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

function broadcastChatMessage(room: Room, message: ChatMessage): void {
  for (const participant of room.participants.values()) {
    send(room.id, participant.id, { type: "chatMessage", message });
  }
}

function maybeAutoReveal(room: Room): void {
  if (room.phase === "voting" && domain.allVotesIn(room)) {
    domain.reveal(room);
  }
}

function sendDuelResult(
  room: Room,
  duel: Duel,
  moves: Map<string, RpsMove>,
  winnerId: string | null,
  matchOver: boolean,
): void {
  for (const [selfId, otherId] of [
    [duel.challengerId, duel.opponentId],
    [duel.opponentId, duel.challengerId],
  ] as const) {
    const outcome = winnerId === null ? "draw" : winnerId === selfId ? "win" : "lose";
    send(room.id, selfId, {
      type: "duelResult",
      duelId: duel.id,
      opponentId: otherId,
      round: duel.roundsPlayed,
      yourMove: moves.get(selfId)!,
      opponentMove: moves.get(otherId)!,
      outcome,
      yourScore: duel.wins.get(selfId) ?? 0,
      opponentScore: duel.wins.get(otherId) ?? 0,
      bestOf: duelDomain.RPS_BEST_OF,
      matchOver,
    });
  }
}

function cancelDuelsAndNotify(room: Room, participantId: string): void {
  for (const duel of duelDomain.cancelDuelsFor(room, participantId)) {
    const other = duel.challengerId === participantId ? duel.opponentId : duel.challengerId;
    send(room.id, other, { type: "duelCancelled", duelId: duel.id });
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
      send(room.id, participant.id, { type: "chatHistory", messages: room.chatMessages });
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
        case "kick": {
          if (room.hostId !== participant.id) return;
          if (message.participantId === participant.id) return;
          if (!room.participants.has(message.participantId)) return;

          send(room.id, message.participantId, { type: "kicked" });
          cancelDuelsAndNotify(room, message.participantId);
          domain.removeParticipant(room, message.participantId);
          maybeAutoReveal(room);
          broadcastRoomState(room);
          setTimeout(() => closeSockets(room.id, message.participantId), 100);
          return;
        }
        case "guessAverage": {
          if (participant.isSpectator || room.phase !== "voting") return;
          if (!Number.isFinite(message.value)) return;
          domain.castGuess(participant, message.value);
          broadcastRoomState(room);
          return;
        }
        case "duelChallenge": {
          if (room.phase !== "voting") return;
          const opponent = room.participants.get(message.opponentId);
          if (!opponent || opponent.id === participant.id || !opponent.connected) return;
          const duel = duelDomain.createDuel(room, participant.id, opponent.id);
          if (!duel) return;
          send(room.id, opponent.id, { type: "duelChallenge", duelId: duel.id, from: participant.id });
          send(room.id, participant.id, { type: "duelPending", duelId: duel.id, to: opponent.id });
          return;
        }
        case "duelRespond": {
          const duel = room.duels.get(message.duelId);
          if (!duel || duel.opponentId !== participant.id || duel.status !== "pending") return;
          if (!message.accept) {
            duelDomain.removeDuel(room, duel.id);
            send(room.id, duel.challengerId, { type: "duelDeclined", duelId: duel.id });
            return;
          }
          duelDomain.acceptDuel(duel);
          send(room.id, duel.challengerId, {
            type: "duelStarted",
            duelId: duel.id,
            opponentId: duel.opponentId,
            bestOf: duelDomain.RPS_BEST_OF,
          });
          send(room.id, duel.opponentId, {
            type: "duelStarted",
            duelId: duel.id,
            opponentId: duel.challengerId,
            bestOf: duelDomain.RPS_BEST_OF,
          });
          return;
        }
        case "duelMove": {
          const duel = room.duels.get(message.duelId);
          if (!duel || duel.status !== "active") return;
          if (duel.challengerId !== participant.id && duel.opponentId !== participant.id) return;
          if (!duelDomain.isValidRpsMove(message.move)) return;
          duelDomain.submitMove(duel, participant.id, message.move);
          if (!duelDomain.bothMovesIn(duel)) return;
          const moves = new Map(duel.moves);
          const { winnerId } = duelDomain.resolveRound(duel);
          duelDomain.recordRoundResult(duel, winnerId);
          const matchOver = duelDomain.isMatchOver(duel);
          sendDuelResult(room, duel, moves, winnerId, matchOver);
          if (matchOver) {
            const matchWinnerId = duelDomain.matchWinnerId(duel);
            if (matchWinnerId) room.participants.get(matchWinnerId)!.trophyCount += 1;
            duelDomain.removeDuel(room, duel.id);
            broadcastRoomState(room);
          }
          return;
        }
        case "duelCancel": {
          const duel = room.duels.get(message.duelId);
          if (!duel || duel.challengerId !== participant.id || duel.status !== "pending") return;
          duelDomain.removeDuel(room, duel.id);
          send(room.id, duel.opponentId, { type: "duelCancelled", duelId: duel.id });
          return;
        }
        case "chat": {
          const text = message.text.trim();
          if (!text || text.length > MAX_CHAT_MESSAGE_LENGTH) return;
          const chatMessage = domain.addChatMessage(room, participant, text);
          broadcastChatMessage(room, chatMessage);
          return;
        }
      }
    },

    close(ws: ServerWebSocket<SocketData>) {
      unregisterSocket(ws);
      const room = store.get(ws.data.roomId);
      if (!room) return;
      cancelDuelsAndNotify(room, ws.data.participantId);
      domain.disconnectParticipant(room, ws.data.participantId);
      broadcastRoomState(room);
    },
  };
}
