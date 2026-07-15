import { useEffect, useState } from "react";

export function VersionBadge() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/version")
      .then((res) => res.json())
      .then((body: { version: string }) => {
        if (!cancelled) setVersion(body.version);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!version) return null;

  return <span className="version-badge">v{version}</span>;
}
