import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { Card } from "../../server/domain/types";
import type { ParticipantDTO } from "../../server/ws/protocol";
import { EmojiPicker } from "./EmojiPicker";

function cardLabel(card: Card): string {
  if (card === "coffee") return "☕";
  if (card === "unknown") return "?";
  return String(card);
}

interface ParticipantTileProps {
  participant: ParticipantDTO;
  isHost: boolean;
  isSelf: boolean;
  revealed: boolean;
  canKick: boolean;
  flipDelay: number;
  onReact: (emoji: string) => void;
  onKick: () => void;
}

export function ParticipantTile({
  participant,
  isHost,
  isSelf,
  revealed,
  canKick,
  flipDelay,
  onReact,
  onKick,
}: ParticipantTileProps) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);

  const showVoteBadge = !participant.isSpectator && (revealed || participant.hasVoted);
  const voteValue = participant.vote !== null ? cardLabel(participant.vote) : "–";

  function handleKick() {
    if (confirm(t("participantTile.confirmKick", { name: participant.name }))) onKick();
  }

  return (
    <div
      className={`participant-tile${isSelf ? " participant-tile-self" : ""}${!participant.connected ? " participant-tile-disconnected" : ""}`}
      style={{ "--seat-color": participant.color } as CSSProperties}
    >
      <button
        type="button"
        className="participant-tile-main"
        onClick={() => !isSelf && setPickerOpen((open) => !open)}
        disabled={isSelf}
        title={isSelf ? undefined : t("participantTile.throwEmojiTitle", { name: participant.name })}
      >
        <span className="participant-avatar-wrap">
          <span className="participant-avatar" style={{ background: participant.color }}>
            {participant.name.slice(0, 1).toUpperCase()}
          </span>
          {isHost && (
            <span className="host-badge" title={t("participantTile.hostTitle")}>
              👑
            </span>
          )}
        </span>
        <span className="participant-name">{participant.name}</span>
        {participant.isSpectator && (
          <span className="participant-badge">{t("participantTile.spectatorBadge")}</span>
        )}
        {showVoteBadge && (
          <span
            className={`participant-vote${revealed ? " participant-vote-revealed" : ""}`}
            style={{ "--flip-delay": `${flipDelay}ms` } as CSSProperties}
          >
            <span className="participant-vote-inner">
              <span className="participant-vote-face participant-vote-front">🃏</span>
              <span className="participant-vote-face participant-vote-back">{voteValue}</span>
            </span>
          </span>
        )}
      </button>

      {canKick && (
        <button
          type="button"
          className="kick-badge"
          title={t("participantTile.kickTitle", { name: participant.name })}
          onClick={handleKick}
        >
          ✕
        </button>
      )}

      {pickerOpen && (
        <EmojiPicker
          onSelect={(emoji) => {
            onReact(emoji);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
