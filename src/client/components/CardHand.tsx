import { DECK } from "../../server/domain/deck";
import type { Card } from "../../server/domain/types";

function label(card: Card): string {
  if (card === "coffee") return "☕";
  if (card === "unknown") return "?";
  return String(card);
}

interface CardHandProps {
  selected: Card | null;
  disabled: boolean;
  onSelect: (card: Card) => void;
}

export function CardHand({ selected, disabled, onSelect }: CardHandProps) {
  return (
    <div className={`card-hand${disabled ? " card-hand-disabled" : ""}`}>
      {DECK.map((card) => (
        <button
          key={String(card)}
          type="button"
          className={`playing-card${selected === card ? " playing-card-selected" : ""}`}
          disabled={disabled}
          onClick={() => onSelect(card)}
        >
          {label(card)}
        </button>
      ))}
    </div>
  );
}
