import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "bun";
import { createDb, migrate } from "../domain/db";
import { RoomStore } from "../domain/store";
import { createWebSocketHandlers } from "./handler";
import { createRoomChannel, type SocketData } from "./roomChannel";

// This is the one part of the system pure unit tests can't cover: two independent
// processes' worth of state, relayed only through Redis pub/sub. Requires a real
// REDIS_URL (CI provides one as a service container; locally: `docker run -p
// 6379:6379 redis:7-alpine`) — no fallback, matching this app's "no in-memory path"
// design (ADR-0003).

let dbPath: string;
let podA: Awaited<ReturnType<typeof startPod>>;
let podB: Awaited<ReturnType<typeof startPod>>;

async function startPod(sharedDbPath: string) {
  const db = createDb(`file:${sharedDbPath}`, undefined);
  const store = new RoomStore(db);
  const roomChannel = createRoomChannel(store);
  const server = Bun.serve<SocketData>({
    port: 0,
    fetch(req, server) {
      const url = new URL(req.url);
      const roomId = url.searchParams.get("roomId")!;
      const participantId = url.searchParams.get("participantId")!;
      const upgraded = server.upgrade(req, { data: { roomId, participantId } });
      return upgraded ? undefined : new Response("Upgrade failed", { status: 400 });
    },
    websocket: createWebSocketHandlers(store, roomChannel),
  });
  return { server, store };
}

function connect(server: Server<SocketData>, roomId: string, participantId: string): Promise<{ ws: WebSocket; messages: unknown[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${server.port}/ws?roomId=${roomId}&participantId=${participantId}`);
    const messages: unknown[] = [];
    ws.onmessage = (e) => messages.push(JSON.parse(e.data as string));
    ws.onopen = () => setTimeout(() => resolve({ ws, messages }), 200);
    ws.onerror = reject;
  });
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

beforeAll(async () => {
  dbPath = join(tmpdir(), `pp-roomchannel-test-${crypto.randomUUID()}.db`);
  const bootstrap = createDb(`file:${dbPath}`, undefined);
  await migrate(bootstrap);
  bootstrap.close();

  podA = await startPod(dbPath);
  podB = await startPod(dbPath);
});

// Closing a WebSocket triggers the server's own `close()` handler (which writes
// disconnectParticipant to the DB) asynchronously, not synchronously — give it a
// moment to finish after every test rather than letting the work pile up for
// afterAll to race against file cleanup under load from the rest of the test suite.
afterEach(async () => {
  await new Promise((r) => setTimeout(r, 200));
});

afterAll(async () => {
  podA.server.stop(true);
  podB.server.stop(true);
  await new Promise((r) => setTimeout(r, 300));
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      unlinkSync(dbPath + suffix);
    } catch {
      // no -wal/-shm may exist
    }
  }
});

describe("cross-pod relay over Redis", () => {
  test("a vote cast against pod A is observed by a socket connected to pod B", async () => {
    const room = await podA.store.create();
    const alice = await podA.store.addParticipant(room.id, "Alice", false, "🙂");
    const bob = await podA.store.addParticipant(room.id, "Bob", false, "🙂");
    if (alice === "full" || alice === "not_found" || bob === "full" || bob === "not_found") throw new Error("unexpected");

    const aliceConn = await connect(podA.server, room.id, alice.participant.id);
    const bobConn = await connect(podB.server, room.id, bob.participant.id);

    aliceConn.ws.send(JSON.stringify({ type: "vote", card: 5 }));
    bobConn.ws.send(JSON.stringify({ type: "vote", card: 8 }));

    await waitFor(() => bobConn.messages.some((m: any) => m.type === "roomState" && m.room.phase === "revealed"));

    const finalState = [...bobConn.messages].reverse().find((m: any) => m.type === "roomState") as any;
    expect(finalState.room.phase).toBe("revealed");
    expect(finalState.room.evaluation.average).toBe(6.5);

    aliceConn.ws.close();
    bobConn.ws.close();
  });

  test("a duel challenge/accept/move round trip works when challenger and opponent are on different pods", async () => {
    const room = await podA.store.create();
    const alice = await podA.store.addParticipant(room.id, "Alice", false, "🙂");
    const bob = await podA.store.addParticipant(room.id, "Bob", false, "🙂");
    if (alice === "full" || alice === "not_found" || bob === "full" || bob === "not_found") throw new Error("unexpected");

    const aliceConn = await connect(podA.server, room.id, alice.participant.id);
    const bobConn = await connect(podB.server, room.id, bob.participant.id);

    aliceConn.ws.send(JSON.stringify({ type: "duelChallenge", opponentId: bob.participant.id }));
    await waitFor(() => bobConn.messages.some((m: any) => m.type === "duelChallenge"));
    const duelId = (bobConn.messages.find((m: any) => m.type === "duelChallenge") as any).duelId;

    bobConn.ws.send(JSON.stringify({ type: "duelRespond", duelId, accept: true }));
    await waitFor(() => aliceConn.messages.some((m: any) => m.type === "duelStarted"));

    for (let i = 0; i < 2; i++) {
      aliceConn.ws.send(JSON.stringify({ type: "duelMove", duelId, move: "rock" }));
      bobConn.ws.send(JSON.stringify({ type: "duelMove", duelId, move: "scissors" }));
      await new Promise((r) => setTimeout(r, 100));
    }

    await waitFor(() => bobConn.messages.some((m: any) => m.type === "duelResult" && m.matchOver));
    const result = [...bobConn.messages].reverse().find((m: any) => m.type === "duelResult") as any;
    expect(result.outcome).toBe("lose");
    expect(result.matchOver).toBe(true);

    const stats = await podA.store.getSessionEvaluation(room.id);
    expect(stats?.duelsCompleted).toBe(1);
    expect(stats?.trophiesWon).toBe(1);

    aliceConn.ws.close();
    bobConn.ws.close();
  });

  test("a duel can be challenged and accepted after the round has already been revealed", async () => {
    const room = await podA.store.create();
    const alice = await podA.store.addParticipant(room.id, "Alice", false, "🙂");
    const bob = await podA.store.addParticipant(room.id, "Bob", false, "🙂");
    if (alice === "full" || alice === "not_found" || bob === "full" || bob === "not_found") throw new Error("unexpected");

    const aliceConn = await connect(podA.server, room.id, alice.participant.id);
    const bobConn = await connect(podB.server, room.id, bob.participant.id);

    aliceConn.ws.send(JSON.stringify({ type: "vote", card: 5 }));
    bobConn.ws.send(JSON.stringify({ type: "vote", card: 5 }));
    await waitFor(() => bobConn.messages.some((m: any) => m.type === "roomState" && m.room.phase === "revealed"));

    aliceConn.ws.send(JSON.stringify({ type: "duelChallenge", opponentId: bob.participant.id }));
    await waitFor(() => bobConn.messages.some((m: any) => m.type === "duelChallenge"));
    const duelId = (bobConn.messages.find((m: any) => m.type === "duelChallenge") as any).duelId;

    bobConn.ws.send(JSON.stringify({ type: "duelRespond", duelId, accept: true }));
    await waitFor(() => aliceConn.messages.some((m: any) => m.type === "duelStarted"));

    aliceConn.ws.close();
    bobConn.ws.close();
  });
});
