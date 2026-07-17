import type { CSSProperties } from "react";

export interface SeatPosition {
  x: number;
  y: number;
}

interface ThrownEmojiProps {
  emoji: string;
  from: SeatPosition;
  to: SeatPosition;
}

export function ThrownEmoji({ emoji, from, to }: ThrownEmojiProps) {
  const midX = (from.x + to.x) / 2;
  const midY = Math.min(from.y, to.y) - 18;

  return (
    <span
      className="flying-emoji"
      style={
        {
          "--from-x": `${from.x}%`,
          "--from-y": `${from.y}%`,
          "--mid-x": `${midX}%`,
          "--mid-y": `${midY}%`,
          "--to-x": `${to.x}%`,
          "--to-y": `${to.y}%`,
        } as CSSProperties
      }
    >
      {emoji}
    </span>
  );
}
