import { useCallback, useEffect, useRef, useState } from "react";
import type { Card, ChatMessage, RpsMove } from "../backend/domain/types";
import type { ClientMessage, RoomStateDTO, ServerMessage } from "../backend/ws/protocol";

export interface JoinInfo {
  name: string;
  isSpectator: boolean;
  avatar: string;
}

export interface ReactionEvent {
  id: string;
  from: string;
  to: string;
  emoji: string;
}

export interface DuelInvite {
  duelId: string;
  from: string;
}

export interface DuelPending {
  duelId: string;
  to: string;
}

export interface ActiveDuel {
  duelId: string;
  opponentId: string;
  round: number;
  yourScore: number;
  opponentScore: number;
  bestOf: number;
}

export interface DuelResult {
  duelId: string;
  opponentId: string;
  yourMove: RpsMove;
  opponentMove: RpsMove;
  outcome: "win" | "lose" | "draw";
  yourScore: number;
  opponentScore: number;
  bestOf: number;
  matchOver: boolean;
}

type Status = "connecting" | "open" | "closed";

export function tokenKey(roomId: string): string {
  return `pp:token:${roomId}`;
}

export function useRoomSocket(roomId: string, join: JoinInfo | null) {
  const [status, setStatus] = useState<Status>("connecting");
  const [roomState, setRoomState] = useState<RoomStateDTO | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [kicked, setKicked] = useState(false);
  const [roomFull, setRoomFull] = useState(false);
  const [duelInvite, setDuelInvite] = useState<DuelInvite | null>(null);
  const [duelPending, setDuelPending] = useState<DuelPending | null>(null);
  const [activeDuel, setActiveDuel] = useState<ActiveDuel | null>(null);
  const [duelResult, setDuelResult] = useState<DuelResult | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const kickedRef = useRef(false);

  useEffect(() => {
    const hasToken = Boolean(localStorage.getItem(tokenKey(roomId)));
    if (!hasToken && !join) return;

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    async function connect() {
      const params = new URLSearchParams({ roomId });
      const token = localStorage.getItem(tokenKey(roomId));
      if (token) {
        params.set("token", token);
      } else if (join) {
        const res = await fetch(`/api/rooms/${roomId}`).catch(() => null);
        if (cancelled) return;
        if (res?.ok) {
          const body: { full: boolean } = await res.json();
          if (body.full) {
            setRoomFull(true);
            return;
          }
        }
        params.set("name", join.name);
        params.set("spectator", String(join.isSpectator));
        params.set("avatar", join.avatar);
      }

      const protocol = location.protocol === "https:" ? "wss" : "ws";
      const socket = new WebSocket(`${protocol}://${location.host}/ws?${params.toString()}`);
      socketRef.current = socket;
      setStatus("connecting");

      socket.onopen = () => {
        if (!cancelled) setStatus("open");
      };

      socket.onmessage = (event) => {
        if (cancelled) return;
        const message: ServerMessage = JSON.parse(event.data);
        if (message.type === "joined") {
          localStorage.setItem(tokenKey(roomId), message.token);
          setParticipantId(message.participantId);
        } else if (message.type === "roomState") {
          setRoomState(message.room);
        } else if (message.type === "reaction") {
          const id = `${Date.now()}-${Math.random()}`;
          setReactions((current) => [...current, { id, from: message.from, to: message.to, emoji: message.emoji }]);
          setTimeout(() => {
            setReactions((current) => current.filter((r) => r.id !== id));
          }, 1500);
        } else if (message.type === "kicked") {
          kickedRef.current = true;
          localStorage.removeItem(tokenKey(roomId));
          setKicked(true);
        } else if (message.type === "chatHistory") {
          setChatMessages(message.messages);
        } else if (message.type === "chatMessage") {
          setChatMessages((current) => [...current, message.message]);
        } else if (message.type === "duelChallenge") {
          setDuelInvite({ duelId: message.duelId, from: message.from });
        } else if (message.type === "duelPending") {
          setDuelPending({ duelId: message.duelId, to: message.to });
        } else if (message.type === "duelDeclined" || message.type === "duelCancelled") {
          setDuelPending((current) => (current?.duelId === message.duelId ? null : current));
          setDuelInvite((current) => (current?.duelId === message.duelId ? null : current));
          setActiveDuel((current) => (current?.duelId === message.duelId ? null : current));
        } else if (message.type === "duelStarted") {
          setDuelInvite(null);
          setDuelPending(null);
          setActiveDuel({
            duelId: message.duelId,
            opponentId: message.opponentId,
            round: 0,
            yourScore: 0,
            opponentScore: 0,
            bestOf: message.bestOf,
          });
        } else if (message.type === "duelResult") {
          const result: DuelResult = {
            duelId: message.duelId,
            opponentId: message.opponentId,
            yourMove: message.yourMove,
            opponentMove: message.opponentMove,
            outcome: message.outcome,
            yourScore: message.yourScore,
            opponentScore: message.opponentScore,
            bestOf: message.bestOf,
            matchOver: message.matchOver,
          };
          setDuelResult(result);
          if (message.matchOver) {
            setActiveDuel(null);
            setTimeout(() => {
              setDuelResult((current) => (current === result ? null : current));
            }, 4000);
          } else {
            setActiveDuel({
              duelId: message.duelId,
              opponentId: message.opponentId,
              round: message.round,
              yourScore: message.yourScore,
              opponentScore: message.opponentScore,
              bestOf: message.bestOf,
            });
            setTimeout(() => {
              setDuelResult((current) => (current === result ? null : current));
            }, 1800);
          }
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        setStatus("closed");
        if (kickedRef.current) return;
        reconnectTimer = setTimeout(connect, 1500);
      };
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, [roomId, join]);

  const send = useCallback((message: ClientMessage) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }, []);

  return {
    status,
    roomState,
    participantId,
    reactions,
    chatMessages,
    kicked,
    roomFull,
    duelInvite,
    duelPending,
    activeDuel,
    duelResult,
    vote: useCallback((card: Card) => send({ type: "vote", card }), [send]),
    toggleSpectator: useCallback(() => send({ type: "toggleSpectator" }), [send]),
    newRound: useCallback(() => send({ type: "newRound" }), [send]),
    react: useCallback((to: string, emoji: string) => send({ type: "reaction", to, emoji }), [send]),
    kick: useCallback((participantId: string) => send({ type: "kick", participantId }), [send]),
    sendChat: useCallback((text: string) => send({ type: "chat", text }), [send]),
    guessAverage: useCallback((value: number) => send({ type: "guessAverage", value }), [send]),
    setAvatar: useCallback((avatar: string) => send({ type: "setAvatar", avatar }), [send]),
    challengeToRps: useCallback((opponentId: string) => send({ type: "duelChallenge", opponentId }), [send]),
    respondToRps: useCallback(
      (duelId: string, accept: boolean) => {
        if (!accept) setDuelInvite((current) => (current?.duelId === duelId ? null : current));
        send({ type: "duelRespond", duelId, accept });
      },
      [send],
    ),
    submitRpsMove: useCallback((duelId: string, move: RpsMove) => send({ type: "duelMove", duelId, move }), [send]),
    cancelRpsChallenge: useCallback(
      (duelId: string) => {
        setDuelPending((current) => (current?.duelId === duelId ? null : current));
        send({ type: "duelCancel", duelId });
      },
      [send],
    ),
  };
}
