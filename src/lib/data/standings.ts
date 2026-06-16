import type { UpcomingPredictionMatch } from "@/lib/data/upcomingPredictionMatches";
import type { GroupTeam } from "@/lib/data/groups";
import { countryCodesMatch } from "@/lib/domain/countries";

export type GroupStandingRow = GroupTeam & {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: Array<"W" | "D" | "L">;
  next_match_at: string | null;
  last_result: string | null;
};

const empty = (team: GroupTeam): GroupStandingRow => ({
  ...team,
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  goalDifference: 0,
  points: 0,
  form: [],
  next_match_at: null,
  last_result: null,
});

export function buildGroupStandings(
  groups: Record<string, GroupTeam[]>,
  matches: UpcomingPredictionMatch[],
): Record<string, GroupStandingRow[]> {
  const byCode = new Map<string, GroupStandingRow>();
  for (const teams of Object.values(groups))
    for (const team of teams)
      byCode.set(team.country_code.toUpperCase(), empty(team));

  const finished = matches
    .filter(
      (m) =>
        m.status.toLowerCase() === "finished" &&
        m.home_score !== null &&
        m.away_score !== null,
    )
    .sort(
      (a, b) =>
        new Date(a.kickoff_at ?? 0).getTime() -
        new Date(b.kickoff_at ?? 0).getTime(),
    );

  for (const match of finished) {
    const home = [...byCode.values()].find((t) =>
      countryCodesMatch(
        t.country_code,
        match.home_country_code ?? match.home_team_code ?? "",
      ),
    );
    const away = [...byCode.values()].find((t) =>
      countryCodesMatch(
        t.country_code,
        match.away_country_code ?? match.away_team_code ?? "",
      ),
    );
    if (
      !home ||
      !away ||
      match.home_score === null ||
      match.away_score === null
    )
      continue;
    const hs = match.home_score;
    const as = match.away_score;
    home.played += 1;
    away.played += 1;
    home.goalsFor += hs;
    home.goalsAgainst += as;
    away.goalsFor += as;
    away.goalsAgainst += hs;
    if (hs > as) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
      home.form.push("W");
      away.form.push("L");
    } else if (hs < as) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
      away.form.push("W");
      home.form.push("L");
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
      home.form.push("D");
      away.form.push("D");
    }
    home.goalDifference = home.goalsFor - home.goalsAgainst;
    away.goalDifference = away.goalsFor - away.goalsAgainst;
    home.last_result = `${hs}-${as} vs ${away.country_code}`;
    away.last_result = `${as}-${hs} vs ${home.country_code}`;
  }

  const now = Date.now();
  for (const row of byCode.values()) {
    row.form = row.form.slice(-5);
    row.next_match_at =
      matches
        .filter(
          (m) =>
            m.kickoff_at &&
            new Date(m.kickoff_at).getTime() > now &&
            (countryCodesMatch(
              row.country_code,
              m.home_country_code ?? m.home_team_code ?? "",
            ) ||
              countryCodesMatch(
                row.country_code,
                m.away_country_code ?? m.away_team_code ?? "",
              )),
        )
        .sort(
          (a, b) =>
            new Date(a.kickoff_at!).getTime() -
            new Date(b.kickoff_at!).getTime(),
        )[0]?.kickoff_at ?? null;
  }

  return Object.fromEntries(
    Object.entries(groups).map(([group, teams]) => [
      group,
      teams
        .map(
          (team) => byCode.get(team.country_code.toUpperCase()) ?? empty(team),
        )
        .sort(
          (a, b) =>
            b.points - a.points ||
            b.goalDifference - a.goalDifference ||
            b.goalsFor - a.goalsFor ||
            a.country_name.localeCompare(b.country_name),
        ),
    ]),
  );
}
