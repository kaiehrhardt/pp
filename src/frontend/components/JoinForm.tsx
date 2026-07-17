import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { JoinInfo } from "../useRoomSocket";
import { EmojiPicker } from "./EmojiPicker";

const DEFAULT_AVATAR = "🙂";

interface JoinFormProps {
  onSubmit: (info: JoinInfo) => void;
}

export function JoinForm({ onSubmit }: JoinFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [isSpectator, setIsSpectator] = useState(false);
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR);
  const [pickerOpen, setPickerOpen] = useState(false);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, isSpectator, avatar });
  }

  return (
    <main className="landing">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-logo">🃏</span>
          <h1>Planning Poker</h1>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="join-form-avatar">
            <span className="join-form-avatar-label">{t("joinForm.avatarLabel")}</span>
            <div className="join-form-avatar-anchor">
              <button
                type="button"
                className="join-form-avatar-button"
                onClick={() => setPickerOpen((open) => !open)}
                title={t("joinForm.avatarLabel")}
              >
                {avatar}
              </button>
              {pickerOpen && (
                <EmojiPicker
                  onSelect={(emoji) => {
                    setAvatar(emoji);
                    setPickerOpen(false);
                  }}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </div>
          </div>
          <label>
            {t("joinForm.nameLabel")}
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              required
              placeholder={t("joinForm.namePlaceholder")}
            />
          </label>
          <label className="join-form-checkbox">
            <input
              type="checkbox"
              checked={isSpectator}
              onChange={(e) => setIsSpectator(e.target.checked)}
            />
            {t("joinForm.spectatorLabel")}
          </label>
          <button type="submit" className="button-primary">
            {t("joinForm.submitButton")}
          </button>
        </form>
      </div>
    </main>
  );
}
