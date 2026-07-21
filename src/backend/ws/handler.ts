import type { ServerWebSocket } from "bun";
import { isValidCard } from "../domain/deck";
import * as domain from "../domain/room";
import type { RoomStore } from "../domain/store";
import type { Room } from "../domain/types";
import { logger } from "../logger";
import type { ClientMessage } from "./protocol";
import type { RoomChannel, SocketData } from "./roomChannel";

export type { SocketData } from "./roomChannel";

const MAX_CHAT_MESSAGE_LENGTH = 500;

async function maybeAutoReveal(store: RoomStore, room: Room): Promise<Room> {
  if (room.phase === "voting" && domain.allVotesIn(room)) {
    const revealed = await store.reveal(room.id);
    if (revealed) return revealed;
  }
  return room;
}

export function createWebSocketHandlers(store: RoomStore, roomChannel: RoomChannel) {
  return {
    async open(ws: ServerWebSocket<SocketData>) {
      await roomChannel.registerSocket(ws);
      const room = await store.get(ws.data.roomId);
      const participant = room?.participants.get(ws.data.participantId);
      if (!room || !participant) return;

      logger.debug("ws connected", { roomId: room.id, participantId: participant.id });
      roomChannel.sendLocal(room.id, participant.id, {
        type: "joined",
        roomId: room.id,
        participantId: participant.id,
        token: participant.token,
      });
      const chatMessages = await store.getChatHistory(room.id);
      roomChannel.sendLocal(room.id, participant.id, { type: "chatHistory", messages: chatMessages });
      await roomChannel.publishRoomState(room);
    },

    async message(ws: ServerWebSocket<SocketData>, raw: string | Buffer) {
      const room = await store.get(ws.data.roomId);
      if (!room) return;
      const participant = room.participants.get(ws.data.participantId);
      if (!participant) return;

      let message: ClientMessage;
      try {
        message = JSON.parse(String(raw));
      } catch {
        logger.debug("ignored malformed ws message", { roomId: room.id, participantId: participant.id });
        return;
      }

      logger.debug("ws message received", { roomId: room.id, participantId: participant.id, type: message.type });

      switch (message.type) {
        case "vote": {
          if (participant.isSpectator || room.phase !== "voting") return;
          if (!isValidCard(message.card)) return;
          const updated = await store.castVote(room.id, participant.id, message.card);
          if (!updated) return;
          await roomChannel.publishRoomState(await maybeAutoReveal(store, updated));
          return;
        }
        case "toggleSpectator": {
          const updated = await store.toggleSpectator(room.id, participant.id);
          if (!updated) return;
          await roomChannel.publishRoomState(await maybeAutoReveal(store, updated));
          return;
        }
        case "newRound": {
          if (room.hostId !== participant.id) return;
          const updated = await store.startNewRound(room.id);
          if (updated) await roomChannel.publishRoomState(updated);
          return;
        }
        case "reaction": {
          if (!room.participants.has(message.to)) return;
          await roomChannel.publishFanout(room.id, { type: "reaction", from: participant.id, to: message.to, emoji: message.emoji });
          await store.incrementReactionsThrown(room.id);
          await roomChannel.publishRoomState(room);
          return;
        }
        case "kick": {
          if (room.hostId !== participant.id) return;
          if (message.participantId === participant.id) return;
          if (!room.participants.has(message.participantId)) return;

          logger.info("participant kicked", { roomId: room.id, actorId: participant.id, targetId: message.participantId });
          await roomChannel.sendToParticipant(room.id, message.participantId, { type: "kicked" });
          await roomChannel.cancelDuelsForParticipant(room.id, message.participantId);
          const updated = await store.removeParticipant(room.id, message.participantId);
          if (updated) await roomChannel.publishRoomState(await maybeAutoReveal(store, updated));
          return;
        }
        case "guessAverage": {
          if (participant.isSpectator || room.phase !== "voting") return;
          if (!Number.isFinite(message.value)) return;
          const updated = await store.castGuess(room.id, participant.id, message.value);
          if (updated) await roomChannel.publishRoomState(updated);
          return;
        }
        case "duelChallenge": {
          const opponent = room.participants.get(message.opponentId);
          if (!opponent || opponent.id === participant.id || !opponent.connected) return;
          const duel = roomChannel.createOwnedDuel(room, participant.id, opponent.id);
          if (!duel) return;
          await roomChannel.sendToParticipant(room.id, opponent.id, { type: "duelChallenge", duelId: duel.id, from: participant.id });
          await roomChannel.sendToParticipant(room.id, participant.id, { type: "duelPending", duelId: duel.id, to: opponent.id });
          return;
        }
        // Respond/move/cancel never touch the Duel directly here — this pod might not
        // be the one that owns it (the challenger and opponent can be on different
        // pods). Just relay the command; whichever pod actually holds the Duel acts on
        // it, in roomChannel's duelCommand handling.
        case "duelRespond": {
          await roomChannel.publishDuelCommand(room.id, message.duelId, {
            type: "duelRespond",
            participantId: participant.id,
            duelId: message.duelId,
            accept: message.accept,
          });
          return;
        }
        case "duelMove": {
          await roomChannel.publishDuelCommand(room.id, message.duelId, {
            type: "duelMove",
            participantId: participant.id,
            duelId: message.duelId,
            move: message.move,
          });
          return;
        }
        case "duelCancel": {
          await roomChannel.publishDuelCommand(room.id, message.duelId, {
            type: "duelCancel",
            participantId: participant.id,
            duelId: message.duelId,
          });
          return;
        }
        case "setAvatar": {
          if (!domain.isValidAvatar(message.avatar)) return;
          const updated = await store.setAvatar(room.id, participant.id, message.avatar);
          if (updated) await roomChannel.publishRoomState(updated);
          return;
        }
        case "chat": {
          const text = message.text.trim();
          if (!text || text.length > MAX_CHAT_MESSAGE_LENGTH) return;
          const chatMessage = await store.addChatMessage(room.id, participant, text);
          await roomChannel.publishFanout(room.id, { type: "chatMessage", message: chatMessage });
          return;
        }
      }
    },

    async close(ws: ServerWebSocket<SocketData>) {
      roomChannel.unregisterSocket(ws);
      const room = await store.get(ws.data.roomId);
      if (!room) return;
      logger.debug("ws disconnected", { roomId: room.id, participantId: ws.data.participantId });
      await roomChannel.cancelDuelsForParticipant(room.id, ws.data.participantId);
      const updated = await store.disconnectParticipant(room.id, ws.data.participantId);
      if (updated) await roomChannel.publishRoomState(updated);
    },
  };
}
