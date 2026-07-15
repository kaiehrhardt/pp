import { useState } from "react";
import type { JoinInfo } from "../useRoomSocket";

interface JoinFormProps {
  onSubmit: (info: JoinInfo) => void;
}

export function JoinForm({ onSubmit }: JoinFormProps) {
  const [name, setName] = useState("");
  const [isSpectator, setIsSpectator] = useState(false);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, isSpectator });
  }

  return (
    <main className="landing">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-logo">🃏</span>
          <h1>Planning Poker</h1>
        </div>
        <form onSubmit={handleSubmit}>
          <label>
            Dein Name
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              required
              placeholder="z. B. Alex"
            />
          </label>
          <label className="join-form-checkbox">
            <input
              type="checkbox"
              checked={isSpectator}
              onChange={(e) => setIsSpectator(e.target.checked)}
            />
            Ich schaue nur zu
          </label>
          <button type="submit" className="button-primary">
            Raum betreten
          </button>
        </form>
      </div>
    </main>
  );
}
