import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RpsMove } from "../../server/domain/types";
import type { ActiveDuel, DuelInvite, DuelPending, DuelResult } from "../useRoomSocket";

const MOVE_EMOJI: Record<RpsMove, string> = { rock: "✊", paper: "✋", scissors: "✌️" };
const MOVES: RpsMove[] = ["rock", "paper", "scissors"];

interface RpsDuelOverlayProps {
  duelInvite: DuelInvite | null;
  duelPending: DuelPending | null;
  activeDuel: ActiveDuel | null;
  duelResult: DuelResult | null;
  nameFor: (participantId: string) => string;
  onRespond: (duelId: string, accept: boolean) => void;
  onMove: (duelId: string, move: RpsMove) => void;
  onCancel: (duelId: string) => void;
}

export function RpsDuelOverlay({
  duelInvite,
  duelPending,
  activeDuel,
  duelResult,
  nameFor,
  onRespond,
  onMove,
  onCancel,
}: RpsDuelOverlayProps) {
  const { t } = useTranslation();
  const [pickedMove, setPickedMove] = useState<RpsMove | null>(null);

  useEffect(() => {
    setPickedMove(null);
  }, [activeDuel?.duelId, activeDuel?.round]);

  if (duelResult) {
    return (
      <div className="rps-overlay">
        <div className="rps-modal">
          <p className="rps-result-moves">
            {MOVE_EMOJI[duelResult.yourMove]} vs. {MOVE_EMOJI[duelResult.opponentMove]}
          </p>
          <p className="rps-score">
            {duelResult.yourScore} : {duelResult.opponentScore}
          </p>
          <p className="rps-result-outcome">
            {t(`rpsDuel.${duelResult.matchOver ? "matchOutcome" : "roundOutcome"}.${duelResult.outcome}`)}
          </p>
        </div>
      </div>
    );
  }

  if (activeDuel) {
    if (pickedMove) {
      return (
        <div className="rps-overlay">
          <div className="rps-modal">
            <p className="rps-score">
              {activeDuel.yourScore} : {activeDuel.opponentScore}
            </p>
            <p>{t("rpsDuel.waitingForOpponent")}</p>
          </div>
        </div>
      );
    }
    return (
      <div className="rps-overlay">
        <div className="rps-modal">
          <p className="rps-best-of">{t("rpsDuel.bestOf", { n: activeDuel.bestOf })}</p>
          <p className="rps-score">
            {activeDuel.yourScore} : {activeDuel.opponentScore}
          </p>
          <p>{t("rpsDuel.pickMove", { name: nameFor(activeDuel.opponentId) })}</p>
          <div className="rps-move-buttons">
            {MOVES.map((move) => (
              <button
                key={move}
                type="button"
                className="rps-move-button"
                onClick={() => {
                  setPickedMove(move);
                  onMove(activeDuel.duelId, move);
                }}
              >
                {MOVE_EMOJI[move]}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (duelPending) {
    return (
      <div className="rps-overlay">
        <div className="rps-modal">
          <p>{t("rpsDuel.waitingForResponse", { name: nameFor(duelPending.to) })}</p>
          <button type="button" className="button-secondary" onClick={() => onCancel(duelPending.duelId)}>
            {t("rpsDuel.cancelButton")}
          </button>
        </div>
      </div>
    );
  }

  if (duelInvite) {
    return (
      <div className="rps-overlay">
        <div className="rps-modal">
          <p>{t("rpsDuel.inviteMessage", { name: nameFor(duelInvite.from) })}</p>
          <div className="rps-move-buttons">
            <button type="button" className="button-secondary" onClick={() => onRespond(duelInvite.duelId, false)}>
              {t("rpsDuel.declineButton")}
            </button>
            <button type="button" className="button-secondary" onClick={() => onRespond(duelInvite.duelId, true)}>
              {t("rpsDuel.acceptButton")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
