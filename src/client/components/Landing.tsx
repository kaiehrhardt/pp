import { useState } from "react";
import { createRoom } from "../api";

interface LandingProps {
  navigate: (to: string) => void;
}

export function Landing({ navigate }: LandingProps) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const roomId = await createRoom();
      navigate(`/room/${roomId}`);
    } catch {
      setError("Room konnte nicht erstellt werden. Bitte nochmal versuchen.");
      setCreating(false);
    }
  }

  return (
    <main className="landing">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-logo">🃏</span>
          <h1>Planning Poker</h1>
        </div>
        <p>Erstelle einen Room und teile den Link mit deinem Team.</p>
        <button type="button" className="button-primary" onClick={handleCreate} disabled={creating}>
          {creating ? "Erstelle…" : "Neuen Room erstellen"}
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
