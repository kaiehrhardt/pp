import * as domain from "../domain/room";
import type { Card, ChatMessage, Evaluation, Room, RpsMove } from "../domain/types";

export type ClientMessage =
  | { type: "vote"; card: Card }
  | { type: "toggleSpectator" }
  | { type: "newRound" }
  | { type: "reaction"; to: string; emoji: string }
  | { type: "kick"; participantId: string }
  | { type: "chat"; text: string }
  | { type: "guessAverage"; value: number }
  | { type: "duelChallenge"; opponentId: string }
  | { type: "duelRespond"; duelId: string; accept: boolean }
  | { type: "duelMove"; duelId: string; move: RpsMove }
  | { type: "duelCancel"; duelId: string };

export interface ParticipantDTO {
  id: string;
  name: string;
  color: string;
  isSpectator: boolean;
  connected: boolean;
  hasVoted: boolean;
  vote: Card | null;
  hasGuessed: boolean;
  guess: number | null;
  trophyCount: number;
}

export interface RoomStateDTO {
  roomId: string;
  hostId: string | null;
  phase: Room["phase"];
  participants: ParticipantDTO[];
  evaluation: Evaluation | null;
  unanimousVote: boolean;
  guessWinnerIds: string[];
}

export type ServerMessage =
  | { type: "joined"; roomId: string; participantId: string; token: string }
  | { type: "roomState"; room: RoomStateDTO }
  | { type: "reaction"; from: string; to: string; emoji: string }
  | { type: "kicked" }
  | { type: "chatHistory"; messages: ChatMessage[] }
  | { type: "chatMessage"; message: ChatMessage }
  | { type: "error"; message: string }
  | { type: "duelChallenge"; duelId: string; from: string }
  | { type: "duelPending"; duelId: string; to: string }
  | { type: "duelDeclined"; duelId: string }
  | { type: "duelCancelled"; duelId: string }
  | { type: "duelStarted"; duelId: string; opponentId: string; bestOf: number }
  | {
      type: "duelResult";
      duelId: string;
      opponentId: string;
      round: number;
      yourMove: RpsMove;
      opponentMove: RpsMove;
      outcome: "win" | "lose" | "draw";
      yourScore: number;
      opponentScore: number;
      bestOf: number;
      matchOver: boolean;
    };

export function toRoomStateDTO(room: Room, evaluation: Evaluation | null, viewerId: string): RoomStateDTO {
  const revealed = room.phase === "revealed";
  return {
    roomId: room.id,
    hostId: room.hostId,
    phase: room.phase,
    evaluation: revealed ? evaluation : null,
    unanimousVote: revealed && domain.isUnanimousVote(room),
    guessWinnerIds: revealed ? domain.computeGuessWinners(room, evaluation) : [],
    participants: [...room.participants.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isSpectator: p.isSpectator,
      connected: p.connected,
      hasVoted: p.vote !== null,
      vote: revealed || p.id === viewerId ? p.vote : null,
      hasGuessed: p.guess !== null,
      guess: revealed || p.id === viewerId ? p.guess : null,
      trophyCount: p.trophyCount,
    })),
  };
}
