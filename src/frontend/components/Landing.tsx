import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createRoom } from "../api";

interface LandingProps {
  navigate: (to: string) => void;
}

export function Landing({ navigate }: LandingProps) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const roomId = await createRoom();
      navigate(`/room/${roomId}`);
    } catch {
      setError(t("landing.createError"));
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
        <p>{t("landing.description")}</p>
        <button type="button" className="button-primary" onClick={handleCreate} disabled={creating}>
          {creating ? t("landing.creating") : t("landing.createButton")}
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
