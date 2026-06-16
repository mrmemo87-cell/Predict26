export type MatchStatusInput = {
  status?: string | null;
  kickoff_at?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  sync_state_status?: string | null;
  userPrediction?: {
    home_score?: number | null;
    away_score?: number | null;
  } | null;
};

export type MatchOperationalStatus = {
  rawStatus: string;
  hasKickoffPassed: boolean;
  exactPredictionOpen: boolean;
  lineupPredictionOpen: boolean;
  isAwaitingFinalData: boolean;
  isExactScored: boolean;
  isBonusPending: boolean;
  isFullyScored: boolean;
  userHasPrediction: boolean;
  operationalStatus: string;
  userStatusLabel: string;
  countdownMs: number | null;
  urgency: "neutral" | "soon" | "urgent" | "closed";
};

export function getMatchOperationalStatus(
  match: MatchStatusInput,
  now: Date = new Date(),
): MatchOperationalStatus {
  const rawStatus = (match.status ?? "scheduled").toLowerCase();
  const kickoff = match.kickoff_at ? new Date(match.kickoff_at) : null;
  const countdownMs = kickoff ? kickoff.getTime() - now.getTime() : null;
  const hasKickoffPassed =
    countdownMs !== null ? countdownMs <= 0 : rawStatus !== "scheduled";
  const exactPredictionOpen = rawStatus === "scheduled" && !hasKickoffPassed;
  const lineupPredictionOpen =
    rawStatus === "scheduled" &&
    countdownMs !== null &&
    countdownMs > 120 * 60_000;
  const hasFinalScore =
    rawStatus === "finished" &&
    match.home_score !== null &&
    match.away_score !== null;
  const syncStatus = (match.sync_state_status ?? "").toLowerCase();
  const isFullyScored = syncStatus === "fully_scored";
  const isBonusPending =
    hasFinalScore &&
    (syncStatus === "bonus_pending" ||
      (syncStatus !== "fully_scored" && syncStatus !== ""));
  const isExactScored =
    hasFinalScore ||
    ["exact_scored", "bonus_pending", "fully_scored"].includes(syncStatus);
  const isAwaitingFinalData =
    hasKickoffPassed && !hasFinalScore && !isFullyScored;
  const userHasPrediction = Boolean(
    match.userPrediction &&
    match.userPrediction.home_score !== null &&
    match.userPrediction.away_score !== null,
  );

  let operationalStatus = "Upcoming";
  if (!userHasPrediction && exactPredictionOpen)
    operationalStatus = "Needs prediction";
  else if (isFullyScored) operationalStatus = "Fully scored";
  else if (isBonusPending) operationalStatus = "Bonus pending";
  else if (isExactScored) operationalStatus = "Final score added";
  else if (isAwaitingFinalData) operationalStatus = "Awaiting final data";
  else if (!exactPredictionOpen && hasKickoffPassed)
    operationalStatus = "Locked";
  else if (rawStatus === "finished") operationalStatus = "Finished";

  let userStatusLabel = userHasPrediction ? "Saved" : "Not predicted";
  if (!exactPredictionOpen && !isExactScored)
    userStatusLabel = userHasPrediction ? "Locked" : "Prediction closed";
  if (isFullyScored) userStatusLabel = "Scored";
  else if (isBonusPending) userStatusLabel = "Bonus pending";

  const urgency = !exactPredictionOpen
    ? "closed"
    : countdownMs !== null && countdownMs <= 60 * 60_000
      ? "urgent"
      : countdownMs !== null && countdownMs <= 6 * 60 * 60_000
        ? "soon"
        : "neutral";

  return {
    rawStatus,
    hasKickoffPassed,
    exactPredictionOpen,
    lineupPredictionOpen,
    isAwaitingFinalData,
    isExactScored,
    isBonusPending,
    isFullyScored,
    userHasPrediction,
    operationalStatus,
    userStatusLabel,
    countdownMs,
    urgency,
  };
}

export function formatCountdown(milliseconds: number | null): string {
  if (milliseconds === null) return "Kickoff TBA";
  if (milliseconds <= 0) return "Locked";
  const totalMinutes = Math.ceil(milliseconds / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function statusChipClass(
  urgency: MatchOperationalStatus["urgency"],
): string {
  if (urgency === "urgent") return "border-red-200 bg-red-50 text-red-700";
  if (urgency === "soon") return "border-amber-200 bg-amber-50 text-amber-800";
  if (urgency === "closed") return "border-gray-200 bg-gray-100 text-gray-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}
