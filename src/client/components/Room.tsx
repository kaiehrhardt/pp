import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocale } from "../i18n/useLocale";
import type { JoinInfo } from "../useRoomSocket";
import { tokenKey, useRoomSocket } from "../useRoomSocket";
import { CardHand } from "./CardHand";
import { ChatPanel } from "./ChatPanel";
import { Confetti } from "./Confetti";
import { GuessInput } from "./GuessInput";
import { JoinForm } from "./JoinForm";
import { Leaderboard } from "./Leaderboard";
import { ParticipantTile } from "./ParticipantTile";
import { RpsDuelOverlay } from "./RpsDuelOverlay";
import type { SeatPosition } from "./ThrownEmoji";
import { ThrownEmoji } from "./ThrownEmoji";

function seatPosition(index: number, total: number): SeatPosition {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  const radius = 42;
  return { x: 50 + radius * Math.cos(angle), y: 50 + radius * Math.sin(angle) };
}

interface RoomProps {
  roomId: string;
}

export function Room({ roomId }: RoomProps) {
  const { t } = useTranslation();
  const { formatAverage } = useLocale();
  const [joinInfo, setJoinInfo] = useState<JoinInfo | null>(null);
  const [needsJoin] = useState(() => !localStorage.getItem(tokenKey(roomId)));
  const {
    status,
    roomState,
    participantId,
    reactions,
    chatMessages,
    kicked,
    roomFull,
    vote,
    toggleSpectator,
    newRound,
    react,
    kick,
    sendChat,
    guessAverage,
    duelInvite,
    duelPending,
    activeDuel,
    duelResult,
    challengeToRps,
    respondToRps,
    submitRpsMove,
    cancelRpsChallenge,
    setAvatar,
  } = useRoomSocket(roomId, joinInfo);

  const roomLink = useMemo(() => `${location.origin}/room/${roomId}`, [roomId]);
  const [copied, setCopied] = useState(false);

  const prevPhaseRef = useRef(roomState?.phase);
  const [confettiActive, setConfettiActive] = useState(false);
  useEffect(() => {
    if (roomState && prevPhaseRef.current === "voting" && roomState.phase === "revealed" && roomState.unanimousVote) {
      setConfettiActive(true);
    }
    prevPhaseRef.current = roomState?.phase;
  }, [roomState?.phase, roomState?.unanimousVote]);

  if (needsJoin && !joinInfo) {
    return <JoinForm onSubmit={setJoinInfo} />;
  }

  if (kicked) {
    return (
      <main className="room-connecting">
        <span className="brand-logo">👢</span>
        <p>{t("room.kickedMessage")}</p>
      </main>
    );
  }

  if (roomFull) {
    return (
      <main className="room-connecting">
        <span className="brand-logo">🙅</span>
        <p>{t("room.fullMessage")}</p>
      </main>
    );
  }

  if (!roomState || !participantId) {
    return (
      <main className="room-connecting">
        <span className="brand-logo">🃏</span>
        <p>{status === "closed" ? t("room.reconnecting") : t("room.connecting")}</p>
      </main>
    );
  }

  const self = roomState.participants.find((p) => p.id === participantId);
  const isHost = roomState.hostId === participantId;
  const revealed = roomState.phase === "revealed";

  const seatPositions = new Map<string, SeatPosition>(
    roomState.participants.map((participant, index) => [
      participant.id,
      seatPosition(index, roomState.participants.length),
    ]),
  );

  async function copyLink() {
    await navigator.clipboard.writeText(roomLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <main className="room">
      {confettiActive && <Confetti onDone={() => setConfettiActive(false)} />}
      <header className="room-header">
        <div className="brand">
          <span className="brand-logo">🃏</span>
          <h1>Planning Poker</h1>
        </div>
        <button type="button" className="button-secondary" onClick={copyLink}>
          {copied ? t("room.copyLinkCopied") : t("room.copyLinkDefault")}
        </button>
      </header>

      <div className="table-area">
        <Leaderboard participants={roomState.participants} />

        <div className="table">
          <div className="table-surface">
            {revealed && roomState.evaluation && (
              <div className="evaluation">
                <div className="evaluation-average">Ø {formatAverage(roomState.evaluation.average)}</div>
                <div className="evaluation-recommendation">
                  {t("room.recommendation", { card: roomState.evaluation.recommendedCard })}
                </div>
              </div>
            )}
            {isHost && revealed && (
              <button type="button" className="new-round-button" onClick={newRound}>
                {t("room.newRoundButton")}
              </button>
            )}
            {!revealed && self && !self.isSpectator && (
              <GuessInput value={self.guess} onSubmit={guessAverage} />
            )}
          </div>

          {roomState.participants.map((participant, index) => {
            const pos = seatPositions.get(participant.id)!;
            return (
              <div
                key={participant.id}
                className="seat-position"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                <ParticipantTile
                  participant={participant}
                  isHost={roomState.hostId === participant.id}
                  isSelf={participant.id === participantId}
                  revealed={revealed}
                  canKick={isHost && participant.id !== participantId}
                  isGuessWinner={roomState.guessWinnerIds.includes(participant.id)}
                  canChallenge={participant.id !== participantId && participant.connected && roomState.phase === "voting"}
                  flipDelay={index * 70}
                  onReact={(emoji) => react(participant.id, emoji)}
                  onKick={() => kick(participant.id)}
                  onChallenge={() => challengeToRps(participant.id)}
                  onSetAvatar={setAvatar}
                />
              </div>
            );
          })}

          {reactions.map((r) => {
            const from = seatPositions.get(r.from);
            const to = seatPositions.get(r.to);
            if (!from || !to) return null;
            return <ThrownEmoji key={r.id} emoji={r.emoji} from={from} to={to} />;
          })}
        </div>
      </div>

      <footer className="room-footer">
        <label className="spectator-toggle">
          <input type="checkbox" checked={self?.isSpectator ?? false} onChange={toggleSpectator} />
          {t("room.spectatorToggleLabel")}
        </label>
        <CardHand
          selected={self?.vote ?? null}
          disabled={Boolean(self?.isSpectator) || roomState.phase !== "voting"}
          onSelect={vote}
        />
      </footer>

      <ChatPanel messages={chatMessages} selfId={participantId} onSend={sendChat} />

      <RpsDuelOverlay
        duelInvite={duelInvite}
        duelPending={duelPending}
        activeDuel={activeDuel}
        duelResult={duelResult}
        nameFor={(id) => roomState.participants.find((p) => p.id === id)?.name ?? "?"}
        onRespond={respondToRps}
        onMove={submitRpsMove}
        onCancel={cancelRpsChallenge}
      />
    </main>
  );
}
