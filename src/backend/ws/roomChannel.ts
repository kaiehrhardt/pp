import type { ServerWebSocket } from "bun";
import * as duelDomain from "../domain/duel";
import { computeEvaluation } from "../domain/room";
import type { RoomStore } from "../domain/store";
import type { Duel, Participant, Room, RoomPhase, RpsMove } from "../domain/types";
import { getSubscriber, publisher } from "../redis/pubsub";
import { toRoomStateDTO, type ServerMessage } from "./protocol";

export interface SocketData {
  roomId: string;
  participantId: string;
}

export type DuelCommand =
  | { type: "duelRespond"; participantId: string; duelId: string; accept: boolean }
  | { type: "duelMove"; participantId: string; duelId: string; move: RpsMove }
  | { type: "duelCancel"; participantId: string; duelId: string };

interface SerializedRoom {
  id: string;
  hostId: string | null;
  phase: RoomPhase;
  participants: Participant[];
  createdAt: number;
  emptySince: number | null;
}

type RoomEnvelope =
  | { kind: "roomSnapshot"; room: SerializedRoom }
  | { kind: "fanout"; message: ServerMessage }
  | { kind: "unicast"; participantId: string; message: ServerMessage }
  | { kind: "duelCommand"; duelId: string; command: DuelCommand };

function channelFor(roomId: string): string {
  return `room:${roomId}:events`;
}

function serializeRoom(room: Room): SerializedRoom {
  return {
    id: room.id,
    hostId: room.hostId,
    phase: room.phase,
    participants: [...room.participants.values()],
    createdAt: room.createdAt,
    emptySince: room.emptySince,
  };
}

// Only `.participants`/`.phase` are ever read off the result (by computeEvaluation and
// toRoomStateDTO) — chatMessages/duels are never Turso-backed and are irrelevant here,
// same placeholder-shell pattern store.ts uses for reusing pure domain functions.
function deserializeRoom(s: SerializedRoom): Room {
  return {
    id: s.id,
    hostId: s.hostId,
    phase: s.phase,
    participants: new Map(s.participants.map((p) => [p.id, p])),
    chatMessages: [],
    duels: new Map(),
    createdAt: s.createdAt,
    emptySince: s.emptySince,
  };
}

export function createRoomChannel(store: RoomStore) {
  // Local-to-this-pod only: which sockets are actually here. Subscribing to a room's
  // Redis channel is driven entirely off this — a pod only listens for rooms it has a
  // real connection for.
  const localSockets = new Map<string, Map<string, Set<ServerWebSocket<SocketData>>>>();

  // Duels are deliberately never written to Turso (ADR-0003 / CONTEXT.md: the whole
  // lifecycle is ephemeral, "purely for fun", already disposable on disconnect today).
  // Whichever pod processes the initial duelChallenge owns the Duel for its lifetime,
  // in plain per-pod memory, per room. duelCommand envelopes route a respond/move/cancel
  // to whichever pod that turns out to be.
  const duelsByRoom = new Map<string, Map<string, Duel>>();

  const subscribedRooms = new Set<string>();

  function getDuels(roomId: string): Map<string, Duel> {
    let duels = duelsByRoom.get(roomId);
    if (!duels) {
      duels = new Map();
      duelsByRoom.set(roomId, duels);
    }
    return duels;
  }

  function roomShapeForDuels(roomId: string): Room {
    return {
      id: roomId,
      hostId: null,
      phase: "voting",
      participants: new Map(),
      chatMessages: [],
      duels: getDuels(roomId),
      createdAt: 0,
      emptySince: null,
    };
  }

  function sendLocal(roomId: string, participantId: string, message: ServerMessage): void {
    const conns = localSockets.get(roomId)?.get(participantId);
    if (!conns) return;
    const payload = JSON.stringify(message);
    for (const conn of conns) conn.send(payload);
  }

  // The client relies on the server closing its socket after a "kicked" message
  // (it never calls ws.close() itself — see useRoomSocket.ts's kickedRef handling) —
  // so whichever pod actually has that participant's local connection must do it,
  // which might not be the pod that processed the "kick" WS message at all.
  function closeLocalSockets(roomId: string, participantId: string): void {
    const conns = localSockets.get(roomId)?.get(participantId);
    if (!conns) return;
    for (const conn of conns) conn.close();
  }

  async function deliverRoomState(roomId: string, room: Room): Promise<void> {
    const localParticipants = localSockets.get(roomId);
    if (!localParticipants) return;
    const evaluation = computeEvaluation(room);
    // Only actually changes on reveal, but fetched on every delivery for simplicity —
    // this app is human-paced, not high-throughput, so the extra read is a non-issue.
    const sessionEvaluation = await store.getSessionEvaluation(roomId);
    for (const participantId of localParticipants.keys()) {
      sendLocal(roomId, participantId, {
        type: "roomState",
        room: toRoomStateDTO(room, evaluation, participantId, sessionEvaluation),
      });
    }
  }

  async function processDuelCommand(roomId: string, duelId: string, command: DuelCommand): Promise<void> {
    const duel = getDuels(roomId).get(duelId);
    if (!duel) return; // this pod doesn't own it — another subscriber will

    switch (command.type) {
      case "duelRespond": {
        if (duel.opponentId !== command.participantId || duel.status !== "pending") return;
        if (!command.accept) {
          duelDomain.removeDuel(roomShapeForDuels(roomId), duel.id);
          await sendToParticipant(roomId, duel.challengerId, { type: "duelDeclined", duelId: duel.id });
          return;
        }
        duelDomain.acceptDuel(duel);
        await sendToParticipant(roomId, duel.challengerId, {
          type: "duelStarted",
          duelId: duel.id,
          opponentId: duel.opponentId,
          bestOf: duelDomain.RPS_BEST_OF,
        });
        await sendToParticipant(roomId, duel.opponentId, {
          type: "duelStarted",
          duelId: duel.id,
          opponentId: duel.challengerId,
          bestOf: duelDomain.RPS_BEST_OF,
        });
        return;
      }
      case "duelMove": {
        if (duel.status !== "active") return;
        if (duel.challengerId !== command.participantId && duel.opponentId !== command.participantId) return;
        if (!duelDomain.isValidRpsMove(command.move)) return;
        duelDomain.submitMove(duel, command.participantId, command.move);
        if (!duelDomain.bothMovesIn(duel)) return;

        const moves = new Map(duel.moves);
        const { winnerId } = duelDomain.resolveRound(duel);
        duelDomain.recordRoundResult(duel, winnerId);
        const matchOver = duelDomain.isMatchOver(duel);

        for (const [selfId, otherId] of [
          [duel.challengerId, duel.opponentId],
          [duel.opponentId, duel.challengerId],
        ] as const) {
          const outcome = winnerId === null ? "draw" : winnerId === selfId ? "win" : "lose";
          await sendToParticipant(roomId, selfId, {
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

        if (matchOver) {
          const matchWinnerId = duelDomain.matchWinnerId(duel);
          duelDomain.removeDuel(roomShapeForDuels(roomId), duel.id);
          if (matchWinnerId) {
            const updated = await store.awardTrophy(roomId, matchWinnerId);
            if (updated) await publishRoomState(updated);
          }
        }
        return;
      }
      case "duelCancel": {
        if (duel.challengerId !== command.participantId || duel.status !== "pending") return;
        duelDomain.removeDuel(roomShapeForDuels(roomId), duel.id);
        await sendToParticipant(roomId, duel.opponentId, { type: "duelCancelled", duelId: duel.id });
        return;
      }
    }
  }

  async function handleEnvelope(roomId: string, raw: string): Promise<void> {
    let envelope: RoomEnvelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      return;
    }

    switch (envelope.kind) {
      case "roomSnapshot":
        await deliverRoomState(roomId, deserializeRoom(envelope.room));
        return;
      case "fanout": {
        const localParticipants = localSockets.get(roomId);
        if (!localParticipants) return;
        for (const participantId of localParticipants.keys()) sendLocal(roomId, participantId, envelope.message);
        return;
      }
      case "unicast":
        sendLocal(roomId, envelope.participantId, envelope.message);
        if (envelope.message.type === "kicked") {
          setTimeout(() => closeLocalSockets(roomId, envelope.participantId), 100);
        }
        return;
      case "duelCommand":
        await processDuelCommand(roomId, envelope.duelId, envelope.command);
        return;
    }
  }

  async function reconcileRoom(roomId: string): Promise<void> {
    const room = await store.get(roomId);
    if (room) await deliverRoomState(roomId, room);
  }

  async function onSubscriberReconnect(): Promise<void> {
    const client = await getSubscriber(onSubscriberReconnect);
    for (const roomId of subscribedRooms) {
      await client.subscribe(channelFor(roomId), (message) => void handleEnvelope(roomId, message));
      await reconcileRoom(roomId); // papers over anything missed while disconnected
    }
  }

  async function ensureSubscribed(roomId: string): Promise<void> {
    if (subscribedRooms.has(roomId)) return;
    subscribedRooms.add(roomId);
    const client = await getSubscriber(onSubscriberReconnect);
    await client.subscribe(channelFor(roomId), (message) => void handleEnvelope(roomId, message));
  }

  async function maybeUnsubscribe(roomId: string): Promise<void> {
    if (localSockets.has(roomId)) return; // still has local connections
    if (!subscribedRooms.delete(roomId)) return;
    duelsByRoom.delete(roomId); // no local participants left on this pod for this room
    const client = await getSubscriber(onSubscriberReconnect);
    await client.unsubscribe(channelFor(roomId));
  }

  // Awaited by callers before publishing anything for this room — otherwise a publish
  // immediately after connecting can race the subscribe and get lost, since Redis
  // pub/sub never buffers for a not-yet-subscribed client.
  async function registerSocket(ws: ServerWebSocket<SocketData>): Promise<void> {
    const { roomId, participantId } = ws.data;
    let room = localSockets.get(roomId);
    if (!room) {
      room = new Map();
      localSockets.set(roomId, room);
    }
    let conns = room.get(participantId);
    if (!conns) {
      conns = new Set();
      room.set(participantId, conns);
    }
    conns.add(ws);
    await ensureSubscribed(roomId);
  }

  function unregisterSocket(ws: ServerWebSocket<SocketData>): void {
    const { roomId, participantId } = ws.data;
    const room = localSockets.get(roomId);
    if (!room) return;
    const conns = room.get(participantId);
    if (conns) {
      conns.delete(ws);
      if (conns.size === 0) room.delete(participantId);
    }
    if (room.size === 0) {
      localSockets.delete(roomId);
      void maybeUnsubscribe(roomId);
    }
  }

  async function publishRoomState(room: Room): Promise<void> {
    await publisher.publish(channelFor(room.id), JSON.stringify({ kind: "roomSnapshot", room: serializeRoom(room) } satisfies RoomEnvelope));
  }

  async function publishFanout(roomId: string, message: ServerMessage): Promise<void> {
    await publisher.publish(channelFor(roomId), JSON.stringify({ kind: "fanout", message } satisfies RoomEnvelope));
  }

  async function sendToParticipant(roomId: string, participantId: string, message: ServerMessage): Promise<void> {
    await publisher.publish(channelFor(roomId), JSON.stringify({ kind: "unicast", participantId, message } satisfies RoomEnvelope));
  }

  async function publishDuelCommand(roomId: string, duelId: string, command: DuelCommand): Promise<void> {
    await publisher.publish(channelFor(roomId), JSON.stringify({ kind: "duelCommand", duelId, command } satisfies RoomEnvelope));
  }

  function createOwnedDuel(room: Room, challengerId: string, opponentId: string): Duel | null {
    room.duels = getDuels(room.id);
    return duelDomain.createDuel(room, challengerId, opponentId);
  }

  async function cancelDuelsForParticipant(roomId: string, participantId: string): Promise<void> {
    const shape = roomShapeForDuels(roomId);
    for (const duel of duelDomain.cancelDuelsFor(shape, participantId)) {
      const other = duel.challengerId === participantId ? duel.opponentId : duel.challengerId;
      await sendToParticipant(roomId, other, { type: "duelCancelled", duelId: duel.id });
    }
  }

  return {
    registerSocket,
    unregisterSocket,
    sendLocal,
    publishRoomState,
    publishFanout,
    sendToParticipant,
    publishDuelCommand,
    createOwnedDuel,
    cancelDuelsForParticipant,
  };
}

export type RoomChannel = ReturnType<typeof createRoomChannel>;
