import { describe, expect, test } from "bun:test";
import { linkHref, linkify } from "./linkify";

describe("linkify", () => {
  test("returns a single text token when there is no URL", () => {
    expect(linkify("hey team, ready?")).toEqual([{ type: "text", value: "hey team, ready?" }]);
  });

  test("splits out an https URL in the middle of a sentence", () => {
    expect(linkify("see https://example.com/foo for details")).toEqual([
      { type: "text", value: "see " },
      { type: "link", value: "https://example.com/foo" },
      { type: "text", value: " for details" },
    ]);
  });

  test("recognizes a bare www. link", () => {
    expect(linkify("check www.example.com now")).toEqual([
      { type: "text", value: "check " },
      { type: "link", value: "www.example.com" },
      { type: "text", value: " now" },
    ]);
  });

  test("handles a message that is only a URL", () => {
    expect(linkify("https://example.com")).toEqual([{ type: "link", value: "https://example.com" }]);
  });

  test("does not linkify a bare domain without a scheme or www. prefix", () => {
    expect(linkify("a.com/x b.com/y")).toEqual([{ type: "text", value: "a.com/x b.com/y" }]);
  });

  test("handles multiple URLs in one message", () => {
    expect(linkify("https://a.com/x and https://b.com/y")).toEqual([
      { type: "link", value: "https://a.com/x" },
      { type: "text", value: " and " },
      { type: "link", value: "https://b.com/y" },
    ]);
  });

  test("returns an empty array for empty input", () => {
    expect(linkify("")).toEqual([]);
  });
});

describe("linkHref", () => {
  test("passes through an already-schemed URL", () => {
    expect(linkHref("https://example.com")).toBe("https://example.com");
  });

  test("adds https:// to a bare www. link", () => {
    expect(linkHref("www.example.com")).toBe("https://www.example.com");
  });
});
