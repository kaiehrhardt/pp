import { useCallback, useEffect, useRef, useState } from "react";
import type { Card, ChatMessage } from "../server/domain/types";
import type { ClientMessage, RoomStateDTO, ServerMessage } from "../server/ws/protocol";

export interface JoinInfo {
  name: string;
  isSpectator: boolean;
}

export interface ReactionEvent {
  id: string;
  from: string;
  to: string;
  emoji: string;
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
  const socketRef = useRef<WebSocket | null>(null);
  const kickedRef = useRef(false);

  useEffect(() => {
    const hasToken = Boolean(localStorage.getItem(tokenKey(roomId)));
    if (!hasToken && !join) return;

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      const params = new URLSearchParams({ roomId });
      const token = localStorage.getItem(tokenKey(roomId));
      if (token) {
        params.set("token", token);
      } else if (join) {
        params.set("name", join.name);
        params.set("spectator", String(join.isSpectator));
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
    vote: useCallback((card: Card) => send({ type: "vote", card }), [send]),
    toggleSpectator: useCallback(() => send({ type: "toggleSpectator" }), [send]),
    newRound: useCallback(() => send({ type: "newRound" }), [send]),
    react: useCallback((to: string, emoji: string) => send({ type: "reaction", to, emoji }), [send]),
    kick: useCallback((participantId: string) => send({ type: "kick", participantId }), [send]),
    sendChat: useCallback((text: string) => send({ type: "chat", text }), [send]),
  };
}
