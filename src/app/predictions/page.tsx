import Link from "next/link";
import PendingSubmitButton from "@/components/PendingSubmitButton";
import MatchTimeBlock from "@/components/matches/MatchTimeBlock";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buildFlagLookup,
  formatFlaggedLabel,
  resolveCountryFlag,
} from "@/lib/domain/countries";
import { WORLD_CUP_2026_GROUP_STAGE_MATCH_COUNT } from "@/lib/domain/constants";
import { fetchUpcomingPredictionMatches } from "@/lib/data/upcomingPredictionMatches";
import {
  savePossessionPrediction,
  savePrediction,
  saveScorerPredictions,
} from "./actions";
import ChampionPicksCard, {
  type ChampionPickState,
  type ChampionTeam,
} from "./ChampionPicksCard";
import LineupPredictionModal from "./LineupPredictionModal";
import ScrollToMatch from "./ScrollToMatch";
import {
  buildTeamCodeAliasMap,
  normalizeTeamCode,
  resolveMatchSideTeamCode,
} from "@/lib/football-data/teamCodes";

type PredictionRow = {
  match_id: string;
  home_score: number | null;
  away_score: number | null;
};

type PossessionRow = {
  match_id: string;
  choice: "home_more" | "away_more" | "equal_50_50";
};

type ScorerPredictionRow = {
  match_id: string;
  player_id: string;
};

type LineupPredictionRow = {
  match_id: string;
  team_side: "home" | "away";
  prediction_lineup_players: Array<{ player_id: string | null }> | null;
};

type ChampionConfigRow = {
  competition_code: string;
  competition_id: string | null;
  champion_picks_enabled: boolean;
  knockout_starts_at: string | null;
  round_of_16_starts_at: string | null;
  champion_pick_a_deadline: string | null;
  champion_pick_b_deadline: string | null;
};

type ChampionPredictionRow = {
  pick_type: "A" | "B";
  team_code: string;
};

type SquadRow = {
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

type SquadPlayer = {
  playerId: string;
  displayName: string;
  shirtNumber: number | null;
  position: string | null;
  teamCode: string;
  teamName: string;
};

type CountryFlagRow = {
  code: string | null;
  flag_emoji: string | null;
};

type CompetitionTeamRow = {
  country_code: string | null;
  countries:
    | { name: string | null; flag_emoji: string | null }
    | Array<{ name: string | null; flag_emoji: string | null }>
    | null;
};

type SearchParams = Promise<{
  error?: string;
  saved?: string;
  match?: string;
  bonus_error?: string;
  bonus_saved?: string;
}>;

const POSSESSION_OPTIONS = [
  { value: "home_more", label: "Home more possession" },
  { value: "equal_50_50", label: "50/50" },
  { value: "away_more", label: "Away more possession" },
] as const;

const SCORER_PICK_SLOTS = [0, 1, 2, 3];

const firstRelation = <T,>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

const getBonusErrorMessage = (error: string) => {
  switch (error) {
    case "invalid_possession":
      return "Choose one possession option before saving.";
    case "too_many_scorers":
      return "Choose up to 4 scorer picks.";
    case "invalid_scorer":
      return "Choose scorers from the two squads for this match.";
    case "locked":
      return "Bonus picks are locked for this match.";
    case "bonus_save_failed":
      return "Could not save bonus picks. Please try again.";
    default:
      return "Could not save bonus picks. Please check your selections.";
  }
};

const getBonusSavedMessage = (saved: string) => {
  if (saved === "possession") return "Possession prediction saved.";
  if (saved === "scorers") return "Scorer predictions saved.";
  return "Bonus picks saved.";
};

export default async function PredictionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/predictions");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("country_code, created_at")
    .eq("id", user.id)
    .single();

  if (!profile?.country_code) {
    redirect("/onboarding/country");
  }

  const [
    matches,
    { data: predictions },
    { data: championConfig },
    { data: championPredictions },
    { data: countryFlagRows },
  ] = await Promise.all([
    fetchUpcomingPredictionMatches(supabase, WORLD_CUP_2026_GROUP_STAGE_MATCH_COUNT),
    supabase
      .from("predictions")
      .select("match_id, home_score, away_score")
      .eq("user_id", user.id),
    supabase
      .from("tournament_prediction_config")
      .select(
        "competition_code, competition_id, champion_picks_enabled, knockout_starts_at, round_of_16_starts_at, champion_pick_a_deadline, champion_pick_b_deadline",
      )
      .eq("competition_code", "WC2026")
      .maybeSingle(),
    supabase
      .from("tournament_champion_predictions")
      .select("pick_type, team_code")
      .eq("user_id", user.id)
      .eq("competition_code", "WC2026"),
    supabase.from("countries").select("code, flag_emoji"),
  ]);

  const matchIds = matches.map((match) => match.id);
  const rawTeamCodes = [
    ...new Set(
      matches
        .flatMap((match) => [
          match.home_team_code,
          match.away_team_code,
          match.home_country_code,
          match.away_country_code,
        ])
        .map(normalizeTeamCode)
        .filter(Boolean) as string[],
    ),
  ];

  const [possessionRes, scorerRes, lineupRes, aliasRes] = await Promise.all([
    matchIds.length > 0
      ? supabase
          .from("prediction_possession")
          .select("match_id, choice")
          .eq("user_id", user.id)
          .in("match_id", matchIds)
      : Promise.resolve({ data: [] }),
    matchIds.length > 0
      ? supabase
          .from("prediction_scorers")
          .select("match_id, player_id")
          .eq("user_id", user.id)
          .in("match_id", matchIds)
          .order("slot", { ascending: true })
      : Promise.resolve({ data: [] }),
    matchIds.length > 0
      ? supabase
          .from("prediction_lineups")
          .select("match_id, team_side, prediction_lineup_players(player_id)")
          .eq("user_id", user.id)
          .in("match_id", matchIds)
      : Promise.resolve({ data: [] }),
    rawTeamCodes.length > 0
      ? supabase
          .from("team_code_aliases")
          .select("alias_code, canonical_team_code")
          .eq("competition_code", "WC2026")
          .in("alias_code", rawTeamCodes)
      : Promise.resolve({ data: [] }),
  ]);

  const aliases = buildTeamCodeAliasMap(aliasRes.data);
  const flagLookup = buildFlagLookup(
    countryFlagRows as CountryFlagRow[] | null,
  );

  const canonicalTeamCodes = [
    ...new Set(
      rawTeamCodes.map((code) => aliases.get(code) ?? code).filter(Boolean),
    ),
  ];

  const { data: squadRows } =
    canonicalTeamCodes.length > 0
      ? await supabase
          .from("competition_team_players")
          .select(
            "team_code, team_name, squad_number, position, player_id, players(display_name)",
          )
          .eq("competition_code", "WC2026")
          .eq("is_active", true)
          .in("team_code", canonicalTeamCodes)
          .order("team_code", { ascending: true })
          .order("squad_number", { ascending: true })
      : { data: [] };

  const championConfigRow = championConfig as ChampionConfigRow | null;

  const { data: championTeamRows } = championConfigRow?.competition_id
    ? await supabase
        .from("competition_teams")
        .select("country_code, countries(name, flag_emoji)")
        .eq("competition_id", championConfigRow.competition_id)
        .eq("qualified", true)
    : { data: [] };

  const championTeamCodes = [
    ...new Set(
      ((championTeamRows ?? []) as CompetitionTeamRow[])
        .map((row) => normalizeTeamCode(row.country_code))
        .filter(Boolean) as string[],
    ),
  ];
  const { data: championAliasRows } = championTeamCodes.length
    ? await supabase
        .from("team_code_aliases")
        .select("alias_code, canonical_team_code")
        .eq("competition_code", championConfigRow?.competition_code ?? "WC2026")
        .in("alias_code", championTeamCodes)
    : { data: [] };
  const championAliases = buildTeamCodeAliasMap(championAliasRows);

  const scoresByMatch = new Map(
    ((predictions ?? []) as PredictionRow[]).map((prediction) => [
      prediction.match_id,
      prediction,
    ]),
  );
  const possessionByMatch = new Map(
    ((possessionRes.data ?? []) as PossessionRow[]).map((prediction) => [
      prediction.match_id,
      prediction.choice,
    ]),
  );
  const scorerIdsByMatch = (
    (scorerRes.data ?? []) as ScorerPredictionRow[]
  ).reduce<Map<string, string[]>>((savedScorers, scorer) => {
    const picks = savedScorers.get(scorer.match_id) ?? [];
    picks.push(scorer.player_id);
    savedScorers.set(scorer.match_id, picks);
    return savedScorers;
  }, new Map());

  const squadPlayersByTeam = ((squadRows ?? []) as SquadRow[]).reduce<
    Map<string, SquadPlayer[]>
  >((playersByTeam, row) => {
    if (!row.team_code || !row.player_id) return playersByTeam;

    const player = firstRelation(row.players);
    const players = playersByTeam.get(row.team_code) ?? [];
    players.push({
      playerId: row.player_id,
      displayName: player?.display_name ?? "Player TBA",
      shirtNumber: row.squad_number,
      position: row.position,
      teamCode: row.team_code,
      teamName: row.team_name ?? row.team_code,
    });
    playersByTeam.set(row.team_code, players);
    return playersByTeam;
  }, new Map());

  const playersById = new Map(
    [...squadPlayersByTeam.values()]
      .flat()
      .map((player) => [player.playerId, player]),
  );
  const now = new Date();

  const lineupIdsByMatchSide = (
    (lineupRes.data ?? []) as LineupPredictionRow[]
  ).reduce<Map<string, { home: string[]; away: string[] }>>(
    (savedLineups, lineup) => {
      const current = savedLineups.get(lineup.match_id) ?? {
        home: [],
        away: [],
      };
      current[lineup.team_side] = (lineup.prediction_lineup_players ?? [])
        .map((row) => row.player_id)
        .filter(Boolean) as string[];
      savedLineups.set(lineup.match_id, current);
      return savedLineups;
    },
    new Map(),
  );

  const championTeams = Array.from(
    ((championTeamRows ?? []) as CompetitionTeamRow[])
      .reduce<Map<string, ChampionTeam>>((teams, row) => {
        const countryCode = normalizeTeamCode(row.country_code);
        if (!countryCode) return teams;

        const country = firstRelation(row.countries);
        const teamCode = championAliases.get(countryCode) ?? countryCode;
        teams.set(teamCode, {
          teamCode,
          teamName: country?.name ?? countryCode,
          flag:
            country?.flag_emoji ??
            resolveCountryFlag(teamCode, flagLookup) ??
            resolveCountryFlag(countryCode, flagLookup),
        });
        return teams;
      }, new Map())
      .values(),
  ).sort((a, b) => a.teamName.localeCompare(b.teamName));
  const championPredictionsByType = new Map(
    ((championPredictions ?? []) as ChampionPredictionRow[]).map((pick) => [
      pick.pick_type,
      pick.team_code,
    ]),
  );

  const getChampionPickState = (
    pickType: "A" | "B",
    label: string,
    points: number,
  ): ChampionPickState => {
    const deadline =
      pickType === "A"
        ? (championConfigRow?.champion_pick_a_deadline ?? null)
        : (championConfigRow?.champion_pick_b_deadline ?? null);
    const eligibilityCutoff =
      pickType === "A"
        ? championConfigRow?.knockout_starts_at
        : championConfigRow?.round_of_16_starts_at;
    const selectedTeamCode = championPredictionsByType.get(pickType) ?? null;
    const deadlineOpen = Boolean(deadline && new Date(deadline) > now);
    const eligibleByJoinTime = Boolean(
      eligibilityCutoff &&
      profile.created_at &&
      new Date(profile.created_at) < new Date(eligibilityCutoff),
    );
    const configOpen = Boolean(
      championConfigRow?.champion_picks_enabled && championTeams.length > 0,
    );
    const isOpen = configOpen && deadlineOpen && eligibleByJoinTime;
    const isUnavailable = !configOpen || !eligibleByJoinTime || !deadline;
    const statusLabel = isOpen
      ? selectedTeamCode
        ? "Saved / open"
        : "Open"
      : selectedTeamCode
        ? "Saved / locked"
        : isUnavailable
          ? "Coming soon"
          : "Locked";

    return {
      pickType,
      label,
      points,
      deadline,
      selectedTeamCode,
      isOpen,
      isUnavailable,
      statusLabel,
    };
  };

  const championPickStates: ChampionPickState[] = [
    getChampionPickState("A", "Champion Pick A", 20),
    getChampionPickState("B", "Champion Pick B", 15),
  ];
  const championDisabledMessage =
    !championConfigRow?.champion_picks_enabled || championTeams.length === 0
      ? "Champion picks will open soon."
      : null;

  return (
    <main className="min-h-screen bg-gray-50 bg-[radial-gradient(circle_at_top_left,rgba(22,163,74,0.10),transparent_30%)] px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-4xl">
        <ScrollToMatch matchId={params.match} />
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-gray-500 transition hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            ← Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/rules"
              className="text-sm font-medium text-gray-500 transition hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              Rules
            </Link>
            <div className="rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              Predictions
            </div>
          </div>
        </header>

        <section className="mb-8 overflow-hidden rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm sm:p-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-emerald-700">
            World Cup 2026 match center
          </p>
          <h1 className="text-3xl font-black text-gray-900 sm:text-5xl">
            Predict the <span className="gold-text-gradient">exact score</span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-600">
            Enter the exact final score before kickoff. Bonus picks are optional
            and save separately, so the core score prediction stays simple.
          </p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800">
              Locks at kickoff
            </span>
            <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-gold-dark">
              Exact score: 5 pts
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-gray-700">
              Correct result: 2 pts
            </span>
            <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-gray-700">
              Possession: 1 pt
            </span>
            <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-gray-700">
              Scorers: 1 each
            </span>
          </div>
        </section>

        {params.saved && (
          <div className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
            Prediction saved.
          </div>
        )}
        {params.bonus_saved && (
          <div className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
            {getBonusSavedMessage(params.bonus_saved)}
          </div>
        )}
        {params.error && (
          <div className="mb-5 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
            {params.error === "invalid_prediction"
              ? "Please enter both scores."
              : params.error === "locked"
                ? "Predictions are locked for this match."
                : "Could not save prediction. Please try again."}
          </div>
        )}
        {params.bonus_error && (
          <div className="mb-5 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
            {getBonusErrorMessage(params.bonus_error)}
          </div>
        )}

        <ChampionPicksCard
          teams={championTeams}
          picks={championPickStates}
          disabledMessage={championDisabledMessage}
        />

        <div className="space-y-4">
          {matches.map((match) => {
            const savedScore = scoresByMatch.get(match.id);
            const locked =
              match.status.toLowerCase() !== "scheduled" ||
              !match.kickoff_at ||
              new Date(match.kickoff_at) <= now;
            const isHighlighted = params.match === match.id;
            const savedPredictionLabel =
              savedScore &&
              savedScore.home_score !== null &&
              savedScore.away_score !== null
                ? `${savedScore.home_score} - ${savedScore.away_score}`
                : null;
            const savedPossession = possessionByMatch.get(match.id) ?? null;
            const savedScorerIds = scorerIdsByMatch.get(match.id) ?? [];
            const homeCode = resolveMatchSideTeamCode(
              match.home_team_code,
              match.home_country_code,
              aliases,
            );
            const awayCode = resolveMatchSideTeamCode(
              match.away_team_code,
              match.away_country_code,
              aliases,
            );
            const homeSquad = homeCode
              ? (squadPlayersByTeam.get(homeCode) ?? [])
              : [];
            const awaySquad = awayCode
              ? (squadPlayersByTeam.get(awayCode) ?? [])
              : [];
            const hasScorerSquads =
              homeSquad.length > 0 && awaySquad.length > 0;
            const savedLineups = lineupIdsByMatchSide.get(match.id) ?? {
              home: [],
              away: [],
            };
            const savedScorerLabels = savedScorerIds
              .map((playerId) => playersById.get(playerId)?.displayName)
              .filter(Boolean) as string[];
            const homeLabel = formatFlaggedLabel(
              match.home_team,
              match.home_country_code ?? homeCode,
              flagLookup,
            );
            const awayLabel = formatFlaggedLabel(
              match.away_team,
              match.away_country_code ?? awayCode,
              flagLookup,
            );
            const homeFlag = resolveCountryFlag(
              match.home_country_code ?? homeCode,
              flagLookup,
            );
            const awayFlag = resolveCountryFlag(
              match.away_country_code ?? awayCode,
              flagLookup,
            );
            const postMatchMessage = match.status === "finished"
              ? match.sync_state_status === "fully_scored"
                ? "Match fully scored · Bonus points added"
                : "Final score added · Bonus points verifying · Leaderboard updating soon"
              : null;
            const lineupLocked = locked || (!!match.kickoff_at && new Date(match.kickoff_at).getTime() - now.getTime() <= 120 * 60_000);

            return (
              <article
                key={match.id}
                id={`match-${match.id}`}
                className={`scroll-mt-6 overflow-hidden rounded-3xl border p-4 shadow-sm transition sm:p-6 ${
                  isHighlighted
                    ? "border-gold bg-gold/10 shadow-lg shadow-gold/10"
                    : "border-gray-200 bg-white"
                }`}
              >
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm">
                      <MatchTimeBlock
                        kickoffAt={match.kickoff_at}
                        status={match.status}
                        venue={match.venue}
                        compact
                        countdownLabel="Locks in"
                        className="space-y-1"
                      />
                    </div>
                    <h2 className="mt-2 text-xl font-black text-gray-900 sm:text-2xl">
                      <span className="inline-flex min-w-0 items-center gap-2">
                        {homeFlag && <span aria-hidden="true">{homeFlag}</span>}
                        <span className="truncate">{match.home_team}</span>
                      </span>{" "}
                      <span className="text-gold">vs</span>{" "}
                      <span className="inline-flex min-w-0 items-center gap-2">
                        {awayFlag && <span aria-hidden="true">{awayFlag}</span>}
                        <span className="truncate">{match.away_team}</span>
                      </span>
                    </h2>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-600">
                      <span className="rounded-full bg-gray-100 px-3 py-1">
                        {match.stage || "Group stage"}
                      </span>
                      <span className="rounded-full bg-gray-100 px-3 py-1">
                        Predict before kickoff
                      </span>
                    </div>
                    {savedPredictionLabel && (
                      <p className="mt-2 text-sm font-medium text-gray-500">
                        Saved prediction:{" "}
                        <span className="text-gray-900">
                          {savedPredictionLabel}
                        </span>
                      </p>
                    )}
                    {postMatchMessage && (
                      <p className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">
                        {postMatchMessage}
                      </p>
                    )}
                  </div>
                  <span
                    className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${locked ? "border border-red-200 bg-red-50 text-red-700" : "border border-emerald-200 bg-emerald-50 text-emerald-800"}`}
                  >
                    {locked ? "Prediction closed" : "Lock your pick"}
                  </span>
                </div>

                {locked ? (
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-600">
                    Prediction closed because kickoff has passed or this match
                    is not currently scheduled.
                  </div>
                ) : (
                  <form
                    action={savePrediction}
                    className="flex flex-col gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 sm:flex-row sm:items-end sm:justify-between"
                  >
                    <input type="hidden" name="match_id" value={match.id} />
                    <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 sm:flex-1">
                      <label className="min-w-0">
                        <span className="mb-2 block truncate text-sm font-semibold text-gray-700">
                          {homeLabel}
                        </span>
                        <input
                          type="number"
                          name="home_score"
                          min="0"
                          max="20"
                          step="1"
                          inputMode="numeric"
                          required
                          defaultValue={savedScore?.home_score ?? ""}
                          aria-label={`${match.home_team} score`}
                          className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-center text-2xl font-black text-gray-900 outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/20 sm:max-w-28"
                        />
                      </label>
                      <span className="pb-3 text-xl font-bold text-gold">
                        -
                      </span>
                      <label className="min-w-0">
                        <span className="mb-2 block truncate text-sm font-semibold text-gray-700">
                          {awayLabel}
                        </span>
                        <input
                          type="number"
                          name="away_score"
                          min="0"
                          max="20"
                          step="1"
                          inputMode="numeric"
                          required
                          defaultValue={savedScore?.away_score ?? ""}
                          aria-label={`${match.away_team} score`}
                          className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-center text-2xl font-black text-gray-900 outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/20 sm:max-w-28"
                        />
                      </label>
                    </div>
                    <PendingSubmitButton
                      idleText={savedPredictionLabel ? "Update prediction" : "Lock your pick"}
                      pendingText="Saving pick..."
                      className="rounded-2xl border border-emerald-700 bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                    />
                  </form>
                )}

                <section className="mt-4 rounded-2xl border border-emerald-100 bg-white/80 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-sm font-black text-gray-900">
                        Lineup Prediction
                      </h3>
                      <p className="mt-1 text-xs text-gray-500">
                        Pick each team&apos;s starting XI in a pitch modal.
                        Locks 120 minutes before kickoff; official XIs can be imported after the match.
                      </p>
                    </div>
                    <LineupPredictionModal
                      matchId={match.id}
                      homeTeamName={match.home_team}
                      awayTeamName={match.away_team}
                      homeFlag={homeFlag}
                      awayFlag={awayFlag}
                      homePlayers={homeSquad}
                      awayPlayers={awaySquad}
                      initialHomePlayerIds={savedLineups.home}
                      initialAwayPlayerIds={savedLineups.away}
                      locked={lineupLocked}
                    />
                  </div>
                  <p className="mt-3 text-xs text-gray-500">
                    Saved: {homeLabel} XI {savedLineups.home.length}/11 ·{" "}
                    {awayLabel} XI {savedLineups.away.length}/11
                  </p>
                </section>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <section className="rounded-2xl border border-gray-200 bg-white/80 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black text-gray-900">
                          Possession Prediction
                        </h3>
                        <p className="mt-1 text-xs text-gray-500">
                          1 point for the team that finishes with more
                          possession.
                        </p>
                      </div>
                      <span className="rounded-full bg-gold/10 px-2.5 py-1 text-xs font-bold text-gold-dark">
                        1 pt
                      </span>
                    </div>
                    {locked ? (
                      <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">
                        Saved:{" "}
                        <span className="font-semibold text-gray-900">
                          {POSSESSION_OPTIONS.find(
                            (option) => option.value === savedPossession,
                          )?.label ?? "None"}
                        </span>
                      </p>
                    ) : (
                      <form
                        action={savePossessionPrediction}
                        className="mt-3 space-y-3"
                      >
                        <input type="hidden" name="match_id" value={match.id} />
                        <div className="grid gap-2 sm:grid-cols-3">
                          {POSSESSION_OPTIONS.map((option) => (
                            <label
                              key={option.value}
                              className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:border-gold/60 has-[:checked]:border-gold has-[:checked]:bg-gold/10 has-[:checked]:text-gold-dark"
                            >
                              <input
                                type="radio"
                                name="possession_choice"
                                value={option.value}
                                defaultChecked={
                                  savedPossession === option.value
                                }
                                required
                                className="h-3.5 w-3.5 accent-emerald-700"
                              />
                              <span>
                                {option.label
                                  .replace("Home", homeLabel)
                                  .replace("Away", awayLabel)}
                              </span>
                            </label>
                          ))}
                        </div>
                        <PendingSubmitButton
                          idleText={savedPossession ? "Update possession pick" : "Save possession pick"}
                          pendingText="Saving..."
                          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 transition hover:border-gold hover:text-gold-dark"
                        />
                      </form>
                    )}
                  </section>

                  <section className="rounded-2xl border border-gray-200 bg-white/80 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black text-gray-900">
                          Scorer Prediction
                        </h3>
                        <p className="mt-1 text-xs text-gray-500">
                          Pick up to 4 players. Each scorer is worth 1 point.
                        </p>
                      </div>
                      <span className="rounded-full bg-gold/10 px-2.5 py-1 text-xs font-bold text-gold-dark">
                        {savedScorerIds.length}/4
                      </span>
                    </div>
                    {locked ? (
                      <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-600">
                        Saved:{" "}
                        <span className="font-semibold text-gray-900">
                          {savedScorerLabels.length > 0
                            ? savedScorerLabels.join(", ")
                            : "None"}
                        </span>
                      </p>
                    ) : !hasScorerSquads ? (
                      <p className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                        Scorer picks will unlock when both official squads are
                        available for this match.
                      </p>
                    ) : (
                      <form
                        action={saveScorerPredictions}
                        className="mt-3 space-y-3"
                      >
                        <input type="hidden" name="match_id" value={match.id} />
                        <div className="grid gap-2 sm:grid-cols-2">
                          {SCORER_PICK_SLOTS.map((slotIndex) => (
                            <label
                              key={slotIndex}
                              className="text-xs font-semibold text-gray-600"
                            >
                              Pick {slotIndex + 1}
                              <select
                                name="scorer_player_id"
                                defaultValue={savedScorerIds[slotIndex] ?? ""}
                                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/20"
                              >
                                <option value="">No player</option>
                                <optgroup label={homeLabel}>
                                  {homeSquad.map((player) => (
                                    <option
                                      key={player.playerId}
                                      value={player.playerId}
                                    >
                                      {player.shirtNumber
                                        ? `${player.shirtNumber}. `
                                        : ""}
                                      {player.displayName}
                                      {player.position
                                        ? ` · ${player.position}`
                                        : ""}
                                    </option>
                                  ))}
                                </optgroup>
                                <optgroup label={awayLabel}>
                                  {awaySquad.map((player) => (
                                    <option
                                      key={player.playerId}
                                      value={player.playerId}
                                    >
                                      {player.shirtNumber
                                        ? `${player.shirtNumber}. `
                                        : ""}
                                      {player.displayName}
                                      {player.position
                                        ? ` · ${player.position}`
                                        : ""}
                                    </option>
                                  ))}
                                </optgroup>
                              </select>
                            </label>
                          ))}
                        </div>
                        {savedScorerLabels.length > 0 && (
                          <p className="text-xs text-gray-500">
                            Saved:{" "}
                            <span className="font-semibold text-gray-700">
                              {savedScorerLabels.join(", ")}
                            </span>
                          </p>
                        )}
                        <PendingSubmitButton
                          idleText={savedScorerIds.length > 0 ? "Update scorer picks" : "Save scorer picks"}
                          pendingText="Saving scorers..."
                          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 transition hover:border-gold hover:text-gold-dark"
                        />
                      </form>
                    )}
                  </section>
                </div>
              </article>
            );
          })}

          {matches.length === 0 && (
            <div className="rounded-3xl border border-gray-200 bg-white p-10 text-center text-gray-500">
              Upcoming prediction matches will appear here soon.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
