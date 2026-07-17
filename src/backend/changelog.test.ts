import { describe, expect, test } from "bun:test";
import { parseChangelog, readChangelog } from "./changelog";

const SAMPLE = `## [1.4.11](https://github.com/kaiehrhardt/terradot/compare/1.4.10...1.4.11) (2026-07-09)


### Bug Fixes

* **deps:** update dependency @hpcc-js/wasm to v2.34.5 ([#48](https://github.com/kaiehrhardt/terradot/issues/48)) ([88c6493](https://github.com/kaiehrhardt/terradot/commit/88c6493c04acab55fb54130d42c439a068c53836))

## [1.4.0](https://github.com/kaiehrhardt/terradot/compare/1.3.0...1.4.0) (2026-06-01)


### Features

* add zoom controls ([abc1234](https://github.com/kaiehrhardt/terradot/commit/abc1234))

### Bug Fixes

* fix layout jitter ([def5678](https://github.com/kaiehrhardt/terradot/commit/def5678))
`;

describe("parseChangelog", () => {
  test("extracts version and date from the heading", () => {
    const versions = parseChangelog(SAMPLE);
    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({ version: "1.4.11", date: "2026-07-09" });
    expect(versions[1]).toMatchObject({ version: "1.4.0", date: "2026-06-01" });
  });

  test("groups entries under their category", () => {
    const [, minor] = parseChangelog(SAMPLE);
    expect(minor!.categories.map((c) => c.title)).toEqual(["Features", "Bug Fixes"]);
    expect(minor!.categories[0]!.entries).toEqual([{ text: "add zoom controls" }]);
  });

  test("strips bold scope markers and trailing PR/commit links from entries", () => {
    const [latest] = parseChangelog(SAMPLE);
    expect(latest!.categories[0]!.entries).toEqual([
      { text: "deps: update dependency @hpcc-js/wasm to v2.34.5" },
    ]);
  });

  test("returns an empty list for empty input", () => {
    expect(parseChangelog("")).toEqual([]);
  });

  test("ignores a leading title/preamble before the first version heading", () => {
    const withTitle = `# Changelog\n\nAll notable changes...\n\n${SAMPLE}`;
    expect(parseChangelog(withTitle)).toHaveLength(2);
  });

  test("parses the very first release, which uses a dateless-compare H1 instead of an H2", () => {
    const initial = `# 1.0.0 (2026-07-15)


### Features

* initial content ([9365e8e](https://github.com/kaiehrhardt/pp/commit/9365e8e146f93bd17020599f09501ac74cb1d037))
`;
    const versions = parseChangelog(initial);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: "1.0.0", date: "2026-07-15" });
    expect(versions[0]!.categories[0]!.entries).toEqual([{ text: "initial content" }]);
  });

  test("finds both an H1 first release and later H2 releases in the same file", () => {
    const combined = `# 1.0.0 (2026-07-15)


### Features

* initial content ([9365e8e](https://github.com/kaiehrhardt/pp/commit/9365e8e))

${SAMPLE}`;
    const versions = parseChangelog(combined);
    expect(versions.map((v) => v.version)).toEqual(["1.0.0", "1.4.11", "1.4.0"]);
  });
});

describe("readChangelog", () => {
  test("parses an existing file from disk", async () => {
    const versions = await readChangelog(`${import.meta.dir}/../../CHANGELOG.md`);
    expect(versions.length).toBeGreaterThan(0);
  });

  test("returns an empty list when the file does not exist", async () => {
    expect(await readChangelog(`${import.meta.dir}/does-not-exist.md`)).toEqual([]);
  });
});
