import type { Card, NumericCard } from "./types";

export const DECK: Card[] = [1, 2, 3, 5, 8, 13, 21, 34, 55, "coffee", "unknown"];

export function isNumericCard(card: Card): card is NumericCard {
  return typeof card === "number";
}

export function isValidCard(value: unknown): value is Card {
  return (DECK as unknown[]).includes(value);
}
