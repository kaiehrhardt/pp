import { useEffect, useState } from "react";
import { ChangelogModal } from "./ChangelogModal";

export function VersionBadge() {
  const [version, setVersion] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

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

  return (
    <>
      <button type="button" className="version-badge" onClick={() => setOpen(true)}>
        v{version}
      </button>
      {open && <ChangelogModal onClose={() => setOpen(false)} />}
    </>
  );
}
