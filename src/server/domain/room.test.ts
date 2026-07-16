import { describe, expect, test } from "bun:test";
import {
  addChatMessage,
  addParticipant,
  allVotesIn,
  castVote,
  computeEvaluation,
  createRoom,
  disconnectParticipant,
  isRoomExpired,
  reconnectParticipant,
  removeParticipant,
  reveal,
  startNewRound,
  toggleSpectator,
} from "./room";

describe("createRoom", () => {
  test("generates a 12 character id and starts in the voting phase without a host", () => {
    const room = createRoom();
    expect(room.id).toHaveLength(12);
    expect(room.phase).toBe("voting");
    expect(room.hostId).toBeNull();
  });
});

describe("addParticipant", () => {
  test("the first participant to join becomes host", () => {
    const room = createRoom();
    const first = addParticipant(room, "Alice", false);
    expect(room.hostId).toBe(first.id);

    const second = addParticipant(room, "Bob", false);
    expect(room.hostId).toBe(first.id);
    expect(second.isSpectator).toBe(false);
  });
});

describe("host succession", () => {
  test("hands the host role to the longest-connected remaining participant", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    addParticipant(room, "Carol", false);

    disconnectParticipant(room, alice.id);

    expect(room.hostId).toBe(bob.id);
  });

  test("spectators are eligible to become host", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", true);

    disconnectParticipant(room, alice.id);

    expect(room.hostId).toBe(bob.id);
  });

  test("marks the room empty once every participant has disconnected", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);

    disconnectParticipant(room, alice.id);

    expect(room.emptySince).not.toBeNull();
    expect(room.hostId).toBeNull();
  });

  test("reconnecting clears the empty-room marker", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    disconnectParticipant(room, alice.id);

    reconnectParticipant(room, alice);

    expect(room.emptySince).toBeNull();
  });
});

describe("auto-reveal", () => {
  test("requires every connected, non-spectator participant to have voted", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);

    expect(allVotesIn(room)).toBe(false);

    castVote(alice, 5);
    expect(allVotesIn(room)).toBe(false);

    castVote(bob, 8);
    expect(allVotesIn(room)).toBe(true);
  });

  test("ignores spectators and disconnected participants", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", true);
    const carol = addParticipant(room, "Carol", false);

    disconnectParticipant(room, carol.id);
    castVote(alice, 5);

    expect(allVotesIn(room)).toBe(true);
    expect(bob.vote).toBeNull();
  });

  test("is false when there are no eligible voters at all", () => {
    const room = createRoom();
    addParticipant(room, "Alice", true);

    expect(allVotesIn(room)).toBe(false);
  });
});

describe("toggleSpectator", () => {
  test("flips back and forth", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);

    toggleSpectator(alice);
    expect(alice.isSpectator).toBe(true);

    toggleSpectator(alice);
    expect(alice.isSpectator).toBe(false);
  });
});

describe("removeParticipant", () => {
  test("removes the participant from the room entirely", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);

    removeParticipant(room, bob.id);

    expect(room.participants.has(bob.id)).toBe(false);
    expect(room.participants.has(alice.id)).toBe(true);
  });

  test("marks the room empty if the removed participant was the only one connected", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);

    removeParticipant(room, alice.id);

    expect(room.emptySince).not.toBeNull();
  });

  test("can tip a pending round into auto-reveal once the remaining voters are all in", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    castVote(alice, 5);

    removeParticipant(room, bob.id);

    expect(allVotesIn(room)).toBe(true);
  });
});

describe("startNewRound", () => {
  test("resets phase to voting and clears every vote", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    castVote(alice, 3);
    castVote(bob, 5);
    reveal(room);

    startNewRound(room);

    expect(room.phase).toBe("voting");
    expect(alice.vote).toBeNull();
    expect(bob.vote).toBeNull();
  });
});

describe("computeEvaluation", () => {
  test("returns null when nobody has voted numerically", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    castVote(alice, "coffee");

    expect(computeEvaluation(room)).toBeNull();
  });

  test("excludes coffee/unknown votes from the average", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    const carol = addParticipant(room, "Carol", false);
    castVote(alice, 5);
    castVote(bob, 8);
    castVote(carol, "unknown");

    const evaluation = computeEvaluation(room);

    expect(evaluation?.average).toBeCloseTo(6.5);
  });

  test("recommends the closest card to the average", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    const carol = addParticipant(room, "Carol", false);
    castVote(alice, 5);
    castVote(bob, 5);
    castVote(carol, 8);

    const evaluation = computeEvaluation(room);
    expect(evaluation?.average).toBeCloseTo(6);
    expect(evaluation?.recommendedCard).toBe(5);
  });

  test("rounds up to the higher card on an exact tie", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    castVote(alice, 3);
    castVote(bob, 5);

    expect(computeEvaluation(room)?.average).toBe(4);
    expect(computeEvaluation(room)?.recommendedCard).toBe(5);
  });
});

describe("addChatMessage", () => {
  test("appends the message to the room and snapshots the sender's name/color", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);

    const message = addChatMessage(room, alice, "hey team");

    expect(room.chatMessages).toEqual([message]);
    expect(message).toMatchObject({
      participantId: alice.id,
      participantName: "Alice",
      participantColor: alice.color,
      text: "hey team",
    });
  });

  test("keeps prior messages attributed correctly even after the sender is removed", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    addChatMessage(room, alice, "hey team");

    removeParticipant(room, alice.id);

    expect(room.chatMessages[0]).toMatchObject({ participantName: "Alice", text: "hey team" });
  });
});

describe("isRoomExpired", () => {
  test("is false while the room has never been empty", () => {
    const room = createRoom();
    expect(isRoomExpired(room)).toBe(false);
  });

  test("is false before the grace period has elapsed", () => {
    const room = createRoom();
    room.emptySince = Date.now() - 60_000;
    expect(isRoomExpired(room)).toBe(false);
  });

  test("is true once the grace period has elapsed", () => {
    const room = createRoom();
    room.emptySince = Date.now() - 31 * 60_000;
    expect(isRoomExpired(room)).toBe(true);
  });
});
