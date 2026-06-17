import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchUpcomingPredictionMatches } from "@/lib/data/upcomingPredictionMatches";
import { fetchWorldCupGroups } from "@/lib/data/groups";
import { buildGroupStandings } from "@/lib/data/standings";
import { WORLD_CUP_2026_GROUP_STAGE_MATCH_COUNT } from "@/lib/domain/constants";
import { countryCodesMatch, getCountryFlag } from "@/lib/domain/countries";
import {
  formatCountdown,
  getMatchOperationalStatus,
  statusChipClass,
} from "@/lib/domain/matchStatus";
import {
  buildTeamCodeAliasMap,
  normalizeTeamCode,
} from "@/lib/football-data/teamCodes";

type PageProps = { params: Promise<{ code: string }> };
type PlayerRow = {
  team_code: string | null;
  team_name: string | null;
  squad_number: number | null;
  position: string | null;
  player_id: string | null;
  players:
    | { display_name: string | null }
    | Array<{ display_name: string | null }>
    | null;
};
const first = <T,>(v: T | T[] | null | undefined) =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

export default async function TeamPage({ params }: PageProps) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/team/${code}`);

  const [groups, matches, aliasRes] = await Promise.all([
    fetchWorldCupGroups(supabase),
    fetchUpcomingPredictionMatches(
      supabase,
      WORLD_CUP_2026_GROUP_STAGE_MATCH_COUNT,
    ),
    supabase
      .from("team_code_aliases")
      .select("alias_code, canonical_team_code")
      .eq("competition_code", "WC2026")
      .eq("alias_code", code),
  ]);
  const aliases = buildTeamCodeAliasMap(aliasRes.data);
  const canonical = aliases.get(normalizeTeamCode(code) ?? code) ?? code;
  const standings = buildGroupStandings(groups, matches);
  const team = Object.values(standings)
    .flat()
    .find((row) => countryCodesMatch(row.country_code, code));
  if (!team) notFound();

  const teamMatches = matches.filter(
    (match) =>
      countryCodesMatch(
        team.country_code,
        match.home_country_code ?? match.home_team_code ?? "",
      ) ||
      countryCodesMatch(
        team.country_code,
        match.away_country_code ?? match.away_team_code ?? "",
      ),
  );
  const nextMatch =
    teamMatches
      .filter((m) => m.kickoff_at && new Date(m.kickoff_at) > new Date())
      .sort(
        (a, b) =>
          new Date(a.kickoff_at!).getTime() - new Date(b.kickoff_at!).getTime(),
      )[0] ?? null;
  const groupRows = standings[team.group_name] ?? [];
  const groupPosition =
    groupRows.findIndex((row) => row.country_code === team.country_code) + 1;

  const { data: playerRows } = await supabase
    .from("competition_team_players")
    .select(
      "team_code, team_name, squad_number, position, player_id, players(display_name)",
    )
    .eq("competition_code", "WC2026")
    .eq("is_active", true)
    .eq("team_code", canonical)
    .order("position", { ascending: true })
    .order("squad_number", { ascending: true });
  const playersByPosition = ((playerRows ?? []) as PlayerRow[]).reduce<
    Record<string, PlayerRow[]>
  >((acc, row) => {
    const key = row.position ?? "Squad";
    (acc[key] ??= []).push(row);
    return acc;
  }, {});

  const championRes = await supabase
    .from("tournament_champion_predictions")
    .select("team_code", { count: "exact", head: false })
    .eq("competition_code", "WC2026")
    .eq("team_code", canonical);

  return (
    <main className="min-h-screen bg-gray-50 bg-[radial-gradient(circle_at_top_left,rgba(22,163,74,0.10),transparent_30%)] px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between gap-3">
          <Link
            href="/dashboard"
            className="text-sm font-bold text-gray-500 hover:text-gold"
          >
            ← Dashboard
          </Link>
          <Link
            href="/predictions"
            className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white"
          >
            Predictions
          </Link>
        </header>
        <section className="relative overflow-hidden rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm sm:p-8">
          <div className="pointer-events-none absolute -right-8 -top-10 text-[12rem] opacity-[0.06]">
            {team.flag_emoji ?? getCountryFlag(team.country_code)}
          </div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-emerald-700">
            Team page · Group {team.group_name}
          </p>
          <h1 className="mt-3 text-4xl font-black text-gray-900">
            {team.flag_emoji} {team.country_name}
          </h1>
          <div className="mt-5 grid gap-3 sm:grid-cols-5">
            {[
              `#${groupPosition || "—"} group`,
              `${team.points} pts`,
              `${team.won}-${team.drawn}-${team.lost}`,
              `${team.goalsFor}/${team.goalsAgainst}`,
              `GD ${team.goalDifference > 0 ? "+" : ""}${team.goalDifference}`,
            ].map((stat) => (
              <div
                key={stat}
                className="rounded-2xl border border-gray-200 bg-gray-50 p-3 text-center text-sm font-black text-gray-800"
              >
                {stat}
              </div>
            ))}
          </div>
          {nextMatch && (
            <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-gold/30 bg-gold/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-bold text-gray-900">
                Next match: {nextMatch.home_team} vs {nextMatch.away_team} ·{" "}
                {formatCountdown(
                  getMatchOperationalStatus(nextMatch).countdownMs,
                )}
              </p>
              <Link
                href={`/predictions?match=${nextMatch.id}`}
                className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white"
              >
                Predict next match
              </Link>
            </div>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <details open className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer list-none text-xl font-black text-gray-900 [&::-webkit-details-marker]:hidden">
              Fixtures
            </summary>
            <div className="mt-4 space-y-3">
              {teamMatches.map((match) => {
                const status = getMatchOperationalStatus(match);
                return (
                  <article
                    key={match.id}
                    className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-black text-gray-900">
                          <Link
                            href={`/team/${match.home_country_code ?? match.home_team_code}`}
                            className="hover:text-gold"
                          >
                            {match.home_team}
                          </Link>{" "}
                          vs{" "}
                          <Link
                            href={`/team/${match.away_country_code ?? match.away_team_code}`}
                            className="hover:text-gold"
                          >
                            {match.away_team}
                          </Link>
                        </p>
                        <p className="text-sm text-gray-500">
                          {match.kickoff_at
                            ? new Date(match.kickoff_at).toLocaleString()
                            : "Kickoff TBA"}{" "}
                          · {match.venue ?? "Venue TBA"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-bold ${statusChipClass(status.urgency)}`}
                        >
                          {status.operationalStatus}
                        </span>
                        {match.home_score !== null &&
                          match.away_score !== null && (
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-black">
                              {match.home_score}-{match.away_score}
                            </span>
                          )}
                        <Link
                          href={`/predictions?match=${match.id}`}
                          className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-bold"
                        >
                          Open
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </details>
          <aside className="space-y-6">
            <details className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:open">
              <summary className="cursor-pointer list-none text-xl font-black text-gray-900 [&::-webkit-details-marker]:hidden">Stats</summary>
              <p className="mt-3 text-sm text-gray-600">
                MP {team.played} · W {team.won} · D {team.drawn} · L {team.lost}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                Goals scored {team.goalsFor}; conceded {team.goalsAgainst}
              </p>
              <div className="mt-3 flex gap-1">
                {team.form.length ? (
                  team.form.map((f, i) => (
                    <span
                      key={i}
                      className="h-7 w-7 rounded-full bg-emerald-50 text-center text-xs font-black leading-7 text-emerald-800"
                    >
                      {f}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-gray-500">
                    Form appears after first result.
                  </span>
                )}
              </div>
            </details>
            <details className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <summary className="cursor-pointer list-none text-xl font-black text-gray-900 [&::-webkit-details-marker]:hidden">
                Prediction trends
              </summary>
              <p className="mt-3 text-sm text-gray-600">
                Champion picks: {championRes.count ?? 0}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Aggregated only. No individual picks are shown.
              </p>
            </details>
          </aside>
        </section>

        <details className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer list-none text-xl font-black text-gray-900 [&::-webkit-details-marker]:hidden">Squad</summary>
          {Object.keys(playersByPosition).length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">
              Squad data will appear when available.
            </p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(playersByPosition).map(([position, rows]) => (
                <div
                  key={position}
                  className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                >
                  <h3 className="text-sm font-black uppercase tracking-wider text-emerald-700">
                    {position}
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {rows.map((row) => (
                      <li
                        key={row.player_id}
                        className="text-sm font-semibold text-gray-800"
                      >
                        {row.squad_number ? `${row.squad_number}. ` : ""}
                        {first(row.players)?.display_name ?? "Player TBA"}
                        <span className="ml-2 text-xs text-gray-500">
                          XI 0 · goals 0
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </details>
      </div>
    </main>
  );
}
