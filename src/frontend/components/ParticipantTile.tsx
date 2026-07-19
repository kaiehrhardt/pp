import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { Card } from "../../backend/domain/types";
import type { ParticipantDTO } from "../../backend/ws/protocol";
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
  isGuessWinner: boolean;
  canChallenge: boolean;
  flipDelay: number;
  onReact: (emoji: string) => void;
  onKick: () => void;
  onChallenge: () => void;
  onSetAvatar: (avatar: string) => void;
}

export function ParticipantTile({
  participant,
  isHost,
  isSelf,
  revealed,
  canKick,
  isGuessWinner,
  canChallenge,
  flipDelay,
  onReact,
  onKick,
  onChallenge,
  onSetAvatar,
}: ParticipantTileProps) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);

  const hasVoteBadge = !participant.isSpectator;
  const showVoteBadge = hasVoteBadge && (revealed || participant.hasVoted);
  const voteValue = participant.vote !== null ? cardLabel(participant.vote) : "–";
  const pickerIsOpen = pickerOpen || avatarPickerOpen;

  function handleKick() {
    if (confirm(t("participantTile.confirmKick", { name: participant.name }))) onKick();
  }

  return (
    <div
      className={`participant-tile${isSelf ? " participant-tile-self" : ""}${!participant.connected ? " participant-tile-disconnected" : ""}${pickerIsOpen ? " participant-tile-active" : ""}`}
      style={{ "--seat-color": participant.color } as CSSProperties}
    >
      <button
        type="button"
        className={`participant-tile-main${isSelf ? " participant-tile-main-self" : ""}`}
        onClick={() => !isSelf && setPickerOpen((open) => !open)}
        title={isSelf ? undefined : t("participantTile.throwEmojiTitle", { name: participant.name })}
      >
        <span className="participant-avatar-wrap">
          <span className="participant-avatar">{participant.avatar}</span>
          {isHost && (
            <span className="host-badge" title={t("participantTile.hostTitle")}>
              👑
            </span>
          )}
          {isSelf && (
            <span
              className="avatar-edit-badge"
              role="button"
              tabIndex={0}
              title={t("participantTile.editAvatarTitle")}
              onClick={(e) => {
                e.stopPropagation();
                setAvatarPickerOpen((open) => !open);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                e.stopPropagation();
                setAvatarPickerOpen((open) => !open);
              }}
            >
              ✏️
            </span>
          )}
        </span>
        <span className="participant-name">{participant.name}</span>
        {participant.trophyCount > 0 && (
          <span
            className="participant-badge participant-badge-trophy"
            title={t("participantTile.trophyTitle", { count: participant.trophyCount })}
          >
            🏆 {participant.trophyCount}
          </span>
        )}
        {participant.isSpectator && (
          <span className="participant-badge">{t("participantTile.spectatorBadge")}</span>
        )}
        {revealed && isGuessWinner && (
          <span className="participant-badge participant-badge-guess">
            {t("participantTile.guessWinnerBadge")}
          </span>
        )}
        {hasVoteBadge && (
          <span
            className={`participant-vote${revealed ? " participant-vote-revealed" : ""}${showVoteBadge ? "" : " participant-vote-empty"}`}
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

      {canChallenge && (
        <button
          type="button"
          className="rps-challenge-badge"
          title={t("participantTile.rpsChallengeTitle", { name: participant.name })}
          onClick={onChallenge}
        >
          ✊
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

      {avatarPickerOpen && (
        <EmojiPicker
          onSelect={(emoji) => {
            onSetAvatar(emoji);
            setAvatarPickerOpen(false);
          }}
          onClose={() => setAvatarPickerOpen(false)}
        />
      )}
    </div>
  );
}
