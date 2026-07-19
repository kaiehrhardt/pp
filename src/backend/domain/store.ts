import { LibsqlError, type Client, type Transaction } from "@libsql/client";
import { nanoid } from "nanoid";
import {
  addChatMessage as addChatMessagePure,
  addParticipant as addParticipantPure,
  computeEvaluation,
  createRoom,
  disconnectParticipant as disconnectParticipantPure,
  GRACE_PERIOD_MS,
  isRoomFull,
  removeParticipant as removeParticipantPure,
  reveal as revealPure,
} from "./room";
import type { Card, ChatMessage, Evaluation, NumericCard, Participant, Room, RoomPhase, SessionEvaluation } from "./types";

// Kept small: @libsql/client's local-file Transaction.close() leaks the underlying
// native connection on every failed attempt (see db.ts), so retries themselves are
// costly under contention — db.ts's busy-timeout does most of the actual waiting for
// a local file, this loop just needs enough headroom to absorb genuine transient
// conflicts, not to be the primary wait mechanism.
const MAX_ATTEMPTS = 4;

interface RoomRow {
  id: string;
  host_id: string | null;
  phase: string;
  created_at: number;
  empty_since: number | null;
}

interface ParticipantRow {
  id: string;
  token: string;
  name: string;
  color: string;
  is_spectator: number;
  vote: string | null;
  guess: number | null;
  connected: number;
  trophy_count: number;
  avatar: string;
  joined_at: number;
}

interface ChatRow {
  id: string;
  participant_id: string;
  participant_name: string;
  participant_color: string;
  text: string;
  sent_at: number;
}

function serializeCard(card: Card | null): string | null {
  return card === null ? null : String(card);
}

function parseCard(value: string | null): Card | null {
  if (value === null) return null;
  if (value === "coffee" || value === "unknown") return value;
  return Number(value) as NumericCard;
}

// A minimal, unpersisted Room shape for reusing pure domain functions that only need
// a `chatMessages` array or `duels` map to exist, never to hold real data — neither
// field is backed by Turso (chat has its own table; Duels stay ephemeral, see ADR-0003).
function emptyRoomShell(id: string): Room {
  return { id, hostId: null, phase: "voting", participants: new Map(), chatMessages: [], duels: new Map(), createdAt: 0, emptySince: null };
}

class BusinessRuleViolation extends Error {}

function isRetryable(err: unknown): boolean {
  if (err instanceof BusinessRuleViolation) return false;
  if (err instanceof LibsqlError) {
    return err.code === "SQLITE_BUSY" || err.code === "SQLITE_LOCKED" || err.code === "TRANSACTION_TIMEOUT";
  }
  return true;
}

function backoff(attempt: number): Promise<void> {
  const ms = Math.min(200, 10 * 2 ** attempt) + Math.random() * 10;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hydrateRoom(
  executor: Client | Transaction,
  roomId: string,
): Promise<{ room: Room; joinedAtById: Map<string, number> } | undefined> {
  const roomResult = await executor.execute({
    sql: "SELECT id, host_id, phase, created_at, empty_since FROM rooms WHERE id = ?",
    args: [roomId],
  });
  const roomRow = roomResult.rows[0] as unknown as RoomRow | undefined;
  if (!roomRow) return undefined;

  const participantsResult = await executor.execute({
    sql: "SELECT id, token, name, color, is_spectator, vote, guess, connected, trophy_count, avatar, joined_at FROM participants WHERE room_id = ? ORDER BY joined_at ASC, id ASC",
    args: [roomId],
  });

  const participants = new Map<string, Participant>();
  const joinedAtById = new Map<string, number>();
  for (const row of participantsResult.rows as unknown as ParticipantRow[]) {
    participants.set(row.id, {
      id: row.id,
      token: row.token,
      name: row.name,
      color: row.color,
      isSpectator: Boolean(row.is_spectator),
      vote: parseCard(row.vote),
      guess: row.guess,
      connected: Boolean(row.connected),
      trophyCount: row.trophy_count,
      avatar: row.avatar,
    });
    joinedAtById.set(row.id, row.joined_at);
  }

  const room: Room = {
    id: roomRow.id,
    hostId: roomRow.host_id,
    phase: roomRow.phase as RoomPhase,
    participants,
    chatMessages: [],
    duels: new Map(),
    createdAt: roomRow.created_at,
    emptySince: roomRow.empty_since,
  };
  return { room, joinedAtById };
}

function snapshotRoomFields(room: Room): string {
  return JSON.stringify([room.hostId, room.phase, room.emptySince]);
}

function snapshotParticipant(p: Participant): string {
  return JSON.stringify([p.name, p.color, p.isSpectator, p.vote, p.guess, p.connected, p.trophyCount, p.avatar]);
}

function snapshotParticipants(room: Room): Map<string, string> {
  const snapshot = new Map<string, string>();
  for (const [id, p] of room.participants) snapshot.set(id, snapshotParticipant(p));
  return snapshot;
}

// Only writes rows that actually changed since hydration. Blindly re-upserting every
// participant on every Tier-2 write would make filling a room O(n^2) in the number of
// joins, and hold the transaction's write lock open longer than necessary — directly
// worsening contention under concurrent load, not just doing pointless I/O.
async function persistRoom(
  tx: Transaction,
  room: Room,
  joinedAtById: Map<string, number>,
  before: { room: string; participants: Map<string, string> },
): Promise<void> {
  if (snapshotRoomFields(room) !== before.room) {
    await tx.execute({
      sql: `INSERT INTO rooms (id, host_id, phase, created_at, empty_since, version) VALUES (?, ?, ?, ?, ?, 0)
            ON CONFLICT(id) DO UPDATE SET host_id = excluded.host_id, phase = excluded.phase, empty_since = excluded.empty_since, version = rooms.version + 1`,
      args: [room.id, room.hostId, room.phase, room.createdAt, room.emptySince],
    });
  }

  for (const p of room.participants.values()) {
    if (before.participants.get(p.id) === snapshotParticipant(p)) continue;
    await tx.execute({
      sql: `INSERT INTO participants (id, room_id, token, name, color, is_spectator, vote, guess, connected, trophy_count, avatar, joined_at, version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name, color = excluded.color, is_spectator = excluded.is_spectator,
              vote = excluded.vote, guess = excluded.guess, connected = excluded.connected,
              trophy_count = excluded.trophy_count, avatar = excluded.avatar, version = participants.version + 1`,
      args: [
        p.id,
        room.id,
        p.token,
        p.name,
        p.color,
        p.isSpectator ? 1 : 0,
        serializeCard(p.vote),
        p.guess,
        p.connected ? 1 : 0,
        p.trophyCount,
        p.avatar,
        joinedAtById.get(p.id) ?? Date.now(),
      ],
    });
  }
}

async function withRoom<T>(
  db: Client,
  roomId: string,
  mutate: (room: Room) => T,
  options?: { beforePersist?: (tx: Transaction, room: Room) => Promise<void> },
): Promise<{ room: Room; result: T } | undefined> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let tx: Transaction | undefined;
    try {
      tx = await db.transaction("write"); // issues BEGIN IMMEDIATE — can itself hit SQLITE_BUSY, must be retryable too
      const hydrated = await hydrateRoom(tx, roomId);
      if (!hydrated) {
        await tx.rollback();
        return undefined;
      }
      const { room, joinedAtById } = hydrated;
      const before = { room: snapshotRoomFields(room), participants: snapshotParticipants(room) };
      const result = mutate(room);
      if (options?.beforePersist) await options.beforePersist(tx, room);
      await persistRoom(tx, room, joinedAtById, before);
      await tx.commit();
      return { room, result };
    } catch (err) {
      await tx?.rollback().catch(() => {});
      if (!isRetryable(err) || attempt === MAX_ATTEMPTS - 1) throw err;
      await backoff(attempt);
    } finally {
      tx?.close();
    }
  }
  throw new Error("unreachable");
}

export class RoomStore {
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly db: Client) {}

  async create(): Promise<Room> {
    const room = createRoom();
    await this.db.execute({
      sql: "INSERT INTO rooms (id, host_id, phase, created_at, empty_since, version) VALUES (?, ?, ?, ?, ?, 0)",
      args: [room.id, room.hostId, room.phase, room.createdAt, room.emptySince],
    });
    return room;
  }

  async get(roomId: string): Promise<Room | undefined> {
    const hydrated = await hydrateRoom(this.db, roomId);
    return hydrated?.room;
  }

  async getChatHistory(roomId: string): Promise<ChatMessage[]> {
    const result = await this.db.execute({
      sql: "SELECT id, participant_id, participant_name, participant_color, text, sent_at FROM chat_messages WHERE room_id = ? ORDER BY sent_at ASC",
      args: [roomId],
    });
    return (result.rows as unknown as ChatRow[]).map((row) => ({
      id: row.id,
      participantId: row.participant_id,
      participantName: row.participant_name,
      participantColor: row.participant_color,
      text: row.text,
      sentAt: row.sent_at,
    }));
  }

  async addChatMessage(roomId: string, participant: Participant, text: string): Promise<ChatMessage> {
    const message = addChatMessagePure(emptyRoomShell(roomId), participant, text);
    await this.db.execute({
      sql: "INSERT INTO chat_messages (id, room_id, participant_id, participant_name, participant_color, text, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [message.id, roomId, message.participantId, message.participantName, message.participantColor, message.text, message.sentAt],
    });
    return message;
  }

  // Tier 1: single-statement writes, safe under arbitrary concurrent execution because
  // the SQL references each row's current value atomically — no read-then-decide window.
  async castVote(roomId: string, participantId: string, card: Card): Promise<Room | undefined> {
    await this.db.execute({
      sql: "UPDATE participants SET vote = ?, version = version + 1 WHERE id = ? AND room_id = ?",
      args: [serializeCard(card), participantId, roomId],
    });
    return this.get(roomId);
  }

  async castGuess(roomId: string, participantId: string, value: number): Promise<Room | undefined> {
    await this.db.execute({
      sql: "UPDATE participants SET guess = ?, version = version + 1 WHERE id = ? AND room_id = ?",
      args: [value, participantId, roomId],
    });
    return this.get(roomId);
  }

  async setAvatar(roomId: string, participantId: string, avatar: string): Promise<Room | undefined> {
    await this.db.execute({
      sql: "UPDATE participants SET avatar = ?, version = version + 1 WHERE id = ? AND room_id = ?",
      args: [avatar, participantId, roomId],
    });
    return this.get(roomId);
  }

  async toggleSpectator(roomId: string, participantId: string): Promise<Room | undefined> {
    await this.db.execute({
      sql: "UPDATE participants SET is_spectator = 1 - is_spectator, version = version + 1 WHERE id = ? AND room_id = ?",
      args: [participantId, roomId],
    });
    return this.get(roomId);
  }

  async awardTrophy(roomId: string, participantId: string): Promise<Room | undefined> {
    await this.db.execute({
      sql: "UPDATE participants SET trophy_count = trophy_count + 1, version = version + 1 WHERE id = ? AND room_id = ?",
      args: [participantId, roomId],
    });
    return this.get(roomId);
  }

  // Reactions/Duels stay ephemeral in-process (ADR-0003) — this only bumps a room-level
  // tally for the Session Evaluation widget, not the Reaction/Duel itself.
  async incrementReactionsThrown(roomId: string): Promise<void> {
    await this.db.execute({
      sql: "UPDATE rooms SET reactions_thrown = reactions_thrown + 1, version = version + 1 WHERE id = ?",
      args: [roomId],
    });
  }

  // Only for a Duel that actually finished (someone reached best-of-3), never a
  // cancelled one — call alongside awardTrophy, at the same call site.
  async incrementDuelsCompleted(roomId: string): Promise<void> {
    await this.db.execute({
      sql: "UPDATE rooms SET duels_completed = duels_completed + 1, version = version + 1 WHERE id = ?",
      args: [roomId],
    });
  }

  async reconnectParticipant(roomId: string, participantId: string): Promise<Room | undefined> {
    await this.db.batch(
      [
        { sql: "UPDATE participants SET connected = 1, version = version + 1 WHERE id = ? AND room_id = ?", args: [participantId, roomId] },
        { sql: "UPDATE rooms SET empty_since = NULL, version = version + 1 WHERE id = ?", args: [roomId] },
      ],
      "write",
    );
    return this.get(roomId);
  }

  // Genuinely unconditional (no read-then-decide), so this is Tier 1 too despite touching
  // every participant row at once.
  async startNewRound(roomId: string): Promise<Room | undefined> {
    await this.db.batch(
      [
        { sql: "UPDATE participants SET vote = NULL, guess = NULL, version = version + 1 WHERE room_id = ?", args: [roomId] },
        { sql: "UPDATE rooms SET phase = 'voting', version = version + 1 WHERE id = ?", args: [roomId] },
      ],
      "write",
    );
    return this.get(roomId);
  }

  // Tier 2: read-then-decide, wrapped in a retrying interactive transaction so the
  // decision (host reassignment, trophy awards, capacity) is made against a consistent
  // snapshot and applied atomically. Reuses room.ts's existing pure functions unmodified.
  async addParticipant(
    roomId: string,
    name: string,
    isSpectator: boolean,
    avatar: string,
  ): Promise<{ room: Room; participant: Participant } | "full" | "not_found"> {
    try {
      const outcome = await withRoom(this.db, roomId, (room) => {
        if (isRoomFull(room)) throw new BusinessRuleViolation("full");
        return addParticipantPure(room, name, isSpectator, avatar);
      });
      if (!outcome) return "not_found";
      return { room: outcome.room, participant: outcome.result };
    } catch (err) {
      if (err instanceof BusinessRuleViolation) return "full";
      throw err;
    }
  }

  async disconnectParticipant(roomId: string, participantId: string): Promise<Room | undefined> {
    const outcome = await withRoom(this.db, roomId, (room) => {
      disconnectParticipantPure(room, participantId);
    });
    return outcome?.room;
  }

  async removeParticipant(roomId: string, participantId: string): Promise<Room | undefined> {
    const outcome = await withRoom(
      this.db,
      roomId,
      (room) => {
        removeParticipantPure(room, participantId);
      },
      {
        beforePersist: async (tx) => {
          await tx.execute({ sql: "DELETE FROM participants WHERE id = ?", args: [participantId] });
        },
      },
    );
    return outcome?.room;
  }

  async reveal(roomId: string): Promise<Room | undefined> {
    // Captured by the mutate callback below, then recorded into round_evaluations
    // (within the same transaction) if the round actually produced a numeric average —
    // e.g. everyone voting coffee/unknown leaves this null, and nothing is recorded.
    let evaluation: Evaluation | null = null;
    const outcome = await withRoom(
      this.db,
      roomId,
      (room) => {
        revealPure(room);
        evaluation = computeEvaluation(room);
      },
      {
        beforePersist: async (tx) => {
          if (!evaluation) return;
          await tx.execute({
            sql: "INSERT INTO round_evaluations (id, room_id, average, recommended_card, revealed_at) VALUES (?, ?, ?, ?, ?)",
            args: [nanoid(10), roomId, evaluation.average, String(evaluation.recommendedCard), Date.now()],
          });
        },
      },
    );
    return outcome?.room;
  }

  async getSessionEvaluation(roomId: string): Promise<SessionEvaluation | null> {
    const result = await this.db.execute({
      sql: `SELECT
              (SELECT COUNT(*) FROM round_evaluations WHERE room_id = ?) AS round_count,
              (SELECT AVG(average) FROM round_evaluations WHERE room_id = ?) AS avg,
              (SELECT MIN(average) FROM round_evaluations WHERE room_id = ?) AS min,
              (SELECT MAX(average) FROM round_evaluations WHERE room_id = ?) AS max,
              (SELECT reactions_thrown FROM rooms WHERE id = ?) AS reactions_thrown,
              (SELECT duels_completed FROM rooms WHERE id = ?) AS duels_completed,
              (SELECT COALESCE(SUM(trophy_count), 0) FROM participants WHERE room_id = ?) AS trophies_won`,
      args: [roomId, roomId, roomId, roomId, roomId, roomId, roomId],
    });
    const row = result.rows[0] as unknown as
      | {
          round_count: number;
          avg: number | null;
          min: number | null;
          max: number | null;
          reactions_thrown: number | null;
          duels_completed: number | null;
          trophies_won: number;
        }
      | undefined;
    if (!row) return null;
    const reactionsThrown = row.reactions_thrown ?? 0;
    const duelsCompleted = row.duels_completed ?? 0;
    if (row.round_count === 0 && reactionsThrown === 0 && duelsCompleted === 0 && row.trophies_won === 0) return null;
    return {
      roundCount: row.round_count,
      average: row.avg,
      min: row.min,
      max: row.max,
      reactionsThrown,
      duelsCompleted,
      trophiesWon: row.trophies_won,
    };
  }

  async cleanupExpiredRooms(now: number = Date.now()): Promise<void> {
    const cutoff = now - GRACE_PERIOD_MS;
    await this.db.batch(
      ["PRAGMA foreign_keys = ON", { sql: "DELETE FROM rooms WHERE empty_since IS NOT NULL AND empty_since <= ?", args: [cutoff] }],
      "write",
    );
  }

  startCleanup(intervalMs = 60_000): void {
    const run = () => {
      this.cleanupExpiredRooms().catch((err) => console.error("room cleanup sweep failed", err));
    };
    // Jittered start so many pods sharing one Turso database don't all sweep in lockstep.
    setTimeout(() => {
      run();
      this.cleanupTimer = setInterval(run, intervalMs);
    }, Math.floor(Math.random() * intervalMs));
  }

  stopCleanup(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
}
