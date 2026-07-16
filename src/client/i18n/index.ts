import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import de from "./locales/de.json";
import en from "./locales/en.json";
import { LANG_STORAGE_KEY, resolveInitialLanguage } from "./language";

const initialLanguage = resolveInitialLanguage(
  localStorage.getItem(LANG_STORAGE_KEY),
  navigator.language,
);

void i18next.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: initialLanguage,
  fallbackLng: "de",
  interpolation: { escapeValue: false },
  returnNull: false,
});

document.documentElement.lang = initialLanguage;

export { i18next };
