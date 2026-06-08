import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const BONUS_READINESS_STATUSES = [
  "unreviewed",
  "ready",
  "missing",
  "ambiguous",
  "untrusted",
  "incomplete",
] as const;

export type BonusReadinessStatus = (typeof BONUS_READINESS_STATUSES)[number];

export type BonusReadinessCategory =
  | "possession"
  | "goal_events"
  | "lineup_home"
  | "lineup_away";

type BonusReadinessDiagnosticsRow = {
  match_id: string;
  possession_ready: boolean;
  possession_skip_reason: string | null;
  scorers_ready: boolean;
  scorers_skip_reason: string | null;
  lineup_home_ready: boolean;
  lineup_home_skip_reason: string | null;
  lineup_away_ready: boolean;
  lineup_away_skip_reason: string | null;
  possession_home_rows: number;
  possession_away_rows: number;
  possession_home_percent: number | string | null;
  possession_away_percent: number | string | null;
  normal_goal_events_count: number;
  official_home_starters_count: number;
  official_away_starters_count: number;
  metadata: unknown;
};

export type BonusReadinessDiagnostics = {
  matchId: string;
  possessionReady: boolean;
  possessionSkipReason: string | null;
  scorersReady: boolean;
  scorersSkipReason: string | null;
  lineupHomeReady: boolean;
  lineupHomeSkipReason: string | null;
  lineupAwayReady: boolean;
  lineupAwaySkipReason: string | null;
  possessionHomeRows: number;
  possessionAwayRows: number;
  possessionHomePercent: number | null;
  possessionAwayPercent: number | null;
  normalGoalEventsCount: number;
  officialHomeStartersCount: number;
  officialAwayStartersCount: number;
  metadata: Record<string, unknown>;
};

export type UpdateBonusReadinessInput = {
  matchId: string;
  category: BonusReadinessCategory;
  status: BonusReadinessStatus;
  notes?: string | null;
  confirmedBy?: string | null;
};

const numericOrNull = (value: number | string | null): number | null => {
  if (value === null) return null;
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const metadataRecord = (metadata: unknown): Record<string, unknown> => {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }

  return {};
};

const normalizeDiagnostics = (
  row: BonusReadinessDiagnosticsRow,
): BonusReadinessDiagnostics => ({
  matchId: row.match_id,
  possessionReady: row.possession_ready,
  possessionSkipReason: row.possession_skip_reason,
  scorersReady: row.scorers_ready,
  scorersSkipReason: row.scorers_skip_reason,
  lineupHomeReady: row.lineup_home_ready,
  lineupHomeSkipReason: row.lineup_home_skip_reason,
  lineupAwayReady: row.lineup_away_ready,
  lineupAwaySkipReason: row.lineup_away_skip_reason,
  possessionHomeRows: row.possession_home_rows,
  possessionAwayRows: row.possession_away_rows,
  possessionHomePercent: numericOrNull(row.possession_home_percent),
  possessionAwayPercent: numericOrNull(row.possession_away_percent),
  normalGoalEventsCount: row.normal_goal_events_count,
  officialHomeStartersCount: row.official_home_starters_count,
  officialAwayStartersCount: row.official_away_starters_count,
  metadata: metadataRecord(row.metadata),
});

export async function getMatchBonusReadiness(
  matchId: string,
): Promise<BonusReadinessDiagnostics | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(
    "get_match_bonus_scoring_readiness",
    { p_match_id: matchId },
  );

  if (error) {
    throw new Error(
      `Unable to load bonus readiness for match ${matchId}: ${error.message}`,
    );
  }

  const row = ((data ?? []) as BonusReadinessDiagnosticsRow[])[0];
  return row ? normalizeDiagnostics(row) : null;
}

export async function getMatchBonusReadinessMap(
  matchIds: string[],
): Promise<Record<string, BonusReadinessDiagnostics>> {
  const entries = await Promise.all(
    matchIds.map(async (matchId) => [matchId, await getMatchBonusReadiness(matchId)] as const),
  );

  return entries.reduce<Record<string, BonusReadinessDiagnostics>>(
    (readinessByMatchId, [matchId, readiness]) => {
      if (readiness) readinessByMatchId[matchId] = readiness;
      return readinessByMatchId;
    },
    {},
  );
}

export async function updateMatchBonusReadiness({
  matchId,
  category,
  status,
  notes,
  confirmedBy,
}: UpdateBonusReadinessInput): Promise<void> {
  const supabase = createAdminClient();
  const args = {
    p_match_id: matchId,
    p_possession_status: category === "possession" ? status : null,
    p_goal_events_status: category === "goal_events" ? status : null,
    p_lineup_home_status: category === "lineup_home" ? status : null,
    p_lineup_away_status: category === "lineup_away" ? status : null,
    p_possession_notes: category === "possession" ? notes ?? null : null,
    p_goal_events_notes: category === "goal_events" ? notes ?? null : null,
    p_lineup_home_notes: category === "lineup_home" ? notes ?? null : null,
    p_lineup_away_notes: category === "lineup_away" ? notes ?? null : null,
    p_confirmed_by: confirmedBy ?? null,
    p_metadata: {
      phase: "5C.1",
      source: "admin_match_bonus_readiness_panel",
      updated_category: category,
    },
  };

  const { error } = await supabase.rpc("set_match_bonus_scoring_readiness", args);

  if (error) {
    throw new Error(
      `Unable to update bonus readiness for match ${matchId}: ${error.message}`,
    );
  }
}
