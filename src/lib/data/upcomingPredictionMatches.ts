import { createClient } from "@/lib/supabase/server";

export type UpcomingPredictionMatch = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  stage: string | null;
  status: string;
  venue: string | null;
  home_country_code: string | null;
  away_country_code: string | null;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type MatchDateColumn = "kickoff_at" | "kickoff_time" | "start_time";

type MatchSelectAttempt = {
  select: string;
  dateColumn: MatchDateColumn;
};

type RawMatchRow = Partial<UpcomingPredictionMatch>;

type MatchQuery = {
  in(column: string, values: readonly string[]): PromiseLike<{ data: unknown; error: unknown }>;
  eq(column: string, value: string): PromiseLike<{ data: unknown; error: unknown }>;
};

const PREDICTABLE_STATUSES = ["scheduled", "upcoming"] as const;

const matchSelectAttempts: MatchSelectAttempt[] = [
  {
    select: "id, home_team, away_team, kickoff_at, stage, status, venue, home_country_code, away_country_code",
    dateColumn: "kickoff_at",
  },
  {
    select: "id, home_team, away_team, kickoff_at, stage, status, venue",
    dateColumn: "kickoff_at",
  },
  {
    select:
      "id, home_team:home_team_name, away_team:away_team_name, kickoff_at, stage, status, venue, home_country_code:home_team_code, away_country_code:away_team_code",
    dateColumn: "kickoff_at",
  },
  {
    select: "id, home_team, away_team, kickoff_at:kickoff_time, stage, status, venue, home_country_code, away_country_code",
    dateColumn: "kickoff_time",
  },
  {
    select: "id, home_team, away_team, kickoff_at:start_time, stage, status, venue, home_country_code, away_country_code",
    dateColumn: "start_time",
  },
];

const normalizeMatch = (match: RawMatchRow): UpcomingPredictionMatch => ({
  id: match.id ?? "",
  home_team: match.home_team ?? "TBD",
  away_team: match.away_team ?? "TBD",
  kickoff_at: match.kickoff_at ?? new Date().toISOString(),
  stage: match.stage ?? null,
  status: match.status ?? "scheduled",
  venue: match.venue ?? null,
  home_country_code: match.home_country_code ?? null,
  away_country_code: match.away_country_code ?? null,
});

const statusQueries = [
  (query: MatchQuery) => query.in("status", PREDICTABLE_STATUSES),
  (query: MatchQuery) => query.eq("status", "scheduled"),
  (query: MatchQuery) => query.eq("status", "upcoming"),
];

export function isPredictableMatchStatus(status: string | null | undefined): boolean {
  return PREDICTABLE_STATUSES.includes((status ?? "").toLowerCase() as (typeof PREDICTABLE_STATUSES)[number]);
}

export async function fetchUpcomingPredictionMatches(
  supabase: SupabaseServerClient,
  limit = 20,
): Promise<UpcomingPredictionMatch[]> {
  const nowIso = new Date().toISOString();

  for (const attempt of matchSelectAttempts) {
    for (const applyStatus of statusQueries) {
      const baseQuery = supabase
        .from("matches")
        .select(attempt.select)
        .gt(attempt.dateColumn, nowIso)
        .order(attempt.dateColumn, { ascending: true })
        .limit(limit);
      const { data, error } = await applyStatus(baseQuery);

      if (!error) {
        return ((data as RawMatchRow[] | null) ?? []).map(normalizeMatch);
      }
    }
  }

  return [];
}

export async function fetchPredictionMatchById(
  supabase: SupabaseServerClient,
  matchId: string,
): Promise<UpcomingPredictionMatch | null> {
  for (const attempt of matchSelectAttempts) {
    const { data, error } = await supabase
      .from("matches")
      .select(attempt.select)
      .eq("id", matchId)
      .maybeSingle();

    if (!error) {
      return data ? normalizeMatch(data as RawMatchRow) : null;
    }
  }

  return null;
}
