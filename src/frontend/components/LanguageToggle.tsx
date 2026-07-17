import { useTranslation } from "react-i18next";
import { useLocale } from "../i18n/useLocale";

export function LanguageToggle() {
  const { t } = useTranslation();
  const { language, setLanguage } = useLocale();
  const next = language === "de" ? "en" : "de";

  return (
    <button
      type="button"
      className="language-toggle"
      title={next === "en" ? t("languageToggle.switchToEnglish") : t("languageToggle.switchToGerman")}
      onClick={() => setLanguage(next)}
    >
      {language === "de" ? "DE" : "EN"}
    </button>
  );
}
