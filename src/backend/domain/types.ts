export type NumericCard = 1 | 2 | 3 | 5 | 8 | 13 | 21 | 34 | 55;
export type Card = NumericCard | "coffee" | "unknown";

export interface Participant {
  id: string;
  token: string;
  name: string;
  color: string;
  isSpectator: boolean;
  vote: Card | null;
  guess: number | null;
  connected: boolean;
  trophyCount: number;
  avatar: string;
}

export type RoomPhase = "voting" | "revealed";

export interface ChatMessage {
  id: string;
  participantId: string;
  participantName: string;
  participantColor: string;
  text: string;
  sentAt: number;
}

export type RpsMove = "rock" | "paper" | "scissors";
export type DuelStatus = "pending" | "active";

export interface Duel {
  id: string;
  challengerId: string;
  opponentId: string;
  status: DuelStatus;
  moves: Map<string, RpsMove>;
  wins: Map<string, number>;
  roundsPlayed: number;
  createdAt: number;
}

export interface Room {
  id: string;
  hostId: string | null;
  // The participant who was host when their connection dropped, entitled to get the
  // role back on reconnect — as long as no one else has used host powers meanwhile
  // (see startNewRound/removeParticipant, which forfeit it on behalf of the acting host).
  pendingHostId: string | null;
  phase: RoomPhase;
  participants: Map<string, Participant>;
  chatMessages: ChatMessage[];
  duels: Map<string, Duel>;
  createdAt: number;
  emptySince: number | null;
}

export interface Evaluation {
  average: number;
  recommendedCard: NumericCard;
}

// A rollup of session-wide activity across the Room's whole lifetime — null only once
// truly nothing has happened yet (no round revealed, no Reaction thrown, no Duel
// completed, no Trophy won). average/min/max are null exactly when roundCount is 0
// (e.g. no round revealed yet, or every vote so far was coffee/unknown); they're
// never null once roundCount is positive.
export interface SessionEvaluation {
  roundCount: number;
  average: number | null;
  min: number | null;
  max: number | null;
  reactionsThrown: number;
  duelsCompleted: number;
  trophiesWon: number;
}
