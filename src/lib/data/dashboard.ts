import { createClient } from "@/lib/supabase/server";

type DashboardData = {
  rank: number | null;
  points: number;
  accuracy: number;
  distanceToTop3: number | null;
  distanceToPrizeZone: number | null;
  upcomingMatches: Array<{ id: string; home_team: string; away_team: string; kickoff_at: string }>;
  recentPredictions: Array<{
    id: string;
    choice: string;
    points_awarded: number;
    matches: { home_team: string; away_team: string } | null;
  }>;
};

export const getDashboardData = async (): Promise<DashboardData | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const [{ data: profile }, { data: leaderboardRow }, { data: upcomingMatches }, { data: recentPredictions }] =
    await Promise.all([
      supabase.from("profiles").select("points, accuracy").eq("id", user.id).single(),
      supabase
        .from("leaderboards")
        .select("global_rank, distance_to_top3, distance_to_prize_zone")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("matches")
        .select("id, home_team, away_team, kickoff_at")
        .eq("status", "scheduled")
        .order("kickoff_at", { ascending: true })
        .limit(5),
      supabase
        .from("predictions")
        .select("id, choice, points_awarded, matches(home_team, away_team)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const normalizedPredictions =
    recentPredictions?.map((prediction) => ({
      id: prediction.id,
      choice: prediction.choice,
      points_awarded: prediction.points_awarded,
      matches: Array.isArray(prediction.matches) ? (prediction.matches[0] ?? null) : prediction.matches,
    })) ?? [];

  return {
    rank: leaderboardRow?.global_rank ?? null,
    points: profile?.points ?? 0,
    accuracy: profile?.accuracy ?? 0,
    distanceToTop3: leaderboardRow?.distance_to_top3 ?? null,
    distanceToPrizeZone: leaderboardRow?.distance_to_prize_zone ?? null,
    upcomingMatches: upcomingMatches ?? [],
    recentPredictions: normalizedPredictions,
  };
};
