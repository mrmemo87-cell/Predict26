import "server-only";

import { getMatchBonusReadiness } from "@/lib/scoring/bonusReadiness";
import { scoreFinishedMatch } from "@/lib/scoring/matchScoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { mockFootballDataProvider } from "./providers/mock";
import type {
  FootballDataProvider,
  FootballProviderName,
  PostMatchSyncResult,
  ProviderGoalEvent,
  ProviderPostMatchReport,
} from "./providers/types";

type AdminClient = ReturnType<typeof createAdminClient>;

type EligibleMatchRow = {
  id: string;
  kickoff_at: string | null;
  status: string | null;
  home_score: number | null;
  away_score: number | null;
  home_team_code: string | null;
  away_team_code: string | null;
  home_country_code: string | null;
  away_country_code: string | null;
  sync_state?: Array<{
    status: string | null;
    next_sync_after: string | null;
    retry_count: number | null;
  }> | null;
  provider_match_mappings?: Array<{
    provider_match_id: string;
    provider: string;
    mapping_status: string;
  }> | null;
};

type PlayerMappingRow = {
  provider_player_id: string;
  player_id: string | null;
  competition_team_player_id: string | null;
  mapping_status: string | null;
};

type TeamAliasRow = {
  alias_code: string;
  canonical_team_code: string;
};

type ScoringRunRow = { id: string };

const DEFAULT_PROVIDER = mockFootballDataProvider;
const EXPECTED_FULL_TIME_MINUTES = 120;
const RETRY_MINUTES = 15;
const MAX_RETRIES = 12;
const FINAL_STATUSES = new Set(["completed", "finished"]);
const SCOREABLE_GOAL_TYPES = new Set(["goal", "penalty_goal"]);

const firstRelation = <T>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

const addMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60_000);

const normalizeTeamCode = (value: string | null | undefined) =>
  value?.trim().toUpperCase() || null;

const readinessStatus = (ready: boolean, missing: boolean) => {
  if (ready) return "ready";
  return missing ? "missing" : "incomplete";
};

const categoryList = (statuses: Record<string, string>) =>
  Object.entries(statuses)
    .filter(([, status]) => status === "ready")
    .map(([category]) => category);

const reviewList = (statuses: Record<string, string>) =>
  Object.entries(statuses)
    .filter(([, status]) => status !== "ready")
    .map(([category]) => category);

async function createSyncRun(
  supabase: AdminClient,
  provider: FootballProviderName,
  matchId: string | null,
) {
  const { data, error } = await supabase
    .from("provider_sync_runs")
    .insert({ provider, sync_type: matchId ? "post_match" : "post_match_batch", match_id: matchId })
    .select("id")
    .single<{ id: string }>();

  if (error) throw new Error(`Could not create provider sync run: ${error.message}`);
  return data.id;
}

async function finishSyncRun(
  supabase: AdminClient,
  runId: string,
  updates: Record<string, unknown>,
) {
  const { error } = await supabase
    .from("provider_sync_runs")
    .update({ ...updates, finished_at: new Date().toISOString() })
    .eq("id", runId);

  if (error) throw new Error(`Could not finish provider sync run: ${error.message}`);
}

async function loadPlayerMappings(
  supabase: AdminClient,
  provider: FootballProviderName,
  report: ProviderPostMatchReport,
) {
  const providerPlayerIds = [
    ...new Set(
      [
        ...report.goalEvents.map((event) => event.player?.externalId),
        ...report.lineups.map((lineup) => lineup.externalId),
      ].filter(Boolean) as string[],
    ),
  ];

  if (providerPlayerIds.length === 0) return new Map<string, PlayerMappingRow>();

  const { data, error } = await supabase
    .from("provider_player_mappings")
    .select("provider_player_id, player_id, competition_team_player_id, mapping_status")
    .eq("provider", provider)
    .in("provider_player_id", providerPlayerIds);

  if (error) throw new Error(`Could not load player mappings: ${error.message}`);

  return new Map(
    ((data ?? []) as PlayerMappingRow[]).map((row) => [row.provider_player_id, row]),
  );
}

async function loadTeamAliases(supabase: AdminClient, codes: Array<string | null | undefined>) {
  const normalizedCodes = [...new Set(codes.map(normalizeTeamCode).filter(Boolean) as string[])];
  if (normalizedCodes.length === 0) return new Map<string, string>();

  const { data, error } = await supabase
    .from("team_code_aliases")
    .select("alias_code, canonical_team_code")
    .eq("competition_code", "WC2026")
    .in("alias_code", normalizedCodes);

  if (error) throw new Error(`Could not load team aliases: ${error.message}`);

  return new Map(
    ((data ?? []) as TeamAliasRow[]).map((row) => [row.alias_code, row.canonical_team_code]),
  );
}

function mappedPlayerId(
  mappings: Map<string, PlayerMappingRow>,
  providerPlayerId: string | null | undefined,
) {
  if (!providerPlayerId) return null;
  const mapping = mappings.get(providerPlayerId);
  if (!mapping || mapping.mapping_status !== "active") return null;
  return mapping.player_id;
}

async function stageReport(
  supabase: AdminClient,
  provider: FootballProviderName,
  runId: string,
  matchId: string,
  report: ProviderPostMatchReport,
  mappings: Map<string, PlayerMappingRow>,
  aliases: Map<string, string>,
) {
  const { error: resultError } = await supabase.from("match_result_staging").insert({
    sync_run_id: runId,
    provider,
    provider_match_id: report.providerMatchId,
    match_id: matchId,
    status: report.status,
    home_score: report.homeScore,
    away_score: report.awayScore,
    is_final: report.isFinal,
    confidence: report.confidence ?? null,
    raw_payload: report.rawPayload ?? report,
  });
  if (resultError) throw new Error(`Could not stage result: ${resultError.message}`);

  if (report.goalEvents.length > 0) {
    const { error } = await supabase.from("match_event_staging").insert(
      report.goalEvents.map((event) => ({
        sync_run_id: runId,
        provider,
        provider_match_id: report.providerMatchId,
        provider_event_id: event.externalId,
        provider_player_id: event.player?.externalId ?? null,
        match_id: matchId,
        team_side: event.teamSide,
        player_id: mappedPlayerId(mappings, event.player?.externalId),
        event_type: event.eventType,
        minute: event.minute ?? null,
        stoppage_minute: event.stoppageMinute ?? null,
        include_for_scorer_scoring: SCOREABLE_GOAL_TYPES.has(event.eventType),
        mapping_status: event.player ? (mappedPlayerId(mappings, event.player.externalId) ? "mapped" : "missing_player_mapping") : "no_player",
        raw_payload: event.rawPayload ?? event,
      })),
    );
    if (error) throw new Error(`Could not stage goal events: ${error.message}`);
  }

  if (report.possession.length > 0) {
    const { error } = await supabase.from("match_stats_staging").insert(
      report.possession.map((stat) => ({
        sync_run_id: runId,
        provider,
        provider_match_id: report.providerMatchId,
        match_id: matchId,
        team_side: stat.teamSide,
        possession_percent: stat.percent,
        raw_payload: stat.rawPayload ?? stat,
      })),
    );
    if (error) throw new Error(`Could not stage possession stats: ${error.message}`);
  }

  if (report.lineups.length > 0) {
    const { error } = await supabase.from("match_lineup_staging").insert(
      report.lineups.map((lineup) => {
        const rawTeamCode = normalizeTeamCode(lineup.teamCode);
        return {
          sync_run_id: runId,
          provider,
          provider_match_id: report.providerMatchId,
          provider_lineup_id: `${lineup.teamSide}:${lineup.externalId}`,
          provider_player_id: lineup.externalId,
          match_id: matchId,
          team_side: lineup.teamSide,
          team_code: rawTeamCode ? aliases.get(rawTeamCode) ?? rawTeamCode : null,
          player_id: mappedPlayerId(mappings, lineup.externalId),
          player_name: lineup.displayName,
          shirt_number: lineup.shirtNumber ?? null,
          position: lineup.position ?? null,
          is_starter: lineup.isStarter,
          lineup_slot: lineup.lineupSlot ?? null,
          mapping_status: mappedPlayerId(mappings, lineup.externalId) ? "mapped" : "missing_player_mapping",
          raw_payload: lineup.rawPayload ?? lineup,
        };
      }),
    );
    if (error) throw new Error(`Could not stage lineups: ${error.message}`);
  }
}

async function applyCanonicalData(
  supabase: AdminClient,
  provider: FootballProviderName,
  matchId: string,
  report: ProviderPostMatchReport,
  mappings: Map<string, PlayerMappingRow>,
  aliases: Map<string, string>,
) {
  if (report.isFinal && report.homeScore !== null && report.awayScore !== null) {
    const { error } = await supabase
      .from("matches")
      .update({
        status: "finished",
        home_score: report.homeScore,
        away_score: report.awayScore,
      })
      .eq("id", matchId);
    if (error) throw new Error(`Could not apply final score: ${error.message}`);
  }

  for (const stat of report.possession) {
    const { error } = await supabase.from("match_stats").upsert(
      {
        match_id: matchId,
        team_side: stat.teamSide,
        possession_percent: stat.percent,
        source: provider,
        raw_payload: stat.rawPayload ?? stat,
      },
      { onConflict: "match_id,team_side,source" },
    );
    if (error) throw new Error(`Could not apply possession stat: ${error.message}`);
  }

  const scorerEvents = report.goalEvents.filter((event) => SCOREABLE_GOAL_TYPES.has(event.eventType));
  for (const event of scorerEvents) {
    const { error } = await supabase.from("match_events").upsert(
      {
        match_id: matchId,
        team_side: event.teamSide,
        player_id: mappedPlayerId(mappings, event.player?.externalId),
        event_type: event.eventType,
        minute: event.minute ?? null,
        stoppage_minute: event.stoppageMinute ?? null,
        description: event.player?.displayName ?? null,
        source: provider,
        provider_event_id: event.externalId,
        raw_payload: event.rawPayload ?? event,
      },
      { onConflict: "match_id,source,provider_event_id" },
    );
    if (error) throw new Error(`Could not apply goal event: ${error.message}`);
  }

  for (const lineup of report.lineups.filter((player) => player.isStarter)) {
    const rawTeamCode = normalizeTeamCode(lineup.teamCode);
    const { error } = await supabase.from("match_lineups").upsert(
      {
        match_id: matchId,
        player_id: mappedPlayerId(mappings, lineup.externalId),
        team_side: lineup.teamSide,
        team_code: rawTeamCode ? aliases.get(rawTeamCode) ?? rawTeamCode : null,
        player_name: lineup.displayName,
        shirt_number: lineup.shirtNumber ?? null,
        position: lineup.position ?? null,
        is_starter: true,
        lineup_slot: lineup.lineupSlot ?? null,
        source: provider,
        provider_lineup_id: `${lineup.teamSide}:${lineup.externalId}`,
        raw_payload: lineup.rawPayload ?? lineup,
      },
      { onConflict: "match_id,team_side,source,provider_lineup_id" },
    );
    if (error) throw new Error(`Could not apply lineup: ${error.message}`);
  }
}

function validateReport(report: ProviderPostMatchReport, mappings: Map<string, PlayerMappingRow>) {
  const exactReady =
    report.isFinal &&
    FINAL_STATUSES.has(report.status) &&
    report.homeScore !== null &&
    report.awayScore !== null;
  const possessionRows = report.possession.filter((stat) => stat.percent !== null);
  const possessionReady =
    possessionRows.length === 2 &&
    possessionRows.some((stat) => stat.teamSide === "home") &&
    possessionRows.some((stat) => stat.teamSide === "away");
  const scorerEvents = report.goalEvents.filter((event) => SCOREABLE_GOAL_TYPES.has(event.eventType));
  const scorersMapped = scorerEvents.every((event) =>
    event.player?.externalId ? mappings.get(event.player.externalId)?.player_id : false,
  );
  const scorersReady = scorerEvents.length === 0 || scorersMapped;
  const homeStarters = report.lineups.filter((lineup) => lineup.teamSide === "home" && lineup.isStarter);
  const awayStarters = report.lineups.filter((lineup) => lineup.teamSide === "away" && lineup.isStarter);
  const lineupHomeReady =
    homeStarters.length === 11 && homeStarters.every((lineup) => mappings.get(lineup.externalId)?.player_id);
  const lineupAwayReady =
    awayStarters.length === 11 && awayStarters.every((lineup) => mappings.get(lineup.externalId)?.player_id);

  return {
    exact_result: readinessStatus(exactReady, !report.isFinal || report.homeScore === null || report.awayScore === null),
    possession: readinessStatus(possessionReady, report.possession.length === 0),
    goal_events: readinessStatus(scorersReady, false),
    lineup_home: readinessStatus(lineupHomeReady, homeStarters.length === 0),
    lineup_away: readinessStatus(lineupAwayReady, awayStarters.length === 0),
  };
}

async function updateReadiness(
  supabase: AdminClient,
  matchId: string,
  statuses: Record<string, string>,
) {
  const { error } = await supabase.rpc("update_match_bonus_readiness", {
    p_match_id: matchId,
    p_possession_status: statuses.possession,
    p_goal_events_status: statuses.goal_events,
    p_lineup_home_status: statuses.lineup_home,
    p_lineup_away_status: statuses.lineup_away,
    p_possession_notes: "Provider post-match sync validation",
    p_goal_events_notes: "Provider post-match sync validation",
    p_lineup_home_notes: "Provider post-match sync validation",
    p_lineup_away_notes: "Provider post-match sync validation",
    p_confirmed_by: null,
    p_metadata: { source: "post_match_provider_sync", exact_result_status: statuses.exact_result },
  });

  if (error) throw new Error(`Could not update bonus readiness: ${error.message}`);
}

async function latestScoringRunId(supabase: AdminClient, matchId: string) {
  const { data } = await supabase
    .from("scoring_runs")
    .select("id")
    .eq("scope_type", "match")
    .eq("source", "score_finished_match")
    .eq("match_id", matchId)
    .order("finished_at", { ascending: false, nullsFirst: false })
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle<ScoringRunRow>();

  return data?.id ?? null;
}

async function updateSyncState(
  supabase: AdminClient,
  matchId: string,
  provider: FootballProviderName,
  runId: string,
  statuses: Record<string, string>,
  retryCount: number,
  statusOverride?: string,
) {
  const reviewCategories = reviewList(statuses);
  const readyCategories = categoryList(statuses);
  const scoringRunId = await latestScoringRunId(supabase, matchId);
  const status =
    statusOverride ??
    (reviewCategories.length > 0
      ? statuses.exact_result === "ready"
        ? "bonus_pending"
        : "needs_review"
      : "fully_scored");

  const { error } = await supabase.from("match_provider_sync_state").upsert(
    {
      match_id: matchId,
      provider,
      status,
      exact_result_status: statuses.exact_result,
      possession_status: statuses.possession,
      goal_events_status: statuses.goal_events,
      lineup_home_status: statuses.lineup_home,
      lineup_away_status: statuses.lineup_away,
      latest_sync_run_id: runId,
      latest_scoring_run_id: scoringRunId,
      last_synced_at: new Date().toISOString(),
      next_sync_after:
        status === "fully_scored" || retryCount >= MAX_RETRIES
          ? null
          : addMinutes(new Date(), RETRY_MINUTES).toISOString(),
      retry_count: retryCount,
      metadata: { readyCategories, reviewCategories },
    },
    { onConflict: "match_id" },
  );

  if (error) throw new Error(`Could not update sync state: ${error.message}`);
}

async function syncOneMatch(
  supabase: AdminClient,
  provider: FootballDataProvider,
  match: EligibleMatchRow,
) {
  const mapping = firstRelation(match.provider_match_mappings);
  const existingState = firstRelation(match.sync_state);
  const runId = await createSyncRun(supabase, provider.name, match.id);
  const retryCount = (existingState?.retry_count ?? 0) + 1;

  if (!mapping?.provider_match_id || !provider.fetchPostMatchReport) {
    const statuses = {
      exact_result: "missing",
      possession: "missing",
      goal_events: "missing",
      lineup_home: "missing",
      lineup_away: "missing",
    };
    await updateSyncState(supabase, match.id, provider.name, runId, statuses, retryCount, "needs_review");
    await finishSyncRun(supabase, runId, {
      status: "needs_review",
      records_processed: 0,
      categories_needing_review: Object.keys(statuses),
      error_message: "No active provider match mapping or post-match provider implementation.",
    });
    return "needs_review" as const;
  }

  try {
    const report = await provider.fetchPostMatchReport(mapping.provider_match_id);
    if (!report) {
      const statuses = {
        exact_result: "missing",
        possession: "missing",
        goal_events: "missing",
        lineup_home: "missing",
        lineup_away: "missing",
      };
      await updateSyncState(supabase, match.id, provider.name, runId, statuses, retryCount, "awaiting_final_data");
      await finishSyncRun(supabase, runId, {
        status: "needs_review",
        records_processed: 0,
        categories_needing_review: Object.keys(statuses),
        error_message: "Provider did not return a post-match report yet.",
      });
      return "needs_review" as const;
    }

    const mappings = await loadPlayerMappings(supabase, provider.name, report);
    const aliases = await loadTeamAliases(supabase, [
      match.home_team_code,
      match.away_team_code,
      match.home_country_code,
      match.away_country_code,
      ...report.lineups.map((lineup) => lineup.teamCode),
      ...report.goalEvents.map((event: ProviderGoalEvent) => event.player?.teamCode),
    ]);
    const statuses = validateReport(report, mappings);

    await stageReport(supabase, provider.name, runId, match.id, report, mappings, aliases);
    await applyCanonicalData(supabase, provider.name, match.id, report, mappings, aliases);
    await updateReadiness(supabase, match.id, statuses);

    let scored = false;
    if (statuses.exact_result === "ready") {
      await scoreFinishedMatch(match.id);
      scored = true;

      const readiness = await getMatchBonusReadiness(match.id);
      if (
        readiness?.possessionReady &&
        readiness.scorersReady &&
        readiness.lineupHomeReady &&
        readiness.lineupAwayReady
      ) {
        statuses.possession = "ready";
        statuses.goal_events = "ready";
        statuses.lineup_home = "ready";
        statuses.lineup_away = "ready";
      }
    }

    const reviewCategories = reviewList(statuses);
    await updateSyncState(supabase, match.id, provider.name, runId, statuses, retryCount);
    await finishSyncRun(supabase, runId, {
      status: reviewCategories.length > 0 ? "partial" : "success",
      records_processed: 1,
      records_inserted: 1,
      categories_ready: categoryList(statuses),
      categories_needing_review: reviewCategories,
      confidence: report.confidence ?? null,
    });

    return scored ? "scored" : reviewCategories.length > 0 ? "needs_review" : "skipped";
  } catch (error) {
    await finishSyncRun(supabase, runId, {
      status: "failed",
      error_message: error instanceof Error ? error.message : "Unknown post-match sync error",
    });
    throw error;
  }
}

async function loadEligibleMatches(
  supabase: AdminClient,
  provider: FootballDataProvider,
  matchId?: string,
) {
  const now = new Date();
  const query = supabase
    .from("matches")
    .select(
      "id, kickoff_at, status, home_score, away_score, home_team_code, away_team_code, home_country_code, away_country_code, sync_state:match_provider_sync_state(status,next_sync_after,retry_count), provider_match_mappings(provider_match_id,provider,mapping_status)",
    )
    .in("status", ["scheduled", "live", "in_progress", "completed", "finished"])
    .lte("kickoff_at", now.toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(matchId ? 1 : 25);

  if (matchId) query.eq("id", matchId);

  const { data, error } = await query;
  if (error) throw new Error(`Could not load eligible matches: ${error.message}`);

  return ((data ?? []) as unknown as EligibleMatchRow[]).filter((match) => {
    if (!match.kickoff_at) return false;
    const existingState = firstRelation(match.sync_state);
    if (!matchId && existingState?.next_sync_after && new Date(existingState.next_sync_after) > now) {
      return false;
    }
    if (!matchId && (existingState?.retry_count ?? 0) >= MAX_RETRIES) return false;
    if (!matchId && addMinutes(new Date(match.kickoff_at), EXPECTED_FULL_TIME_MINUTES) > now) {
      return false;
    }
    const providerMapping = firstRelation(match.provider_match_mappings);
    return !providerMapping || providerMapping.provider === provider.name;
  });
}

export async function syncFinishedMatches(
  provider: FootballDataProvider = DEFAULT_PROVIDER,
  matchId?: string,
): Promise<PostMatchSyncResult> {
  const supabase = createAdminClient();
  const matches = await loadEligibleMatches(supabase, provider, matchId);
  const result: PostMatchSyncResult = {
    provider: provider.name,
    processed: 0,
    scored: 0,
    needsReview: 0,
    skipped: 0,
  };

  for (const match of matches) {
    const status = await syncOneMatch(supabase, provider, match);
    result.processed += 1;
    if (status === "scored") result.scored += 1;
    else if (status === "needs_review") result.needsReview += 1;
    else result.skipped += 1;
  }

  return result;
}
