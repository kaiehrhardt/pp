export type NumericCard = 1 | 2 | 3 | 5 | 8 | 13 | 21 | 34 | 55;
export type Card = NumericCard | "coffee" | "unknown";

export interface Participant {
  id: string;
  token: string;
  name: string;
  color: string;
  isSpectator: boolean;
  vote: Card | null;
  connected: boolean;
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

export interface Room {
  id: string;
  hostId: string | null;
  phase: RoomPhase;
  participants: Map<string, Participant>;
  chatMessages: ChatMessage[];
  createdAt: number;
  emptySince: number | null;
}

export interface Evaluation {
  average: number;
  recommendedCard: NumericCard;
}
