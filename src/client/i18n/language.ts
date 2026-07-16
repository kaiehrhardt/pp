export const LANG_STORAGE_KEY = "pp:lang";
export type Lang = "de" | "en";
export const SUPPORTED_LANGUAGES: readonly Lang[] = ["de", "en"];

export function isSupportedLanguage(value: string | null): value is Lang {
  return value === "de" || value === "en";
}

export function detectLanguage(navigatorLanguage: string | undefined | null): Lang {
  return navigatorLanguage?.toLowerCase().startsWith("en") ? "en" : "de";
}

export function resolveInitialLanguage(
  storedValue: string | null,
  navigatorLanguage: string | undefined | null,
): Lang {
  if (isSupportedLanguage(storedValue)) return storedValue;
  return detectLanguage(navigatorLanguage);
}

export function formatAverage(value: number, language: Lang): string {
  return new Intl.NumberFormat(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
}
