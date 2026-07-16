import { describe, expect, test } from "bun:test";
import { DECK, isNumericCard, isValidCard } from "./deck";

describe("isNumericCard", () => {
  test("returns true for numeric cards", () => {
    for (const card of DECK) {
      if (typeof card === "number") expect(isNumericCard(card)).toBe(true);
    }
  });

  test("returns false for non-numeric cards", () => {
    expect(isNumericCard("coffee")).toBe(false);
    expect(isNumericCard("unknown")).toBe(false);
  });
});

describe("isValidCard", () => {
  test("returns true for every card in the deck", () => {
    for (const card of DECK) {
      expect(isValidCard(card)).toBe(true);
    }
  });

  test("returns false for values outside the deck", () => {
    expect(isValidCard(4)).toBe(false);
    expect(isValidCard("tea")).toBe(false);
    expect(isValidCard(null)).toBe(false);
    expect(isValidCard(undefined)).toBe(false);
  });
});
