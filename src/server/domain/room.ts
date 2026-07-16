import { nanoid } from "nanoid";
import { DECK, isNumericCard } from "./deck";
import type { Card, ChatMessage, Evaluation, NumericCard, Participant, Room } from "./types";

const AVATAR_COLORS = [
  "#e11d48",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export const ROOM_ID_LENGTH = 12;
export const GRACE_PERIOD_MS = 30 * 60 * 1000;

export function createRoom(): Room {
  return {
    id: nanoid(ROOM_ID_LENGTH),
    hostId: null,
    phase: "voting",
    participants: new Map(),
    chatMessages: [],
    createdAt: Date.now(),
    emptySince: null,
  };
}

export function addParticipant(room: Room, name: string, isSpectator: boolean): Participant {
  const participant: Participant = {
    id: nanoid(10),
    token: nanoid(21),
    name,
    color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]!,
    isSpectator,
    vote: null,
    connected: true,
  };
  room.participants.set(participant.id, participant);
  if (room.hostId === null) room.hostId = participant.id;
  room.emptySince = null;
  return participant;
}

export function findParticipantByToken(room: Room, token: string): Participant | undefined {
  for (const participant of room.participants.values()) {
    if (participant.token === token) return participant;
  }
  return undefined;
}

export function reconnectParticipant(room: Room, participant: Participant): void {
  participant.connected = true;
  room.emptySince = null;
}

// Map preserves insertion (= join) order, so the first connected entry is
// the longest-tenured remaining participant.
function pickNextHost(room: Room): string | null {
  for (const participant of room.participants.values()) {
    if (participant.connected) return participant.id;
  }
  return null;
}

export function disconnectParticipant(room: Room, participantId: string): void {
  const participant = room.participants.get(participantId);
  if (!participant) return;

  participant.connected = false;

  if (room.hostId === participantId) {
    room.hostId = pickNextHost(room);
  }

  const anyoneConnected = [...room.participants.values()].some((p) => p.connected);
  if (!anyoneConnected) room.emptySince = Date.now();
}

export function removeParticipant(room: Room, participantId: string): void {
  room.participants.delete(participantId);

  const anyoneConnected = [...room.participants.values()].some((p) => p.connected);
  if (!anyoneConnected) room.emptySince = Date.now();
}

export function toggleSpectator(participant: Participant): void {
  participant.isSpectator = !participant.isSpectator;
}

export function castVote(participant: Participant, card: Card): void {
  participant.vote = card;
}

export function votingParticipants(room: Room): Participant[] {
  return [...room.participants.values()].filter((p) => p.connected && !p.isSpectator);
}

export function allVotesIn(room: Room): boolean {
  const voters = votingParticipants(room);
  return voters.length > 0 && voters.every((p) => p.vote !== null);
}

export function reveal(room: Room): void {
  room.phase = "revealed";
}

export function startNewRound(room: Room): void {
  room.phase = "voting";
  for (const participant of room.participants.values()) {
    participant.vote = null;
  }
}

export function computeEvaluation(room: Room): Evaluation | null {
  const numericVotes = votingParticipants(room)
    .map((p) => p.vote)
    .filter((v): v is Card => v !== null)
    .filter(isNumericCard);

  if (numericVotes.length === 0) return null;

  const average = numericVotes.reduce<number>((sum, v) => sum + v, 0) / numericVotes.length;
  const numericDeck = DECK.filter(isNumericCard);

  let recommendedCard: NumericCard = numericDeck[0]!;
  let bestDiff = Infinity;
  for (const card of numericDeck) {
    const diff = Math.abs(card - average);
    if (diff < bestDiff - 1e-9) {
      bestDiff = diff;
      recommendedCard = card;
    } else if (Math.abs(diff - bestDiff) <= 1e-9) {
      recommendedCard = Math.max(recommendedCard, card) as NumericCard;
    }
  }

  return { average, recommendedCard };
}

export function addChatMessage(room: Room, participant: Participant, text: string): ChatMessage {
  const message: ChatMessage = {
    id: nanoid(10),
    participantId: participant.id,
    participantName: participant.name,
    participantColor: participant.color,
    text,
    sentAt: Date.now(),
  };
  room.chatMessages.push(message);
  return message;
}

export function isRoomExpired(room: Room, now: number = Date.now()): boolean {
  return room.emptySince !== null && now - room.emptySince >= GRACE_PERIOD_MS;
}
