import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { ParticipantDTO } from "../../server/ws/protocol";

const MEDALS = ["🥇", "🥈", "🥉"];

interface LeaderboardProps {
  participants: ParticipantDTO[];
}

export function Leaderboard({ participants }: LeaderboardProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const totalTrophies = participants.reduce((sum, p) => sum + p.trophyCount, 0);
  const ranked = [...participants].sort((a, b) => b.trophyCount - a.trophyCount);

  return (
    <div className="leaderboard-widget">
      <button
        type="button"
        className="leaderboard-toggle"
        onClick={() => setOpen((current) => !current)}
        title={t("leaderboard.title")}
      >
        🏆
        {totalTrophies > 0 && <span className="leaderboard-badge">{totalTrophies}</span>}
      </button>

      {open && (
        <div className="leaderboard-panel">
          <header className="leaderboard-panel-header">
            <h2>{t("leaderboard.title")}</h2>
            <button
              type="button"
              className="changelog-close"
              onClick={() => setOpen(false)}
              title={t("leaderboard.close")}
            >
              ✕
            </button>
          </header>

          <div className="leaderboard-list">
            {totalTrophies === 0 ? (
              <p className="leaderboard-empty">{t("leaderboard.empty")}</p>
            ) : (
              ranked.map((participant, index) => (
                <div
                  key={participant.id}
                  className={`leaderboard-row${!participant.connected ? " leaderboard-row-disconnected" : ""}`}
                  style={{ "--seat-color": participant.color } as CSSProperties}
                >
                  <span className="leaderboard-rank">
                    {participant.trophyCount > 0 && MEDALS[index] ? MEDALS[index] : index + 1}
                  </span>
                  <span className="leaderboard-avatar">{participant.avatar}</span>
                  <span className="leaderboard-name">{participant.name}</span>
                  <span className="leaderboard-count">
                    {participant.trophyCount > 0 ? `🏆 ${participant.trophyCount}` : "–"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
