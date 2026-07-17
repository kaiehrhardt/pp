import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChangelogVersion } from "../../backend/changelog";

interface ChangelogModalProps {
  onClose: () => void;
}

export function ChangelogModal({ onClose }: ChangelogModalProps) {
  const { t } = useTranslation();
  const [versions, setVersions] = useState<ChangelogVersion[] | null>(null);

  useEffect(() => {
    fetch("/api/changelog")
      .then((res) => res.json())
      .then((body: { versions: ChangelogVersion[] }) => setVersions(body.versions))
      .catch(() => setVersions([]));
  }, []);

  return (
    <div className="changelog-overlay" onClick={onClose}>
      <div className="changelog-modal" onClick={(e) => e.stopPropagation()}>
        <header className="changelog-header">
          <h2>{t("changelogModal.title")}</h2>
          <button type="button" className="changelog-close" onClick={onClose} title={t("changelogModal.close")}>
            ✕
          </button>
        </header>

        <div className="changelog-body">
          {versions === null && <p className="changelog-empty">{t("changelogModal.loading")}</p>}
          {versions?.length === 0 && <p className="changelog-empty">{t("changelogModal.empty")}</p>}
          {versions?.map((version) => (
            <section key={version.version} className="changelog-version">
              <h3>
                {version.version}
                {version.date && <span className="changelog-date"> — {version.date}</span>}
              </h3>
              {version.categories.map((category) => (
                <div key={category.title} className="changelog-category">
                  <h4>{category.title}</h4>
                  <ul>
                    {category.entries.map((entry, index) => (
                      <li key={index}>{entry.text}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
