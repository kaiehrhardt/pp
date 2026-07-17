import { describe, expect, test } from "bun:test";
import { detectLanguage, formatAverage, isSupportedLanguage, resolveInitialLanguage } from "./language";

describe("isSupportedLanguage", () => {
  test("accepts de and en", () => {
    expect(isSupportedLanguage("de")).toBe(true);
    expect(isSupportedLanguage("en")).toBe(true);
  });

  test("rejects unsupported values", () => {
    expect(isSupportedLanguage("fr")).toBe(false);
    expect(isSupportedLanguage(null)).toBe(false);
  });
});

describe("detectLanguage", () => {
  test("detects English from an en-* navigator language", () => {
    expect(detectLanguage("en-US")).toBe("en");
  });

  test("falls back to German for non-English languages", () => {
    expect(detectLanguage("fr-FR")).toBe("de");
  });

  test("falls back to German when navigator language is undefined", () => {
    expect(detectLanguage(undefined)).toBe("de");
  });

  test("falls back to German when navigator language is null", () => {
    expect(detectLanguage(null)).toBe("de");
  });

  test("is case-insensitive", () => {
    expect(detectLanguage("EN-GB")).toBe("en");
  });
});

describe("resolveInitialLanguage", () => {
  test("prefers a stored valid language over detection", () => {
    expect(resolveInitialLanguage("en", "de-DE")).toBe("en");
  });

  test("falls back to detection when nothing is stored", () => {
    expect(resolveInitialLanguage(null, "en-GB")).toBe("en");
  });

  test("ignores an invalid stored value and falls back to detection", () => {
    expect(resolveInitialLanguage("fr", "en-US")).toBe("en");
  });
});

describe("formatAverage", () => {
  test("formats with a period for English", () => {
    expect(formatAverage(4.3, "en")).toBe("4.3");
  });

  test("formats with a comma for German", () => {
    expect(formatAverage(4.3, "de")).toBe("4,3");
  });

  test("always shows exactly one decimal", () => {
    expect(formatAverage(4, "en")).toBe("4.0");
  });
});
