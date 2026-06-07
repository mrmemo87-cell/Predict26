import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type MatchResult = "home" | "draw" | "away";
export type PredictionScoringOutcome = "exact" | "result" | "miss";

export const PREDICTION_SCORING_POINTS = {
  exactScore: 5,
  correctResult: 2,
  wrongResult: 0,
} as const;

type ScorePair = {
  homeScore: number;
  awayScore: number;
};

type ScoreFinishedMatchRow = {
  match_id: string;
  predictions_scored: number;
  profiles_updated: number;
  total_points_awarded: number;
};

export type ScoreFinishedMatchResult = {
  matchId: string;
  predictionsScored: number;
  profilesUpdated: number;
  totalPointsAwarded: number;
};

export function getMatchResult({ homeScore, awayScore }: ScorePair): MatchResult {
  if (homeScore > awayScore) return "home";
  if (homeScore < awayScore) return "away";
  return "draw";
}

export function calculatePredictionScore(prediction: ScorePair, actual: ScorePair): {
  outcome: PredictionScoringOutcome;
  points: number;
} {
  if (prediction.homeScore === actual.homeScore && prediction.awayScore === actual.awayScore) {
    return { outcome: "exact", points: PREDICTION_SCORING_POINTS.exactScore };
  }

  if (getMatchResult(prediction) === getMatchResult(actual)) {
    return { outcome: "result", points: PREDICTION_SCORING_POINTS.correctResult };
  }

  return { outcome: "miss", points: PREDICTION_SCORING_POINTS.wrongResult };
}

export async function scoreFinishedMatch(matchId: string): Promise<ScoreFinishedMatchResult> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("score_finished_match", {
    p_match_id: matchId,
  });

  if (error) {
    throw new Error(`Unable to score finished match ${matchId}: ${error.message}`);
  }

  const rows = (data ?? []) as ScoreFinishedMatchRow[];
  const row = rows[0];

  if (!row) {
    return {
      matchId,
      predictionsScored: 0,
      profilesUpdated: 0,
      totalPointsAwarded: 0,
    };
  }

  return {
    matchId: row.match_id,
    predictionsScored: row.predictions_scored,
    profilesUpdated: row.profiles_updated,
    totalPointsAwarded: row.total_points_awarded,
  };
}
