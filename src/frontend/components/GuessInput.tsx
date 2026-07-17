import { useState } from "react";
import { useTranslation } from "react-i18next";

interface GuessInputProps {
  value: number | null;
  onSubmit: (value: number) => void;
}

export function GuessInput({ value, onSubmit }: GuessInputProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");

  if (value !== null) {
    return (
      <div className="guess-input guess-input-locked">
        <span>{t("guessInput.lockedIn", { value })}</span>
      </div>
    );
  }

  function submit() {
    const parsed = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(parsed)) return;
    onSubmit(parsed);
  }

  return (
    <form
      className="guess-input"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        type="number"
        step="any"
        inputMode="decimal"
        placeholder={t("guessInput.placeholder")}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="guess-input-field"
      />
      <button type="submit" className="guess-input-submit">
        {t("guessInput.submitButton")}
      </button>
    </form>
  );
}
