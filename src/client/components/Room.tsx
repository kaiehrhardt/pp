import { useMemo, useState } from "react";
import type { JoinInfo } from "../useRoomSocket";
import { tokenKey, useRoomSocket } from "../useRoomSocket";
import { CardHand } from "./CardHand";
import { ChatPanel } from "./ChatPanel";
import { JoinForm } from "./JoinForm";
import { ParticipantTile } from "./ParticipantTile";
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
  const [joinInfo, setJoinInfo] = useState<JoinInfo | null>(null);
  const [needsJoin] = useState(() => !localStorage.getItem(tokenKey(roomId)));
  const {
    status,
    roomState,
    participantId,
    reactions,
    chatMessages,
    kicked,
    vote,
    toggleSpectator,
    newRound,
    react,
    kick,
    sendChat,
  } = useRoomSocket(roomId, joinInfo);

  const roomLink = useMemo(() => `${location.origin}/room/${roomId}`, [roomId]);
  const [copied, setCopied] = useState(false);

  if (needsJoin && !joinInfo) {
    return <JoinForm onSubmit={setJoinInfo} />;
  }

  if (kicked) {
    return (
      <main className="room-connecting">
        <span className="brand-logo">👢</span>
        <p>Der Host hat dich aus dem Room geworfen.</p>
      </main>
    );
  }

  if (!roomState || !participantId) {
    return (
      <main className="room-connecting">
        <span className="brand-logo">🃏</span>
        <p>{status === "closed" ? "Verbindung verloren, versuche erneut…" : "Verbinde…"}</p>
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
      <header className="room-header">
        <div className="brand">
          <span className="brand-logo">🃏</span>
          <h1>Planning Poker</h1>
        </div>
        <button type="button" className="button-secondary" onClick={copyLink}>
          {copied ? "Link kopiert!" : "Link kopieren"}
        </button>
      </header>

      <div className="table-area">
        <div className="table">
          <div className="table-surface">
            {revealed && roomState.evaluation && (
              <div className="evaluation">
                <div className="evaluation-average">Ø {roomState.evaluation.average.toFixed(1)}</div>
                <div className="evaluation-recommendation">
                  🎯 Empfehlung: {roomState.evaluation.recommendedCard}
                </div>
              </div>
            )}
            {isHost && revealed && (
              <button type="button" className="new-round-button" onClick={newRound}>
                Neue Runde
              </button>
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
                  flipDelay={index * 70}
                  onReact={(emoji) => react(participant.id, emoji)}
                  onKick={() => kick(participant.id)}
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
          Nur zuschauen
        </label>
        <CardHand
          selected={self?.vote ?? null}
          disabled={Boolean(self?.isSpectator) || roomState.phase !== "voting"}
          onSelect={vote}
        />
      </footer>

      <ChatPanel messages={chatMessages} selfId={participantId} onSend={sendChat} />
    </main>
  );
}
