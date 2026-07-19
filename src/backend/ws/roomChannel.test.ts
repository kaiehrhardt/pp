import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Client } from "@libsql/client";
import type { ServerWebSocket } from "bun";
import { createDb, migrate } from "../domain/db";
import { RoomStore } from "../domain/store";
import { closeSubscriber, publisher } from "../redis/pubsub";
import { createRoomChannel, type SocketData } from "./roomChannel";

// Same real-Redis requirement as roomChannel.integration.test.ts. Unlike that file,
// everything here runs against a single pod — a publish always reaches this pod's own
// subscription (Redis delivers to every subscriber of a channel, publisher included),
// so these tests exercise handleEnvelope/processDuelCommand/etc. without needing a
// second process.

function fakeSocket(roomId: string, participantId: string): ServerWebSocket<SocketData> {
  return {
    data: { roomId, participantId },
    send: mock(() => {}),
    close: mock(() => {}),
  } as unknown as ServerWebSocket<SocketData>;
}

function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (check()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timed out"));
      setTimeout(tick, 20);
    };
    tick();
  });
}

let db: Client;
let store: RoomStore;
let dbPath: string;
let roomChannel: ReturnType<typeof createRoomChannel>;

beforeEach(async () => {
  dbPath = join(tmpdir(), `pp-roomchannel-unit-test-${crypto.randomUUID()}.db`);
  db = createDb(`file:${dbPath}`, undefined);
  await migrate(db);
  store = new RoomStore(db);
  roomChannel = createRoomChannel(store);
});

afterEach(async () => {
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      unlinkSync(dbPath + suffix);
    } catch {
      // no -wal/-shm may exist
    }
  }
  await new Promise((r) => setTimeout(r, 50));
});

async function addTwo(roomId: string) {
  const a = await store.addParticipant(roomId, "Alice", false, "🙂");
  const b = await store.addParticipant(roomId, "Bob", false, "🙂");
  if (a === "full" || a === "not_found" || b === "full" || b === "not_found") throw new Error("unexpected");
  return { alice: a.participant, bob: b.participant };
}

test("publishFanout delivers to every locally registered socket in the room", async () => {
  const room = await store.create();
  const { alice, bob } = await addTwo(room.id);
  const aliceWs = fakeSocket(room.id, alice.id);
  const bobWs = fakeSocket(room.id, bob.id);
  await roomChannel.registerSocket(aliceWs);
  await roomChannel.registerSocket(bobWs);

  await roomChannel.publishFanout(room.id, { type: "reaction", from: alice.id, to: bob.id, emoji: "👍" });

  const sent = () => (bobWs.send as ReturnType<typeof mock>).mock.calls;
  await waitFor(() => sent().some((c) => (c[0] as string).includes("reaction")));
  expect(sent().some((c) => (c[0] as string).includes("reaction"))).toBe(true);
});

test("a malformed envelope on the room's channel is ignored rather than crashing delivery", async () => {
  const room = await store.create();
  const { alice } = await addTwo(room.id);
  const ws = fakeSocket(room.id, alice.id);
  await roomChannel.registerSocket(ws);

  // Simulates corrupt data arriving on the channel — publishing through roomChannel
  // itself always produces well-formed JSON, so this reaches in from outside it.
  await publisher.publish(`room:${room.id}:events`, "not valid json");
  // Follow up with a real fanout: if the malformed message had wedged handleEnvelope,
  // this would never arrive.
  await roomChannel.publishFanout(room.id, { type: "reaction", from: alice.id, to: alice.id, emoji: "🎉" });

  await waitFor(() => (ws.send as ReturnType<typeof mock>).mock.calls.some((c) => (c[0] as string).includes("🎉")));
});

test("kicking a participant closes their locally registered sockets", async () => {
  const room = await store.create();
  const { alice, bob } = await addTwo(room.id);
  const bobWs = fakeSocket(room.id, bob.id);
  await roomChannel.registerSocket(bobWs);

  await roomChannel.sendToParticipant(room.id, bob.id, { type: "kicked" });

  await waitFor(() => (bobWs.close as ReturnType<typeof mock>).mock.calls.length > 0, 2000);
});

describe("duel commands relayed over the room channel", () => {
  test("a decline notifies the challenger and removes the duel", async () => {
    const room = await store.create();
    const { alice, bob } = await addTwo(room.id);
    const aliceWs = fakeSocket(room.id, alice.id);
    await roomChannel.registerSocket(aliceWs);

    const currentRoom = await store.get(room.id);
    if (!currentRoom) throw new Error("expected the room to exist");
    const duel = roomChannel.createOwnedDuel(currentRoom, alice.id, bob.id);
    if (!duel) throw new Error("expected a duel to be created");

    await roomChannel.publishDuelCommand(room.id, duel.id, { type: "duelRespond", participantId: bob.id, duelId: duel.id, accept: false });

    const sent = () => (aliceWs.send as ReturnType<typeof mock>).mock.calls;
    await waitFor(() => sent().some((c) => (c[0] as string).includes("duelDeclined")));
    expect(sent().some((c) => (c[0] as string).includes("duelDeclined"))).toBe(true);
  });

  test("a cancel notifies the opponent", async () => {
    const room = await store.create();
    const { alice, bob } = await addTwo(room.id);
    const bobWs = fakeSocket(room.id, bob.id);
    await roomChannel.registerSocket(bobWs);

    const currentRoom = await store.get(room.id);
    if (!currentRoom) throw new Error("expected the room to exist");
    const duel = roomChannel.createOwnedDuel(currentRoom, alice.id, bob.id);
    if (!duel) throw new Error("expected a duel to be created");

    await roomChannel.publishDuelCommand(room.id, duel.id, { type: "duelCancel", participantId: alice.id, duelId: duel.id });

    const sent = () => (bobWs.send as ReturnType<typeof mock>).mock.calls;
    await waitFor(() => sent().some((c) => (c[0] as string).includes("duelCancelled")));
    expect(sent().some((c) => (c[0] as string).includes("duelCancelled"))).toBe(true);
  });
});

test("cancelDuelsForParticipant notifies the other side of every pending duel", async () => {
  const room = await store.create();
  const { alice, bob } = await addTwo(room.id);
  const bobWs = fakeSocket(room.id, bob.id);
  await roomChannel.registerSocket(bobWs);

  const currentRoom = await store.get(room.id);
  if (!currentRoom) throw new Error("expected the room to exist");
  const duel = roomChannel.createOwnedDuel(currentRoom, alice.id, bob.id);
  if (!duel) throw new Error("expected a duel to be created");

  await roomChannel.cancelDuelsForParticipant(room.id, alice.id);

  const sent = () => (bobWs.send as ReturnType<typeof mock>).mock.calls;
  await waitFor(() => sent().some((c) => (c[0] as string).includes("duelCancelled")));
  expect(sent().some((c) => (c[0] as string).includes("duelCancelled"))).toBe(true);
});

describe("subscriber reconnect recovery", () => {
  afterAll(async () => {
    // Leave a clean slate — whichever test file runs next lazily recreates its own
    // subscriber and rebinds reconnect handling to its own roomChannel.
    closeSubscriber();
    await new Promise((r) => setTimeout(r, 50));
  });

  test("a dropped subscriber connection resubscribes and re-delivers room state on reconnect", async () => {
    // getSubscriber's onconnect is bound on first use and never rebound while the
    // singleton lives (see redis/pubsub.ts) — reset it first so *this* roomChannel's
    // reconnect handler is the one wired up for the forced-drop below.
    closeSubscriber();

    const room = await store.create();
    const { alice } = await addTwo(room.id);
    const ws = fakeSocket(room.id, alice.id);
    await roomChannel.registerSocket(ws);
    await new Promise((r) => setTimeout(r, 100));
    (ws.send as ReturnType<typeof mock>).mockClear();

    // Force-drop the subscriber connection from the server side — this is what an
    // actual network blip looks like to the client, unlike a graceful close() (which
    // bun's RedisClient does not auto-reconnect from).
    const list = await publisher.send("CLIENT", ["LIST"]);
    const subLine = String(list)
      .split("\n")
      .find((l) => l.includes("sub=1") || l.includes("sub=2") || / sub=[1-9]/.test(l));
    const id = subLine?.match(/id=(\d+)/)?.[1];
    if (!id) throw new Error("could not find the subscriber connection in CLIENT LIST");
    await publisher.send("CLIENT", ["KILL", "ID", id]);

    // On reconnect, onSubscriberReconnect resubscribes every room this pod cares about
    // and reconciles it — which delivers a fresh roomState even though nothing new was
    // published.
    const sent = () => (ws.send as ReturnType<typeof mock>).mock.calls;
    await waitFor(() => sent().some((c) => (c[0] as string).includes("roomState")), 3000);
    expect(sent().some((c) => (c[0] as string).includes("roomState"))).toBe(true);
  });
});
