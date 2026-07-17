import { describe, expect, test } from "bun:test";
import {
  addChatMessage,
  addParticipant,
  allVotesIn,
  castGuess,
  castVote,
  computeEvaluation,
  computeGuessWinners,
  createRoom,
  DEFAULT_AVATAR,
  disconnectParticipant,
  findParticipantByToken,
  isRoomExpired,
  isRoomFull,
  isUnanimousVote,
  isValidAvatar,
  MAX_PARTICIPANTS,
  reconnectParticipant,
  removeParticipant,
  reveal,
  setAvatar,
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

  test("uses the given avatar when valid", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false, "🦄");
    expect(alice.avatar).toBe("🦄");
  });

  test("falls back to the default avatar when missing or invalid", () => {
    const room = createRoom();
    const noAvatar = addParticipant(room, "Alice", false);
    expect(noAvatar.avatar).toBe(DEFAULT_AVATAR);

    const tooLong = addParticipant(room, "Bob", false, "x".repeat(9));
    expect(tooLong.avatar).toBe(DEFAULT_AVATAR);
  });
});

describe("isValidAvatar", () => {
  test("accepts non-empty strings up to 8 characters", () => {
    expect(isValidAvatar("🦄")).toBe(true);
    expect(isValidAvatar("x".repeat(8))).toBe(true);
  });

  test("rejects empty, too-long, or non-string values", () => {
    expect(isValidAvatar("")).toBe(false);
    expect(isValidAvatar("x".repeat(9))).toBe(false);
    expect(isValidAvatar(undefined)).toBe(false);
    expect(isValidAvatar(42)).toBe(false);
  });
});

describe("setAvatar", () => {
  test("updates the participant's avatar", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);

    setAvatar(alice, "🐙");

    expect(alice.avatar).toBe("🐙");
  });
});

describe("isRoomFull", () => {
  test("is false below the participant cap and true once it is reached", () => {
    const room = createRoom();
    for (let i = 0; i < MAX_PARTICIPANTS - 1; i++) {
      addParticipant(room, `Participant ${i}`, false);
    }
    expect(isRoomFull(room)).toBe(false);

    addParticipant(room, "One more", false);

    expect(isRoomFull(room)).toBe(true);
    expect(room.participants.size).toBe(MAX_PARTICIPANTS);
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

describe("isUnanimousVote", () => {
  test("is false with fewer than two voters", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    castVote(alice, 5);

    expect(isUnanimousVote(room)).toBe(false);
  });

  test("is true when every voter picked the exact same card", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    castVote(alice, "coffee");
    castVote(bob, "coffee");

    expect(isUnanimousVote(room)).toBe(true);
  });

  test("is false when votes differ", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    castVote(alice, 5);
    castVote(bob, 8);

    expect(isUnanimousVote(room)).toBe(false);
  });

  test("ignores spectators and disconnected participants", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    const carol = addParticipant(room, "Carol", true);
    const dave = addParticipant(room, "Dave", false);
    castVote(alice, 5);
    castVote(bob, 5);
    castVote(carol, 8);
    castVote(dave, 8);
    disconnectParticipant(room, dave.id);

    expect(isUnanimousVote(room)).toBe(true);
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

describe("reveal", () => {
  test("awards a trophy to the closest guesser(s)", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    castVote(alice, 5);
    castVote(bob, 8);
    castGuess(alice, 8);
    castGuess(bob, 6.5);

    reveal(room);

    expect(bob.trophyCount).toBe(1);
    expect(alice.trophyCount).toBe(0);
  });

  test("awards a trophy to every voter on a unanimous vote", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    castVote(alice, "coffee");
    castVote(bob, "coffee");

    reveal(room);

    expect(alice.trophyCount).toBe(1);
    expect(bob.trophyCount).toBe(1);
  });

  test("trophies accumulate across rounds and are not reset by startNewRound", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    castVote(alice, "coffee");
    castVote(bob, "coffee");
    reveal(room);
    startNewRound(room);
    castVote(alice, "coffee");
    castVote(bob, "coffee");
    reveal(room);

    expect(alice.trophyCount).toBe(2);
    expect(bob.trophyCount).toBe(2);
  });
});

describe("startNewRound", () => {
  test("resets phase to voting and clears every vote and guess", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    castVote(alice, 3);
    castVote(bob, 5);
    castGuess(alice, 4);
    castGuess(bob, 6);
    reveal(room);

    startNewRound(room);

    expect(room.phase).toBe("voting");
    expect(alice.vote).toBeNull();
    expect(bob.vote).toBeNull();
    expect(alice.guess).toBeNull();
    expect(bob.guess).toBeNull();
  });
});

describe("castGuess", () => {
  test("sets the participant's guess", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);

    castGuess(alice, 4.5);

    expect(alice.guess).toBe(4.5);
  });
});

describe("computeGuessWinners", () => {
  test("returns an empty array when there is no evaluation", () => {
    const room = createRoom();
    addParticipant(room, "Alice", false);

    expect(computeGuessWinners(room, null)).toEqual([]);
  });

  test("returns an empty array when nobody guessed", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    castVote(alice, 5);

    expect(computeGuessWinners(room, computeEvaluation(room))).toEqual([]);
  });

  test("picks the single closest guesser", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    castVote(alice, 5);
    castVote(bob, 8);
    castGuess(alice, 8);
    castGuess(bob, 6.5);

    const evaluation = computeEvaluation(room);
    expect(evaluation?.average).toBeCloseTo(6.5);
    expect(computeGuessWinners(room, evaluation)).toEqual([bob.id]);
  });

  test("shares the win on an exact tie", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    castVote(alice, 5);
    castVote(bob, 8);
    castGuess(alice, 6);
    castGuess(bob, 7);

    const evaluation = computeEvaluation(room);
    expect(evaluation?.average).toBe(6.5);
    expect(computeGuessWinners(room, evaluation)).toEqual([alice.id, bob.id]);
  });

  test("ignores spectators", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", true);
    castVote(alice, 5);
    castGuess(alice, 10);
    castGuess(bob, 5);

    const evaluation = computeEvaluation(room);
    expect(computeGuessWinners(room, evaluation)).toEqual([alice.id]);
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

describe("findParticipantByToken", () => {
  test("finds the participant whose token matches", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    addParticipant(room, "Bob", false);

    expect(findParticipantByToken(room, alice.token)).toBe(alice);
  });

  test("returns undefined when no participant has that token", () => {
    const room = createRoom();
    addParticipant(room, "Alice", false);

    expect(findParticipantByToken(room, "no-such-token")).toBeUndefined();
  });
});
