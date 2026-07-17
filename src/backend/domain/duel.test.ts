import { describe, expect, test } from "bun:test";
import {
  acceptDuel,
  bothMovesIn,
  cancelDuelsFor,
  createDuel,
  findActiveDuelFor,
  isMatchOver,
  isValidRpsMove,
  matchWinnerId,
  recordRoundResult,
  removeDuel,
  resolveRound,
  RPS_WINS_NEEDED,
  submitMove,
} from "./duel";
import { addParticipant, createRoom, disconnectParticipant } from "./room";
import type { RpsMove } from "./types";

describe("isValidRpsMove", () => {
  test("accepts the three valid moves", () => {
    expect(isValidRpsMove("rock")).toBe(true);
    expect(isValidRpsMove("paper")).toBe(true);
    expect(isValidRpsMove("scissors")).toBe(true);
  });

  test("rejects anything else", () => {
    expect(isValidRpsMove("lizard")).toBe(false);
    expect(isValidRpsMove(undefined)).toBe(false);
  });
});

describe("createDuel", () => {
  test("rejects a self-challenge", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);

    expect(createDuel(room, alice.id, alice.id)).toBeNull();
  });

  test("rejects challenging a disconnected participant", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    disconnectParticipant(room, bob.id);

    expect(createDuel(room, alice.id, bob.id)).toBeNull();
  });

  test("rejects a challenge when either side already has a pending/active duel", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    const carol = addParticipant(room, "Carol", false);
    createDuel(room, alice.id, bob.id);

    expect(createDuel(room, alice.id, carol.id)).toBeNull();
    expect(createDuel(room, carol.id, bob.id)).toBeNull();
  });

  test("succeeds otherwise and adds the duel to the room", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);

    const duel = createDuel(room, alice.id, bob.id);

    expect(duel).not.toBeNull();
    expect(room.duels.get(duel!.id)).toBe(duel!);
    expect(duel!.status).toBe("pending");
    expect(duel!.roundsPlayed).toBe(0);
    expect(duel!.wins.get(alice.id)).toBe(0);
    expect(duel!.wins.get(bob.id)).toBe(0);
  });
});

describe("findActiveDuelFor", () => {
  test("finds a duel by either participant id", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    const duel = createDuel(room, alice.id, bob.id)!;

    expect(findActiveDuelFor(room, alice.id)).toBe(duel);
    expect(findActiveDuelFor(room, bob.id)).toBe(duel);
  });

  test("returns undefined when there is no duel", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);

    expect(findActiveDuelFor(room, alice.id)).toBeUndefined();
  });
});

describe("acceptDuel / removeDuel / cancelDuelsFor", () => {
  test("acceptDuel flips status to active", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    const duel = createDuel(room, alice.id, bob.id)!;

    acceptDuel(duel);

    expect(duel.status).toBe("active");
  });

  test("removeDuel deletes it from the room", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    const duel = createDuel(room, alice.id, bob.id)!;

    removeDuel(room, duel.id);

    expect(room.duels.has(duel.id)).toBe(false);
  });

  test("cancelDuelsFor removes and returns all duels involving a participant", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    const duel = createDuel(room, alice.id, bob.id)!;

    const cancelled = cancelDuelsFor(room, alice.id);

    expect(cancelled).toEqual([duel]);
    expect(room.duels.size).toBe(0);
  });
});

describe("submitMove / bothMovesIn", () => {
  test("records the first move and ignores a second move from the same participant", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    const duel = createDuel(room, alice.id, bob.id)!;
    acceptDuel(duel);

    submitMove(duel, alice.id, "rock");
    submitMove(duel, alice.id, "paper");

    expect(duel.moves.get(alice.id)).toBe("rock");
  });

  test("bothMovesIn is true only once both sides moved", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    const duel = createDuel(room, alice.id, bob.id)!;
    acceptDuel(duel);

    expect(bothMovesIn(duel)).toBe(false);
    submitMove(duel, alice.id, "rock");
    expect(bothMovesIn(duel)).toBe(false);
    submitMove(duel, bob.id, "scissors");
    expect(bothMovesIn(duel)).toBe(true);
  });
});

describe("resolveRound", () => {
  const room = createRoom();
  const alice = addParticipant(room, "Alice", false);
  const bob = addParticipant(room, "Bob", false);

  function play(a: RpsMove, b: RpsMove) {
    const duel = createDuel(room, alice.id, bob.id)!;
    acceptDuel(duel);
    submitMove(duel, alice.id, a);
    submitMove(duel, bob.id, b);
    const result = resolveRound(duel);
    removeDuel(room, duel.id);
    return result;
  }

  test("all nine rock/paper/scissors combinations", () => {
    expect(play("rock", "rock")).toEqual({ winnerId: null });
    expect(play("paper", "paper")).toEqual({ winnerId: null });
    expect(play("scissors", "scissors")).toEqual({ winnerId: null });

    expect(play("rock", "scissors")).toEqual({ winnerId: alice.id });
    expect(play("paper", "rock")).toEqual({ winnerId: alice.id });
    expect(play("scissors", "paper")).toEqual({ winnerId: alice.id });

    expect(play("scissors", "rock")).toEqual({ winnerId: bob.id });
    expect(play("rock", "paper")).toEqual({ winnerId: bob.id });
    expect(play("paper", "scissors")).toEqual({ winnerId: bob.id });
  });
});

describe("recordRoundResult / isMatchOver", () => {
  test("increments the winner's score and clears moves for the next round", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    const duel = createDuel(room, alice.id, bob.id)!;
    acceptDuel(duel);
    submitMove(duel, alice.id, "rock");
    submitMove(duel, bob.id, "scissors");

    recordRoundResult(duel, alice.id);

    expect(duel.wins.get(alice.id)).toBe(1);
    expect(duel.wins.get(bob.id)).toBe(0);
    expect(duel.roundsPlayed).toBe(1);
    expect(duel.moves.size).toBe(0);
  });

  test("a draw increments roundsPlayed but no one's score", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    const duel = createDuel(room, alice.id, bob.id)!;
    acceptDuel(duel);
    submitMove(duel, alice.id, "rock");
    submitMove(duel, bob.id, "rock");

    recordRoundResult(duel, null);

    expect(duel.wins.get(alice.id)).toBe(0);
    expect(duel.wins.get(bob.id)).toBe(0);
    expect(duel.roundsPlayed).toBe(1);
  });

  test("isMatchOver is true once a side reaches the wins needed for the best-of format", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    const duel = createDuel(room, alice.id, bob.id)!;
    acceptDuel(duel);

    for (let i = 0; i < RPS_WINS_NEEDED - 1; i++) {
      recordRoundResult(duel, alice.id);
    }
    expect(isMatchOver(duel)).toBe(false);

    recordRoundResult(duel, alice.id);
    expect(isMatchOver(duel)).toBe(true);
  });
});

describe("matchWinnerId", () => {
  test("is null before either side has reached the wins needed", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    const duel = createDuel(room, alice.id, bob.id)!;
    acceptDuel(duel);

    expect(matchWinnerId(duel)).toBeNull();
  });

  test("returns the id of the side that reached the wins needed", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    const duel = createDuel(room, alice.id, bob.id)!;
    acceptDuel(duel);

    for (let i = 0; i < RPS_WINS_NEEDED; i++) {
      recordRoundResult(duel, alice.id);
    }

    expect(matchWinnerId(duel)).toBe(alice.id);
  });
});

describe("best-of-3 match flow", () => {
  test("a full match: alice wins round 1, bob wins round 2 (draw replayed), alice wins round 3 and the match", () => {
    const room = createRoom();
    const alice = addParticipant(room, "Alice", false);
    const bob = addParticipant(room, "Bob", false);
    const duel = createDuel(room, alice.id, bob.id)!;
    acceptDuel(duel);

    function playRound(a: RpsMove, b: RpsMove) {
      submitMove(duel, alice.id, a);
      submitMove(duel, bob.id, b);
      expect(bothMovesIn(duel)).toBe(true);
      const { winnerId } = resolveRound(duel);
      recordRoundResult(duel, winnerId);
      return winnerId;
    }

    // Round 1: alice wins with rock vs. scissors.
    expect(playRound("rock", "scissors")).toBe(alice.id);
    expect(duel.wins.get(alice.id)).toBe(1);
    expect(isMatchOver(duel)).toBe(false);

    // Round 2: a draw, replayed without affecting the score.
    expect(playRound("paper", "paper")).toBeNull();
    expect(duel.roundsPlayed).toBe(2);
    expect(isMatchOver(duel)).toBe(false);

    // Round 2 (replay): bob wins with paper vs. rock.
    expect(playRound("rock", "paper")).toBe(bob.id);
    expect(duel.wins.get(bob.id)).toBe(1);
    expect(isMatchOver(duel)).toBe(false);

    // Round 3: alice wins with scissors vs. paper, clinching the match 2-1.
    expect(playRound("scissors", "paper")).toBe(alice.id);
    expect(duel.wins.get(alice.id)).toBe(2);
    expect(isMatchOver(duel)).toBe(true);
    expect(duel.roundsPlayed).toBe(4);
  });
});
