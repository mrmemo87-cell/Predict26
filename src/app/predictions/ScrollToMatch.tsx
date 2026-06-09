"use client";

import { useEffect } from "react";

export default function ScrollToMatch({ matchId }: { matchId?: string }) {
  useEffect(() => {
    if (!matchId) return;

    const target = document.getElementById(`match-${matchId}`);
    if (!target) return;

    const timeout = window.setTimeout(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.classList.add("predict26-match-focus");
      window.setTimeout(() => {
        target.classList.remove("predict26-match-focus");
      }, 1800);
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [matchId]);

  return null;
}
