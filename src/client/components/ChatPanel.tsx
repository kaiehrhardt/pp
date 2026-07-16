import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../../server/domain/types";
import { linkHref, linkify } from "../linkify";
import { EmojiPicker } from "./EmojiPicker";

interface ChatPanelProps {
  messages: ChatMessage[];
  selfId: string;
  onSend: (text: string) => void;
}

function ChatMessageText({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((token, index) =>
        token.type === "link" ? (
          <a key={index} href={linkHref(token.value)} target="_blank" rel="noopener noreferrer">
            {token.value}
          </a>
        ) : (
          <span key={index}>{token.value}</span>
        ),
      )}
    </>
  );
}

export function ChatPanel({ messages, selfId, onSend }: ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [seenCount, setSeenCount] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setSeenCount(messages.length);
  }, [open, messages.length]);

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  const unread = open ? 0 : messages.length - seenCount;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setDraft("");
  }

  return (
    <div className="chat-widget">
      {open && (
        <div className="chat-panel">
          <header className="chat-panel-header">
            <h2>Chat</h2>
            <button type="button" className="changelog-close" onClick={() => setOpen(false)} title="Schließen">
              ✕
            </button>
          </header>

          <div className="chat-messages" ref={listRef}>
            {messages.length === 0 && <p className="chat-empty">Noch keine Nachrichten.</p>}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`chat-message${message.participantId === selfId ? " chat-message-self" : ""}`}
              >
                <span className="chat-message-author" style={{ color: message.participantColor }}>
                  {message.participantName}
                </span>
                <span className="chat-message-text">
                  <ChatMessageText text={message.text} />
                </span>
              </div>
            ))}
          </div>

          <form className="chat-form" onSubmit={handleSubmit}>
            <div className="chat-emoji-anchor">
              <button
                type="button"
                className="chat-emoji-toggle"
                onClick={() => setPickerOpen((current) => !current)}
                title="Smiley einfügen"
              >
                😊
              </button>
              {pickerOpen && (
                <EmojiPicker
                  onSelect={(emoji) => {
                    setDraft((current) => current + emoji);
                    setPickerOpen(false);
                  }}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </div>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Nachricht…"
              maxLength={500}
            />
            <button type="submit" className="button-primary">
              Senden
            </button>
          </form>
        </div>
      )}

      <button type="button" className="chat-toggle" onClick={() => setOpen((current) => !current)} title="Chat">
        💬
        {unread > 0 && <span className="chat-unread">{unread}</span>}
      </button>
    </div>
  );
}
