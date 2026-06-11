"use client";

import { useSyncExternalStore } from "react";
import {
  KICKOFF_FALLBACK,
  formatLocalMatchTime,
  getShortTimeZoneLabel,
  getUserTimeZone,
  parseKickoffDate,
} from "@/lib/dates/matchTime";

type MatchLocalTimeProps = {
  kickoffAt: string | null;
  label?: string | null;
  compact?: boolean;
  showTimeZone?: boolean;
  className?: string;
  timeClassName?: string;
  timezoneClassName?: string;
};

function subscribe() {
  return () => undefined;
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

export default function MatchLocalTime({
  kickoffAt,
  label = null,
  compact = false,
  showTimeZone = false,
  className,
  timeClassName,
  timezoneClassName,
}: MatchLocalTimeProps) {
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  if (!kickoffAt || !parseKickoffDate(kickoffAt)) {
    return <span className={className}>{KICKOFF_FALLBACK}</span>;
  }

  if (!mounted) {
    return (
      <span className={className} aria-label="Loading local kickoff time">
        {label ? `${label}: ` : ""}Local time loading…
      </span>
    );
  }

  const timeZone = getUserTimeZone();
  const kickoffDate = parseKickoffDate(kickoffAt);
  const timeText = formatLocalMatchTime(kickoffAt, { label, compact, timeZone });
  const timeZoneText = getShortTimeZoneLabel(timeZone, kickoffDate ?? undefined);

  return (
    <span className={className}>
      <span className={timeClassName}>{timeText}</span>
      {showTimeZone && (
        <span className={timezoneClassName ?? "ml-1 text-current opacity-70"}>
          · {timeZoneText}
        </span>
      )}
    </span>
  );
}
