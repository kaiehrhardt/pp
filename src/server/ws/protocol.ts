import type { Card, Evaluation, Room } from "../domain/types";

export type ClientMessage =
  | { type: "vote"; card: Card }
  | { type: "toggleSpectator" }
  | { type: "newRound" }
  | { type: "reaction"; to: string; emoji: string }
  | { type: "kick"; participantId: string };

export interface ParticipantDTO {
  id: string;
  name: string;
  color: string;
  isSpectator: boolean;
  connected: boolean;
  hasVoted: boolean;
  vote: Card | null;
}

export interface RoomStateDTO {
  roomId: string;
  hostId: string | null;
  phase: Room["phase"];
  participants: ParticipantDTO[];
  evaluation: Evaluation | null;
}

export type ServerMessage =
  | { type: "joined"; roomId: string; participantId: string; token: string }
  | { type: "roomState"; room: RoomStateDTO }
  | { type: "reaction"; from: string; to: string; emoji: string }
  | { type: "kicked" }
  | { type: "error"; message: string };

export function toRoomStateDTO(room: Room, evaluation: Evaluation | null, viewerId: string): RoomStateDTO {
  const revealed = room.phase === "revealed";
  return {
    roomId: room.id,
    hostId: room.hostId,
    phase: room.phase,
    evaluation: revealed ? evaluation : null,
    participants: [...room.participants.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isSpectator: p.isSpectator,
      connected: p.connected,
      hasVoted: p.vote !== null,
      vote: revealed || p.id === viewerId ? p.vote : null,
    })),
  };
}
