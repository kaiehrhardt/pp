import { nanoid } from "nanoid";
import type { Duel, Room, RpsMove } from "./types";

export const RPS_BEST_OF = 3;
export const RPS_WINS_NEEDED = Math.ceil(RPS_BEST_OF / 2);

export function isValidRpsMove(value: unknown): value is RpsMove {
  return value === "rock" || value === "paper" || value === "scissors";
}

export function findActiveDuelFor(room: Room, participantId: string): Duel | undefined {
  for (const duel of room.duels.values()) {
    if (duel.challengerId === participantId || duel.opponentId === participantId) return duel;
  }
  return undefined;
}

export function createDuel(room: Room, challengerId: string, opponentId: string): Duel | null {
  if (challengerId === opponentId) return null;
  if (!room.participants.get(opponentId)?.connected) return null;
  if (findActiveDuelFor(room, challengerId) || findActiveDuelFor(room, opponentId)) return null;

  const duel: Duel = {
    id: nanoid(10),
    challengerId,
    opponentId,
    status: "pending",
    moves: new Map(),
    wins: new Map([
      [challengerId, 0],
      [opponentId, 0],
    ]),
    roundsPlayed: 0,
    createdAt: Date.now(),
  };
  room.duels.set(duel.id, duel);
  return duel;
}

export function acceptDuel(duel: Duel): void {
  duel.status = "active";
}

export function removeDuel(room: Room, duelId: string): void {
  room.duels.delete(duelId);
}

export function cancelDuelsFor(room: Room, participantId: string): Duel[] {
  const affected = [...room.duels.values()].filter(
    (d) => d.challengerId === participantId || d.opponentId === participantId,
  );
  for (const d of affected) room.duels.delete(d.id);
  return affected;
}

export function submitMove(duel: Duel, participantId: string, move: RpsMove): void {
  if (!duel.moves.has(participantId)) duel.moves.set(participantId, move);
}

export function bothMovesIn(duel: Duel): boolean {
  return duel.moves.size === 2;
}

const BEATS: Record<RpsMove, RpsMove> = { rock: "scissors", paper: "rock", scissors: "paper" };

export function resolveRound(duel: Duel): { winnerId: string | null } {
  const a = duel.moves.get(duel.challengerId)!;
  const b = duel.moves.get(duel.opponentId)!;
  if (a === b) return { winnerId: null };
  return { winnerId: BEATS[a] === b ? duel.challengerId : duel.opponentId };
}

export function recordRoundResult(duel: Duel, winnerId: string | null): void {
  duel.roundsPlayed += 1;
  if (winnerId) duel.wins.set(winnerId, (duel.wins.get(winnerId) ?? 0) + 1);
  duel.moves.clear();
}

export function isMatchOver(duel: Duel): boolean {
  return [...duel.wins.values()].some((wins) => wins >= RPS_WINS_NEEDED);
}

export function matchWinnerId(duel: Duel): string | null {
  for (const [id, wins] of duel.wins) {
    if (wins >= RPS_WINS_NEEDED) return id;
  }
  return null;
}
