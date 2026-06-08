import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const CHAMPION_PICK_POINTS = {
  A: 20,
  B: 15,
} as const;

type ScoreTournamentChampionRow = {
  competition_code: string;
  champion_team_code: string | null;
  picks_evaluated: number;
  ledger_rows_upserted: number;
  stale_ledger_rows_voided: number;
  profiles_updated: number;
  leaderboards_upserted: number;
  total_points_awarded: number;
};

export type ScoreTournamentChampionResult = {
  competitionCode: string;
  championTeamCode: string | null;
  picksEvaluated: number;
  ledgerRowsUpserted: number;
  staleLedgerRowsVoided: number;
  profilesUpdated: number;
  leaderboardsUpserted: number;
  totalPointsAwarded: number;
};

export async function scoreTournamentChampion({
  competitionCode = "WC2026",
  triggeredBy = null,
}: {
  competitionCode?: string;
  triggeredBy?: string | null;
} = {}): Promise<ScoreTournamentChampionResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("score_tournament_champion", {
    p_competition_code: competitionCode,
    p_triggered_by: triggeredBy,
  });

  if (error) {
    throw new Error(
      `Unable to score Champion picks for ${competitionCode}: ${error.message}`,
    );
  }

  const row = ((data ?? []) as ScoreTournamentChampionRow[])[0];

  if (!row) {
    return {
      competitionCode,
      championTeamCode: null,
      picksEvaluated: 0,
      ledgerRowsUpserted: 0,
      staleLedgerRowsVoided: 0,
      profilesUpdated: 0,
      leaderboardsUpserted: 0,
      totalPointsAwarded: 0,
    };
  }

  return {
    competitionCode: row.competition_code,
    championTeamCode: row.champion_team_code,
    picksEvaluated: row.picks_evaluated,
    ledgerRowsUpserted: row.ledger_rows_upserted,
    staleLedgerRowsVoided: row.stale_ledger_rows_voided,
    profilesUpdated: row.profiles_updated,
    leaderboardsUpserted: row.leaderboards_upserted,
    totalPointsAwarded: row.total_points_awarded,
  };
}
