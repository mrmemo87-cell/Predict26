"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  getCountdownIntervalMs,
  getMatchCountdown,
  parseKickoffDate,
} from "@/lib/dates/matchTime";

type MatchCountdownProps = {
  kickoffAt: string | null;
  status?: string | null;
  label?: string;
  closedLabel?: string;
  finishedLabel?: string;
  liveLabel?: string;
  updateMode?: "auto" | "second" | "minute";
  className?: string;
};

function getSnapshot() {
  return Date.now();
}

function getServerSnapshot() {
  return 0;
}

export default function MatchCountdown({
  kickoffAt,
  status = null,
  label = "Kickoff in",
  closedLabel,
  finishedLabel,
  liveLabel,
  updateMode = "auto",
  className,
}: MatchCountdownProps) {
  const subscribe = useCallback(
    (callback: () => void) => {
      let timeoutId: number | undefined;

      const schedule = () => {
        const target = parseKickoffDate(kickoffAt)?.getTime() ?? 0;
        const remaining = Math.max(0, target - Date.now());
        const intervalMs =
          updateMode === "second"
            ? 1000
            : updateMode === "minute"
              ? 60 * 1000
              : getCountdownIntervalMs(remaining, true);

        timeoutId = window.setTimeout(() => {
          callback();
          schedule();
        }, intervalMs);
      };

      schedule();
      return () => {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      };
    },
    [kickoffAt, updateMode],
  );
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const snapshot = useMemo(
    () =>
      getMatchCountdown(kickoffAt, {
        now: now || undefined,
        status,
        prefix: label,
        closedLabel,
        finishedLabel,
        liveLabel,
      }),
    [closedLabel, finishedLabel, kickoffAt, label, liveLabel, now, status],
  );

  if (now === 0 && kickoffAt && parseKickoffDate(kickoffAt)) {
    return (
      <span className={className} aria-label="Loading match countdown">
        {label} …
      </span>
    );
  }

  return <span className={className}>{snapshot.label}</span>;
}
