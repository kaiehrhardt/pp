const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

export interface LinkifyToken {
  type: "text" | "link";
  value: string;
}

export function linkify(text: string): LinkifyToken[] {
  const tokens: LinkifyToken[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) tokens.push({ type: "text", value: text.slice(lastIndex, index) });
    tokens.push({ type: "link", value: match[0] });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) tokens.push({ type: "text", value: text.slice(lastIndex) });

  return tokens;
}

export function linkHref(value: string): string {
  return value.startsWith("www.") ? `https://${value}` : value;
}
