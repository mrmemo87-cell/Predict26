/**
 * Data safety helpers for match display.
 * Handles both old (home_team_code/away_team_code) and new (home_country_code/away_country_code) schemas.
 */

export type MatchRow = {
  id: string;
  home_team_name?: string | null;
  away_team_name?: string | null;
  home_country_code?: string | null;
  away_country_code?: string | null;
  home_team_code?: string | null;
  away_team_code?: string | null;
  kickoff_at?: string | null;
  status?: string | null;
  stage?: string | null;
  group_name?: string | null;
  home_score?: number | null;
  away_score?: number | null;
};

export type MatchTeams = {
  homeCode: string | null;
  awayCode: string | null;
  homeName: string;
  awayName: string;
};

export function getMatchTeams(match: MatchRow): MatchTeams {
  const homeCode = match.home_country_code || match.home_team_code || null;
  const awayCode = match.away_country_code || match.away_team_code || null;
  const homeName = match.home_team_name || "Team TBA";
  const awayName = match.away_team_name || "Team TBA";

  return { homeCode, awayCode, homeName, awayName };
}

export function formatKickoff(kickoffAt: string | null | undefined): string {
  if (!kickoffAt) return "Time TBA";

  try {
    const date = new Date(kickoffAt);
    if (isNaN(date.getTime())) return "Time TBA";

    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return "Time TBA";
  }
}

export function isUserCountryMatch(
  match: MatchRow,
  profileCountryCode: string | null | undefined,
): boolean {
  if (!profileCountryCode) return false;

  const code = profileCountryCode.trim().toUpperCase();
  if (!code) return false;

  const homeCountry = (match.home_country_code || "").trim().toUpperCase();
  const awayCountry = (match.away_country_code || "").trim().toUpperCase();
  const homeTeam = (match.home_team_code || "").trim().toUpperCase();
  const awayTeam = (match.away_team_code || "").trim().toUpperCase();

  return (
    code === homeCountry ||
    code === awayCountry ||
    code === homeTeam ||
    code === awayTeam
  );
}
