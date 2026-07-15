export interface ChangelogEntry {
  text: string;
}

export interface ChangelogCategory {
  title: string;
  entries: ChangelogEntry[];
}

export interface ChangelogVersion {
  version: string;
  date: string | null;
  categories: ChangelogCategory[];
}

function cleanEntry(line: string): string {
  let text = line.replace(/^\*\s+/, "");

  while (/\(\[[^\]]+\]\([^)]*\)\)\s*$/.test(text)) {
    text = text.replace(/\s*\(\[[^\]]+\]\([^)]*\)\)\s*$/, "");
  }

  return text.replace(/\*\*(.+?)\*\*/g, "$1").trim();
}

export function parseChangelog(markdown: string): ChangelogVersion[] {
  const versions: ChangelogVersion[] = [];
  let currentVersion: ChangelogVersion | null = null;
  let currentCategory: ChangelogCategory | null = null;

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();

    // The very first release semantic-release ever cuts has no prior tag to
    // compare against, so it gets a plain "# x.y.z (date)" H1 instead of the
    // "## [x.y.z](compare-link) (date)" H2 every later release uses. Requiring
    // the trailing date also keeps this from matching a generic "# Changelog"
    // title line, which has no date.
    const versionMatch = line.match(/^#{1,2}\s+\[?([^\]\s(]+)\]?(?:\([^)]*\))?\s*\((\d{4}-\d{2}-\d{2})\)/);
    if (versionMatch) {
      currentVersion = { version: versionMatch[1]!, date: versionMatch[2] ?? null, categories: [] };
      versions.push(currentVersion);
      currentCategory = null;
      continue;
    }

    if (line.startsWith("### ") && currentVersion) {
      currentCategory = { title: line.slice(4).trim(), entries: [] };
      currentVersion.categories.push(currentCategory);
      continue;
    }

    if (line.startsWith("* ") && currentCategory) {
      currentCategory.entries.push({ text: cleanEntry(line) });
    }
  }

  return versions;
}

export async function readChangelog(path: string): Promise<ChangelogVersion[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) return [];
  return parseChangelog(await file.text());
}
