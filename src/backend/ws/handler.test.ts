import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Client } from "@libsql/client";
import type { ServerWebSocket } from "bun";
import { createDb, migrate } from "../domain/db";
import { RoomStore } from "../domain/store";
import { createWebSocketHandlers } from "./handler";
import { createRoomChannel, type SocketData } from "./roomChannel";

// Requires a real REDIS_URL, same as roomChannel.integration.test.ts — publishing
// through roomChannel always goes to Redis, even when nothing is subscribed to observe
// it, so these tests can await the handler calls directly without needing a live
// WebSocket or a subscriber loop-back.

let db: Client;
let store: RoomStore;
let dbPath: string;
let roomChannel: ReturnType<typeof createRoomChannel>;
let handlers: ReturnType<typeof createWebSocketHandlers>;

function fakeSocket(roomId: string, participantId: string): ServerWebSocket<SocketData> {
  return {
    data: { roomId, participantId },
    send: mock(() => {}),
    close: mock(() => {}),
  } as unknown as ServerWebSocket<SocketData>;
}

async function addTwo(roomId: string) {
  const a = await store.addParticipant(roomId, "Alice", false, "🙂");
  const b = await store.addParticipant(roomId, "Bob", false, "🙂");
  if (a === "full" || a === "not_found" || b === "full" || b === "not_found") throw new Error("unexpected");
  return { alice: a.participant, bob: b.participant };
}

beforeEach(async () => {
  dbPath = join(tmpdir(), `pp-handler-test-${crypto.randomUUID()}.db`);
  db = createDb(`file:${dbPath}`, undefined);
  await migrate(db);
  store = new RoomStore(db);
  roomChannel = createRoomChannel(store);
  handlers = createWebSocketHandlers(store, roomChannel);
});

afterEach(() => {
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      unlinkSync(dbPath + suffix);
    } catch {
      // no -wal/-shm may exist
    }
  }
});

describe("message", () => {
  test("malformed JSON is ignored", async () => {
    const room = await store.create();
    const { alice } = await addTwo(room.id);
    await handlers.message(fakeSocket(room.id, alice.id), "not json{");
    // No throw, and room state is untouched.
    expect((await store.get(room.id))?.phase).toBe("voting");
  });

  test("toggleSpectator flips the sender's spectator flag", async () => {
    const room = await store.create();
    const { alice } = await addTwo(room.id);
    await handlers.message(fakeSocket(room.id, alice.id), JSON.stringify({ type: "toggleSpectator" }));
    const updated = await store.get(room.id);
    expect(updated?.participants.get(alice.id)?.isSpectator).toBe(true);
  });

  describe("newRound", () => {
    test("is a no-op for a non-host", async () => {
      const room = await store.create();
      const { alice, bob } = await addTwo(room.id);
      await store.castVote(room.id, alice.id, 5);
      await handlers.message(fakeSocket(room.id, bob.id), JSON.stringify({ type: "newRound" }));
      expect((await store.get(room.id))?.participants.get(alice.id)?.vote).toBe(5);
    });

    test("the host resets votes and guesses", async () => {
      const room = await store.create();
      const { alice } = await addTwo(room.id);
      await store.castVote(room.id, alice.id, 5);
      await handlers.message(fakeSocket(room.id, alice.id), JSON.stringify({ type: "newRound" }));
      expect((await store.get(room.id))?.participants.get(alice.id)?.vote).toBeNull();
    });
  });

  describe("reaction", () => {
    test("is ignored when the target participant doesn't exist", async () => {
      const room = await store.create();
      const { alice } = await addTwo(room.id);
      await expect(
        handlers.message(fakeSocket(room.id, alice.id), JSON.stringify({ type: "reaction", to: "ghost", emoji: "👍" })),
      ).resolves.toBeUndefined();
    });

    test("fans out to a real target", async () => {
      const room = await store.create();
      const { alice, bob } = await addTwo(room.id);
      await expect(
        handlers.message(fakeSocket(room.id, alice.id), JSON.stringify({ type: "reaction", to: bob.id, emoji: "👍" })),
      ).resolves.toBeUndefined();
    });

    test("counts toward the room's Session Evaluation reactionsThrown tally", async () => {
      const room = await store.create();
      const { alice, bob } = await addTwo(room.id);
      await handlers.message(fakeSocket(room.id, alice.id), JSON.stringify({ type: "reaction", to: bob.id, emoji: "👍" }));
      await handlers.message(fakeSocket(room.id, bob.id), JSON.stringify({ type: "reaction", to: alice.id, emoji: "🎉" }));
      expect((await store.getSessionEvaluation(room.id))?.reactionsThrown).toBe(2);
    });
  });

  describe("kick", () => {
    test("is a no-op for a non-host", async () => {
      const room = await store.create();
      const { alice, bob } = await addTwo(room.id);
      await handlers.message(fakeSocket(room.id, bob.id), JSON.stringify({ type: "kick", participantId: alice.id }));
      expect((await store.get(room.id))?.participants.size).toBe(2);
    });

    test("is a no-op when kicking yourself", async () => {
      const room = await store.create();
      const { alice } = await addTwo(room.id);
      await handlers.message(fakeSocket(room.id, alice.id), JSON.stringify({ type: "kick", participantId: alice.id }));
      expect((await store.get(room.id))?.participants.size).toBe(2);
    });

    test("is a no-op for an unknown target", async () => {
      const room = await store.create();
      const { alice } = await addTwo(room.id);
      await handlers.message(fakeSocket(room.id, alice.id), JSON.stringify({ type: "kick", participantId: "ghost" }));
      expect((await store.get(room.id))?.participants.size).toBe(2);
    });

    test("the host removes the target participant", async () => {
      const room = await store.create();
      const { alice, bob } = await addTwo(room.id);
      await handlers.message(fakeSocket(room.id, alice.id), JSON.stringify({ type: "kick", participantId: bob.id }));
      expect((await store.get(room.id))?.participants.has(bob.id)).toBe(false);
    });
  });

  describe("guessAverage", () => {
    test("is a no-op for a spectator", async () => {
      const room = await store.create();
      const { alice } = await addTwo(room.id);
      await store.toggleSpectator(room.id, alice.id);
      await handlers.message(fakeSocket(room.id, alice.id), JSON.stringify({ type: "guessAverage", value: 4 }));
      expect((await store.get(room.id))?.participants.get(alice.id)?.guess).toBeNull();
    });

    test("is a no-op once the round is revealed", async () => {
      const room = await store.create();
      const { alice } = await addTwo(room.id);
      await store.reveal(room.id);
      await handlers.message(fakeSocket(room.id, alice.id), JSON.stringify({ type: "guessAverage", value: 4 }));
      expect((await store.get(room.id))?.participants.get(alice.id)?.guess).toBeNull();
    });

    test("is a no-op for a non-finite value", async () => {
      const room = await store.create();
      const { alice } = await addTwo(room.id);
      await handlers.message(fakeSocket(room.id, alice.id), JSON.stringify({ type: "guessAverage", value: Number.NaN }));
      expect((await store.get(room.id))?.participants.get(alice.id)?.guess).toBeNull();
    });

    test("records a valid guess", async () => {
      const room = await store.create();
      const { alice } = await addTwo(room.id);
      await handlers.message(fakeSocket(room.id, alice.id), JSON.stringify({ type: "guessAverage", value: 4.5 }));
      expect((await store.get(room.id))?.participants.get(alice.id)?.guess).toBe(4.5);
    });
  });

  test("duelCancel relays a cancel command for a duel this pod doesn't own", async () => {
    const room = await store.create();
    const { alice } = await addTwo(room.id);
    await expect(
      handlers.message(fakeSocket(room.id, alice.id), JSON.stringify({ type: "duelCancel", duelId: "nonexistent" })),
    ).resolves.toBeUndefined();
  });

  describe("setAvatar", () => {
    test("is a no-op for an invalid avatar", async () => {
      const room = await store.create();
      const { alice } = await addTwo(room.id);
      await handlers.message(fakeSocket(room.id, alice.id), JSON.stringify({ type: "setAvatar", avatar: "" }));
      expect((await store.get(room.id))?.participants.get(alice.id)?.avatar).toBe("🙂");
    });

    test("updates a valid avatar", async () => {
      const room = await store.create();
      const { alice } = await addTwo(room.id);
      await handlers.message(fakeSocket(room.id, alice.id), JSON.stringify({ type: "setAvatar", avatar: "🚀" }));
      expect((await store.get(room.id))?.participants.get(alice.id)?.avatar).toBe("🚀");
    });
  });

  describe("chat", () => {
    test("is a no-op for an empty message", async () => {
      const room = await store.create();
      const { alice } = await addTwo(room.id);
      await handlers.message(fakeSocket(room.id, alice.id), JSON.stringify({ type: "chat", text: "   " }));
      expect((await store.getChatHistory(room.id)).length).toBe(0);
    });

    test("is a no-op for a message over the length limit", async () => {
      const room = await store.create();
      const { alice } = await addTwo(room.id);
      await handlers.message(fakeSocket(room.id, alice.id), JSON.stringify({ type: "chat", text: "x".repeat(501) }));
      expect((await store.getChatHistory(room.id)).length).toBe(0);
    });

    test("persists and fans out a valid message", async () => {
      const room = await store.create();
      const { alice } = await addTwo(room.id);
      await handlers.message(fakeSocket(room.id, alice.id), JSON.stringify({ type: "chat", text: "hello" }));
      const history = await store.getChatHistory(room.id);
      expect(history).toHaveLength(1);
      expect(history[0]?.text).toBe("hello");
    });
  });
});

describe("open/close", () => {
  test("open sends nothing for an unknown room", async () => {
    const ws = fakeSocket("no-such-room", "ghost");
    await expect(handlers.open(ws)).resolves.toBeUndefined();
    expect(ws.send).not.toHaveBeenCalled();
  });

  test("close is a no-op for an already-gone room", async () => {
    const ws = fakeSocket("no-such-room", "ghost");
    await expect(handlers.close(ws)).resolves.toBeUndefined();
  });
});
