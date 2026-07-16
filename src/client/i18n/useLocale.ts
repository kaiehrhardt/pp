import { useTranslation } from "react-i18next";
import { formatAverage as formatAverageValue, LANG_STORAGE_KEY, type Lang } from "./language";

export function useLocale() {
  const { i18n } = useTranslation();
  const language = i18n.language as Lang;

  function setLanguage(next: Lang) {
    void i18n.changeLanguage(next);
    localStorage.setItem(LANG_STORAGE_KEY, next);
    document.documentElement.lang = next;
  }

  function formatAverage(value: number): string {
    return formatAverageValue(value, language);
  }

  return { language, setLanguage, formatAverage };
}
