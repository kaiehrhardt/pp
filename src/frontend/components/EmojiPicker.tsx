import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EMOJIS } from "../emojis";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [onClose]);

  const query = filter.trim().toLowerCase();
  const results = query
    ? EMOJIS.filter((e) => e.keywords.includes(query) || e.emoji === query)
    : EMOJIS;

  return (
    <div className="emoji-picker" ref={rootRef} onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        type="text"
        placeholder={t("emojiPicker.searchPlaceholder")}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="emoji-picker-search"
      />
      <div className="emoji-picker-grid">
        {results.map((e) => (
          <button
            key={e.emoji}
            type="button"
            className="emoji-picker-item"
            title={e.keywords}
            onClick={() => onSelect(e.emoji)}
          >
            {e.emoji}
          </button>
        ))}
        {results.length === 0 && <p className="emoji-picker-empty">{t("emojiPicker.noResults")}</p>}
      </div>
    </div>
  );
}
