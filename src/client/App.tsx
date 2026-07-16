import { useCallback, useEffect, useState } from "react";
import { Landing } from "./components/Landing";
import { LanguageToggle } from "./components/LanguageToggle";
import { Room } from "./components/Room";
import { ThemeToggle } from "./components/ThemeToggle";
import { VersionBadge } from "./components/VersionBadge";

export function App() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    function onPopState() {
      setPath(window.location.pathname);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((to: string) => {
    window.history.pushState(null, "", to);
    setPath(to);
  }, []);

  const roomMatch = path.match(/^\/room\/([^/]+)$/);

  return (
    <>
      <LanguageToggle />
      <ThemeToggle />
      <VersionBadge />
      {roomMatch?.[1] ? <Room roomId={roomMatch[1]} /> : <Landing navigate={navigate} />}
    </>
  );
}
