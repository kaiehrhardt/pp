import { useState } from "react";
import { useTranslation } from "react-i18next";

export function ThemeToggle() {
  const { t } = useTranslation();
  const [showError, setShowError] = useState(false);

  return (
    <>
      <button
        type="button"
        className="theme-toggle"
        title={t("themeToggle.buttonTitle")}
        onClick={() => setShowError(true)}
      >
        ☀️
      </button>

      {showError && (
        <div className="no-light-overlay" onClick={() => setShowError(false)}>
          <div className="no-light-modal" onClick={(e) => e.stopPropagation()}>
            <span className="no-light-emoji">😉</span>
            <h2>{t("themeToggle.modalTitle")}</h2>
            <p>{t("themeToggle.modalBody")}</p>
            <button type="button" className="button-primary" onClick={() => setShowError(false)}>
              {t("themeToggle.modalConfirm")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
