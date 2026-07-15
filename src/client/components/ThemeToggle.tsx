import { useState } from "react";

export function ThemeToggle() {
  const [showError, setShowError] = useState(false);

  return (
    <>
      <button
        type="button"
        className="theme-toggle"
        title="Zu Lightmode wechseln"
        onClick={() => setShowError(true)}
      >
        ☀️
      </button>

      {showError && (
        <div className="no-light-overlay" onClick={() => setShowError(false)}>
          <div className="no-light-modal" onClick={(e) => e.stopPropagation()}>
            <span className="no-light-emoji">😉</span>
            <h2>Netter Versuch.</h2>
            <p>Einen Lightmode gibt es hier nicht — und wird es auch nie geben.</p>
            <button type="button" className="button-primary" onClick={() => setShowError(false)}>
              Verstanden
            </button>
          </div>
        </div>
      )}
    </>
  );
}
