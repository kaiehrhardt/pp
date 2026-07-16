import { useEffect, useMemo, type CSSProperties } from "react";

const CONFETTI_COLORS = ["#e11d48", "#f97316", "#eab308", "#22c55e", "#0ea5e9", "#8b5cf6"];
const PIECE_COUNT = 70;

interface ConfettiProps {
  onDone: () => void;
}

export function Confetti({ onDone }: ConfettiProps) {
  useEffect(() => {
    const timer = setTimeout(onDone, 2500);
    return () => clearTimeout(timer);
  }, [onDone]);

  const pieces = useMemo(
    () =>
      Array.from({ length: PIECE_COUNT }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 1.8 + Math.random() * 1.2,
        rotate: 360 + Math.random() * 360,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [],
  );

  return (
    <div className="confetti-overlay">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={
            {
              "--x": `${p.x}%`,
              "--delay": `${p.delay}s`,
              "--duration": `${p.duration}s`,
              "--rotate": `${p.rotate}deg`,
              "--color": p.color,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
