export const KICKOFF_FALLBACK = "Kickoff time coming soon";
export const DEFAULT_TIME_ZONE = "UTC";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export type CountdownStatus = "upcoming" | "live" | "closed" | "finished" | "missing";

export type CountdownResult = {
  status: CountdownStatus;
  label: string;
  durationLabel: string | null;
  millisecondsRemaining: number;
};

export function parseKickoffDate(kickoffAt: string | null | undefined): Date | null {
  if (!kickoffAt) return null;

  const date = new Date(kickoffAt);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

export function getUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function getShortTimeZoneLabel(timeZone = getUserTimeZone(), date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone,
      timeZoneName: "shortOffset",
      hour: "numeric",
    }).formatToParts(date);
    return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function formatLocalMatchTime(
  kickoffAt: string | null | undefined,
  options: { label?: string | null; compact?: boolean; timeZone?: string } = {},
): string {
  const date = parseKickoffDate(kickoffAt);
  if (!date) return KICKOFF_FALLBACK;

  const timeZone = options.timeZone ?? getUserTimeZone();
  const formatted = new Intl.DateTimeFormat("en", {
    timeZone,
    weekday: options.compact ? undefined : "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);

  return options.label ? `${options.label}: ${formatted}` : formatted;
}

export function formatUtcMatchTime(kickoffAt: string | null | undefined): string {
  const date = parseKickoffDate(kickoffAt);
  if (!date) return KICKOFF_FALLBACK;

  return new Intl.DateTimeFormat("en", {
    timeZone: DEFAULT_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
    timeZoneName: "short",
  }).format(date);
}

export function isFinishedMatchStatus(status: string | null | undefined): boolean {
  const normalized = (status ?? "").toLowerCase();
  return ["finished", "completed", "full_time", "ft", "scored"].includes(normalized);
}

export function isLiveMatchStatus(status: string | null | undefined): boolean {
  const normalized = (status ?? "").toLowerCase();
  return ["live", "in_progress", "first_half", "second_half", "halftime", "ht"].includes(normalized);
}

export function formatCountdownDuration(milliseconds: number): string {
  const safeMs = Math.max(0, milliseconds);
  const days = Math.floor(safeMs / DAY_MS);
  const hours = Math.floor((safeMs % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((safeMs % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((safeMs % MINUTE_MS) / 1000);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  return `${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

export function getMatchCountdown(
  kickoffAt: string | null | undefined,
  options: {
    now?: number;
    status?: string | null;
    prefix?: string;
    closedLabel?: string;
    finishedLabel?: string;
    liveLabel?: string;
  } = {},
): CountdownResult {
  const finishedLabel = options.finishedLabel ?? "Match finished";
  if (isFinishedMatchStatus(options.status)) {
    return {
      status: "finished",
      label: finishedLabel,
      durationLabel: null,
      millisecondsRemaining: 0,
    };
  }

  const date = parseKickoffDate(kickoffAt);
  if (!date) {
    return {
      status: "missing",
      label: KICKOFF_FALLBACK,
      durationLabel: null,
      millisecondsRemaining: 0,
    };
  }

  const diff = Math.max(0, date.getTime() - (options.now ?? Date.now()));

  if (diff > 0) {
    const durationLabel = formatCountdownDuration(diff);
    return {
      status: "upcoming",
      label: `${options.prefix ?? "Kickoff in"} ${durationLabel}`,
      durationLabel,
      millisecondsRemaining: diff,
    };
  }

  const label = isLiveMatchStatus(options.status)
    ? (options.liveLabel ?? "Live now")
    : (options.closedLabel ?? "Prediction closed");

  return {
    status: isLiveMatchStatus(options.status) ? "live" : "closed",
    label,
    durationLabel: null,
    millisecondsRemaining: 0,
  };
}

export function getCountdownIntervalMs(millisecondsRemaining: number, preferMinute = false): number {
  if (preferMinute && millisecondsRemaining > HOUR_MS) return MINUTE_MS;
  if (millisecondsRemaining > HOUR_MS) return MINUTE_MS;
  return 1000;
}
