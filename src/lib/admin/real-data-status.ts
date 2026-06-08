import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

type MatchReadinessRow = {
  home_team_name: string | null;
  away_team_name: string | null;
  home_team_code: string | null;
  away_team_code: string | null;
  home_country_code: string | null;
  away_country_code: string | null;
  kickoff_at: string | null;
  status: string | null;
  venue: string | null;
  city: string | null;
};

export type RealDataStatus = {
  scheduledMatches: number;
  finishedMatches: number;
  missingKickoffAt: number;
  missingVenueOrCity: number;
  devTestMatches: number;
  totalMatches: number;
};

const isBlank = (value: string | null | undefined) => !value?.trim();

const isDevOrTestMatch = (match: MatchReadinessRow) => {
  const devOrTestNamePattern = /^(dev|test)\b/i;
  const devOrTestCodePattern = /^(x|tst)/i;
  const teamNames = [match.home_team_name, match.away_team_name];
  const teamCodes = [
    match.home_team_code,
    match.away_team_code,
    match.home_country_code,
    match.away_country_code,
  ];

  return (
    teamNames.some((name) => Boolean(name && devOrTestNamePattern.test(name))) ||
    teamCodes.some((code) => Boolean(code && devOrTestCodePattern.test(code)))
  );
};

export async function fetchRealDataStatus(supabase: AdminClient): Promise<RealDataStatus> {
  const { data, error } = await supabase
    .from("matches")
    .select("home_team_name, away_team_name, home_team_code, away_team_code, home_country_code, away_country_code, kickoff_at, status, venue, city")
    .limit(500);

  if (error) {
    console.error("real data status fetch failed", { message: error.message, code: error.code });
  }

  const matches = ((data ?? []) as MatchReadinessRow[]).filter(Boolean);

  return matches.reduce<RealDataStatus>(
    (status, match) => {
      const matchStatus = match.status?.toLowerCase() ?? "scheduled";

      if (matchStatus === "scheduled" || matchStatus === "upcoming") {
        status.scheduledMatches += 1;
      }

      if (matchStatus === "finished" || matchStatus === "completed") {
        status.finishedMatches += 1;
      }

      if (isBlank(match.kickoff_at)) {
        status.missingKickoffAt += 1;
      }

      if (isBlank(match.venue) || isBlank(match.city)) {
        status.missingVenueOrCity += 1;
      }

      if (isDevOrTestMatch(match)) {
        status.devTestMatches += 1;
      }

      status.totalMatches += 1;
      return status;
    },
    {
      scheduledMatches: 0,
      finishedMatches: 0,
      missingKickoffAt: 0,
      missingVenueOrCity: 0,
      devTestMatches: 0,
      totalMatches: 0,
    },
  );
}
