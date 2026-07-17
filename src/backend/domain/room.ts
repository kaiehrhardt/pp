import { nanoid } from "nanoid";
import { DECK, isNumericCard } from "./deck";
import type { Card, ChatMessage, Evaluation, NumericCard, Participant, Room } from "./types";

const EPSILON = 1e-9;

const AVATAR_COLORS = [
  "#e11d48",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
];

export const ROOM_ID_LENGTH = 12;
export const GRACE_PERIOD_MS = 30 * 60 * 1000;
export const MAX_PARTICIPANTS = 15;
export const DEFAULT_AVATAR = "🙂";
const MAX_AVATAR_LENGTH = 8;

export function isValidAvatar(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_AVATAR_LENGTH;
}

export function createRoom(): Room {
  return {
    id: nanoid(ROOM_ID_LENGTH),
    hostId: null,
    phase: "voting",
    participants: new Map(),
    chatMessages: [],
    duels: new Map(),
    createdAt: Date.now(),
    emptySince: null,
  };
}

export function isRoomFull(room: Room): boolean {
  return room.participants.size >= MAX_PARTICIPANTS;
}

export function addParticipant(room: Room, name: string, isSpectator: boolean, avatar: string = ""): Participant {
  const participant: Participant = {
    id: nanoid(10),
    token: nanoid(21),
    name,
    color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]!,
    isSpectator,
    vote: null,
    guess: null,
    connected: true,
    trophyCount: 0,
    avatar: isValidAvatar(avatar) ? avatar : DEFAULT_AVATAR,
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

export function castGuess(participant: Participant, value: number): void {
  participant.guess = value;
}

export function setAvatar(participant: Participant, avatar: string): void {
  participant.avatar = avatar;
}

export function votingParticipants(room: Room): Participant[] {
  return [...room.participants.values()].filter((p) => p.connected && !p.isSpectator);
}

export function allVotesIn(room: Room): boolean {
  const voters = votingParticipants(room);
  return voters.length > 0 && voters.every((p) => p.vote !== null);
}

export function isUnanimousVote(room: Room): boolean {
  const voters = votingParticipants(room);
  if (voters.length < 2) return false;
  const [first, ...rest] = voters;
  return first!.vote !== null && rest.every((p) => p.vote === first!.vote);
}

export function reveal(room: Room): void {
  room.phase = "revealed";

  const evaluation = computeEvaluation(room);
  for (const id of computeGuessWinners(room, evaluation)) {
    room.participants.get(id)!.trophyCount += 1;
  }
  if (isUnanimousVote(room)) {
    for (const participant of votingParticipants(room)) participant.trophyCount += 1;
  }
}

export function startNewRound(room: Room): void {
  room.phase = "voting";
  for (const participant of room.participants.values()) {
    participant.vote = null;
    participant.guess = null;
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

export function computeGuessWinners(room: Room, evaluation: Evaluation | null): string[] {
  if (!evaluation) return [];
  const guessers = votingParticipants(room).filter((p) => p.guess !== null);
  if (guessers.length === 0) return [];

  let best = Infinity;
  for (const p of guessers) {
    const diff = Math.abs(p.guess! - evaluation.average);
    if (diff < best) best = diff;
  }
  return guessers.filter((p) => Math.abs(p.guess! - evaluation.average) - best <= EPSILON).map((p) => p.id);
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
