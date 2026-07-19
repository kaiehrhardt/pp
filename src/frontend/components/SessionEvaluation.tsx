import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SessionEvaluation as SessionEvaluationData } from "../../backend/domain/types";
import { useLocale } from "../i18n/useLocale";

interface SessionEvaluationProps {
  stats: SessionEvaluationData | null;
}

export function SessionEvaluation({ stats }: SessionEvaluationProps) {
  const { t } = useTranslation();
  const { formatAverage } = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <div className="session-evaluation-widget">
      <button
        type="button"
        className="session-evaluation-toggle"
        onClick={() => setOpen((current) => !current)}
        title={t("sessionEvaluation.title")}
      >
        📊
      </button>

      {open && (
        <div className="session-evaluation-panel">
          <header className="session-evaluation-panel-header">
            <h2>{t("sessionEvaluation.title")}</h2>
            <button
              type="button"
              className="changelog-close"
              onClick={() => setOpen(false)}
              title={t("sessionEvaluation.close")}
            >
              ✕
            </button>
          </header>

          {stats === null ? (
            <p className="session-evaluation-empty">{t("sessionEvaluation.empty")}</p>
          ) : (
            <dl className="session-evaluation-list">
              <div className="session-evaluation-row">
                <dt>{t("sessionEvaluation.rounds")}</dt>
                <dd>{stats.roundCount}</dd>
              </div>
              {/* average/min/max are only ever null together, exactly when roundCount is 0 — see SessionEvaluation's doc comment. */}
              {stats.roundCount > 0 && (
                <>
                  <div className="session-evaluation-row">
                    <dt>{t("sessionEvaluation.average")}</dt>
                    <dd>{formatAverage(stats.average!)}</dd>
                  </div>
                  <div className="session-evaluation-row">
                    <dt>{t("sessionEvaluation.min")}</dt>
                    <dd>{formatAverage(stats.min!)}</dd>
                  </div>
                  <div className="session-evaluation-row">
                    <dt>{t("sessionEvaluation.max")}</dt>
                    <dd>{formatAverage(stats.max!)}</dd>
                  </div>
                </>
              )}
              <div className="session-evaluation-row">
                <dt>{t("sessionEvaluation.reactionsThrown")}</dt>
                <dd>{stats.reactionsThrown}</dd>
              </div>
              <div className="session-evaluation-row">
                <dt>{t("sessionEvaluation.duelsCompleted")}</dt>
                <dd>{stats.duelsCompleted}</dd>
              </div>
              <div className="session-evaluation-row">
                <dt>{t("sessionEvaluation.trophiesWon")}</dt>
                <dd>{stats.trophiesWon}</dd>
              </div>
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
