import { createClient } from "@/lib/supabase/server";
import { WORLD_CUP_SLUG } from "@/lib/domain/constants";

export type UpcomingPredictionMatch = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string | null;
  stage: string | null;
  status: string;
  venue: string | null;
  home_country_code: string | null;
  away_country_code: string | null;
  home_score: number | null;
  away_score: number | null;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type RawMatchRow = {
  id?: string;
  home_team_name?: string | null;
  away_team_name?: string | null;
  home_country_code?: string | null;
  away_country_code?: string | null;
  home_team_code?: string | null;
  away_team_code?: string | null;
  kickoff_at?: string | null;
  stage?: string | null;
  group_name?: string | null;
  status?: string | null;
  venue?: string | null;
  home_score?: number | null;
  away_score?: number | null;
};

const normalizeMatch = (match: RawMatchRow): UpcomingPredictionMatch => ({
  id: match.id ?? "",
  home_team: match.home_team_name || "Team TBA",
  away_team: match.away_team_name || "Team TBA",
  kickoff_at: match.kickoff_at || null,
  stage: match.stage || match.group_name || null,
  status: match.status ?? "scheduled",
  venue: match.venue ?? null,
  home_country_code: match.home_country_code || match.home_team_code || null,
  away_country_code: match.away_country_code || match.away_team_code || null,
  home_score: match.home_score ?? null,
  away_score: match.away_score ?? null,
});

export function isPredictableMatchStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "scheduled" || s === "upcoming";
}

async function getCompetitionId(supabase: SupabaseServerClient): Promise<string | null> {
  const { data } = await supabase
    .from("competitions")
    .select("id")
    .eq("slug", WORLD_CUP_SLUG)
    .maybeSingle();

  return data?.id ?? null;
}

export async function fetchUpcomingPredictionMatches(
  supabase: SupabaseServerClient,
  limit = 20,
): Promise<UpcomingPredictionMatch[]> {
  const competitionId = await getCompetitionId(supabase);

  // Try fetching with competition filter first
  const selectColumns =
    "id, home_team_name, away_team_name, home_country_code, away_country_code, home_team_code, away_team_code, kickoff_at, stage, group_name, status, venue, home_score, away_score";

  if (competitionId) {
    const { data, error } = await supabase
      .from("matches")
      .select(selectColumns)
      .eq("competition_id", competitionId)
      .order("kickoff_at", { ascending: true, nullsFirst: false })
      .limit(limit);

    if (!error && data && data.length > 0) {
      return (data as RawMatchRow[]).map(normalizeMatch);
    }
  }

  // Fallback: fetch all matches ordered by kickoff_at
  const { data, error } = await supabase
    .from("matches")
    .select(selectColumns)
    .order("kickoff_at", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (!error && data) {
    return (data as RawMatchRow[]).map(normalizeMatch);
  }

  return [];
}

export async function fetchPredictionMatchById(
  supabase: SupabaseServerClient,
  matchId: string,
): Promise<UpcomingPredictionMatch | null> {
  const selectColumns =
    "id, home_team_name, away_team_name, home_country_code, away_country_code, home_team_code, away_team_code, kickoff_at, stage, group_name, status, venue, home_score, away_score";

  const { data, error } = await supabase
    .from("matches")
    .select(selectColumns)
    .eq("id", matchId)
    .maybeSingle();

  if (!error && data) {
    return normalizeMatch(data as RawMatchRow);
  }

  return null;
}
