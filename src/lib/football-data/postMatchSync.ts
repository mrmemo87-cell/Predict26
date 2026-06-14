import "server-only";

import { getMatchBonusReadiness } from "@/lib/scoring/bonusReadiness";
import { scoreFinishedMatch } from "@/lib/scoring/matchScoring";
import { createAdminClient } from "@/lib/supabase/admin";
import { openAiWebSearchFootballDataProvider, openAiWebSearchErrorReason } from "./providers/openAiWebSearch";
import type {
  FootballDataProvider,
  FootballProviderName,
  PostMatchSyncResult,
  ProviderGoalEvent,
  ProviderLineupPlayer,
  ProviderPostMatchReport,
  ProviderPostMatchReportCategory,
  ProviderPostMatchReportCategoryStatus,
} from "./providers/types";

type AdminClient = ReturnType<typeof createAdminClient>;

type EligibleMatchRow = {
  id: string;
  competition_id: string | null;
  kickoff_at: string | null;
  status: string | null;
  home_score: number | null;
  away_score: number | null;
  home_team_name: string | null;
  away_team_name: string | null;
  home_team_code: string | null;
  away_team_code: string | null;
  home_country_code: string | null;
  away_country_code: string | null;
  venue: string | null;
  city: string | null;
  sync_state?: Array<{
    status: string | null;
    next_sync_after: string | null;
    exact_result_status?: string | null;
    possession_status?: string | null;
    goal_events_status?: string | null;
    lineup_home_status?: string | null;
    lineup_away_status?: string | null;
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

type CompetitionTeamPlayerRow = {
  id: string;
  team_code: string;
  squad_number: number | null;
  name_on_shirt: string | null;
  player_id: string;
  players: Array<{ display_name: string | null; normalized_name: string | null }> | { display_name: string | null; normalized_name: string | null } | null;
};

type ScoringRunRow = { id: string };

const DEFAULT_PROVIDER = openAiWebSearchFootballDataProvider;
const EXPECTED_FULL_TIME_MINUTES = 120;
const BONUS_RETRY_DELAYS_MINUTES = [15, 30, 60, 6 * 60, 24 * 60] as const;
const MAX_RETRIES = BONUS_RETRY_DELAYS_MINUTES.length;
const POST_MATCH_BATCH_SIZE = 10;
const FINAL_STATUSES = new Set(["completed", "finished"]);
const SCOREABLE_GOAL_TYPES = new Set(["goal", "penalty_goal"]);
const REPORT_CATEGORIES: ProviderPostMatchReportCategory[] = [
  "exact_result",
  "possession",
  "goal_events",
  "lineup_home",
  "lineup_away",
];

const firstRelation = <T>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

const addMinutes = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60_000);

const nextRetryAt = (retryCount: number) => {
  const delay = BONUS_RETRY_DELAYS_MINUTES[Math.min(Math.max(retryCount - 1, 0), BONUS_RETRY_DELAYS_MINUTES.length - 1)];
  return addMinutes(new Date(), delay).toISOString();
};

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

type SyncFailureReason =
  | "openai_api_key_missing"
  | "openai_request_failed"
  | "openai_web_search_no_sources"
  | "openai_extraction_failed"
  | "final_score_missing"
  | "final_score_conflict"
  | "player_mapping_failed"
  | "structured_provider_mapping_missing";

const missingStatuses = () => ({
  exact_result: "missing",
  possession: "missing",
  goal_events: "missing",
  lineup_home: "missing",
  lineup_away: "missing",
});

const reasonMessage = (reason: SyncFailureReason) => {
  const messages: Record<SyncFailureReason, string> = {
    openai_api_key_missing: "openai_api_key_missing: OPENAI_API_KEY is not configured.",
    openai_request_failed: "openai_request_failed: OpenAI web-search request failed.",
    openai_web_search_no_sources: "openai_web_search_no_sources: no trusted sources were found.",
    openai_extraction_failed: "openai_extraction_failed: OpenAI response could not be extracted.",
    final_score_missing: "final_score_missing: no complete final score was found.",
    final_score_conflict: "final_score_conflict: trusted sources conflict on the final score.",
    player_mapping_failed: "player_mapping_failed: player mapping failed; exact result may still be scored.",
    structured_provider_mapping_missing: "structured_provider_mapping_missing: this structured provider needs active match/team/player mappings before sync.",
  };
  return messages[reason];
};


const syncErrorMessage = (reason: SyncFailureReason, error: unknown) =>
  error instanceof Error ? error.message : reasonMessage(reason);

const syncReasonForError = (provider: FootballProviderName, error: unknown): SyncFailureReason => {
  const openAiReason = provider === "google-openai" ? openAiWebSearchErrorReason(error) : null;
  if (openAiReason) return openAiReason;

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("player mapping") || message.includes("provider_player_mappings")) return "player_mapping_failed";
  if (message.includes("conflict") && message.includes("score")) return "final_score_conflict";
  if (message.includes("score")) return "final_score_missing";
  return provider === "google-openai" ? "openai_extraction_failed" : "structured_provider_mapping_missing";
};

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

const metadataRecord = (metadata: unknown): Record<string, unknown> =>
  metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};

const metadataStringArray = (metadata: unknown) =>
  Array.isArray(metadata) ? metadata.filter((item): item is string => typeof item === "string" && item.length > 0) : [];

const normalizePlayerName = (value: string | null | undefined) =>
  value
    ?.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ") ?? "";

const playerNameForRow = (row: CompetitionTeamPlayerRow) => {
  const player = firstRelation(row.players);
  return player?.display_name ?? row.name_on_shirt ?? "";
};

function confidentPlayerMatch(
  rows: CompetitionTeamPlayerRow[],
  playerName: string,
  shirtNumber: number | null | undefined,
) {
  const normalized = normalizePlayerName(playerName);
  if (!normalized) return null;

  const exactMatches = rows.filter((row) => {
    const player = firstRelation(row.players);
    return (
      normalizePlayerName(player?.normalized_name) === normalized ||
      normalizePlayerName(player?.display_name) === normalized ||
      normalizePlayerName(row.name_on_shirt) === normalized
    );
  });
  if (exactMatches.length === 1) return exactMatches[0];

  if (shirtNumber !== null && shirtNumber !== undefined) {
    const numberMatches = rows.filter(
      (row) => row.squad_number === shirtNumber && normalizePlayerName(playerNameForRow(row)).includes(normalized),
    );
    if (numberMatches.length === 1) return numberMatches[0];
  }

  return null;
}

async function ensureReportPlayerMappings(
  supabase: AdminClient,
  provider: FootballProviderName,
  report: ProviderPostMatchReport,
  aliases: Map<string, string>,
) {
  if (provider !== "google-openai") return;

  const refs = [
    ...report.goalEvents
      .map((event) =>
        event.player
          ? {
              externalId: event.player.externalId,
              displayName: event.player.displayName,
              teamCode: event.player.teamCode,
              shirtNumber: event.player.shirtNumber,
            }
          : null,
      )
      .filter(Boolean),
    ...report.lineups.map((lineup) => ({
      externalId: lineup.externalId,
      displayName: lineup.displayName,
      teamCode: lineup.teamCode,
      shirtNumber: lineup.shirtNumber,
    })),
  ] as Array<{ externalId: string; displayName: string; teamCode?: string | null; shirtNumber?: number | null }>;

  const uniqueRefs = [...new Map(refs.map((ref) => [ref.externalId, ref])).values()];
  if (uniqueRefs.length === 0) return;

  const teamCodes = [...new Set(uniqueRefs.map((ref) => normalizeTeamCode(ref.teamCode)).filter(Boolean) as string[])].map(
    (code) => aliases.get(code) ?? code,
  );
  if (teamCodes.length === 0) return;

  const { data, error } = await supabase
    .from("competition_team_players")
    .select("id, team_code, squad_number, name_on_shirt, player_id, players(display_name, normalized_name)")
    .eq("competition_code", "WC2026")
    .eq("is_active", true)
    .in("team_code", teamCodes);

  if (error) throw new Error(`Could not load competition players for provider mapping: ${error.message}`);

  const rows = (data ?? []) as unknown as CompetitionTeamPlayerRow[];
  const rowsByTeam = rows.reduce((map, row) => {
    const list = map.get(row.team_code) ?? [];
    list.push(row);
    map.set(row.team_code, list);
    return map;
  }, new Map<string, CompetitionTeamPlayerRow[]>());

  const upserts = uniqueRefs.flatMap((ref) => {
    const rawTeamCode = normalizeTeamCode(ref.teamCode);
    const teamCode = rawTeamCode ? aliases.get(rawTeamCode) ?? rawTeamCode : null;
    const match = teamCode ? confidentPlayerMatch(rowsByTeam.get(teamCode) ?? [], ref.displayName, ref.shirtNumber) : null;
    if (!teamCode || !match) return [];
    return [
      {
        provider,
        provider_player_id: ref.externalId,
        competition_code: "WC2026",
        team_code: teamCode,
        player_id: match.player_id,
        competition_team_player_id: match.id,
        confidence: 100,
        mapping_status: "active",
        raw_payload: { source: "google_openai_name_match", displayName: ref.displayName, shirtNumber: ref.shirtNumber ?? null },
      },
    ];
  });

  if (upserts.length === 0) return;

  const { error: upsertError } = await supabase
    .from("provider_player_mappings")
    .upsert(upserts, { onConflict: "provider,provider_player_id" });
  if (upsertError) throw new Error(`Could not save provider player mappings: ${upsertError.message}`);
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
  statuses: Record<string, string>,
) {
  if (statuses.exact_result === "ready" && report.isFinal && report.homeScore !== null && report.awayScore !== null) {
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

  if (statuses.possession === "ready") for (const stat of report.possession) {
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

  const scorerEvents = statuses.goal_events === "ready"
    ? report.goalEvents.filter((event) => SCOREABLE_GOAL_TYPES.has(event.eventType))
    : [];
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

  const readyLineups = report.lineups.filter(
    (player) =>
      player.isStarter &&
      ((player.teamSide === "home" && statuses.lineup_home === "ready") ||
        (player.teamSide === "away" && statuses.lineup_away === "ready")),
  );
  for (const lineup of readyLineups) {
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

function providerCategoryStatus(
  report: ProviderPostMatchReport,
  category: ProviderPostMatchReportCategory,
  fallback: ProviderPostMatchReportCategoryStatus,
) {
  const providerStatus = report.categoryStatuses?.[category];
  if (!providerStatus) return fallback;
  return providerStatus === "ready" ? fallback : providerStatus;
}

function validateReport(report: ProviderPostMatchReport, mappings: Map<string, PlayerMappingRow>) {
  const exactReady =
    report.isFinal &&
    FINAL_STATUSES.has(report.status) &&
    report.homeScore !== null &&
    report.awayScore !== null;
  const possessionRows = report.possession.filter((stat) => stat.percent !== null);
  const homePossession = possessionRows.find((stat) => stat.teamSide === "home")?.percent;
  const awayPossession = possessionRows.find((stat) => stat.teamSide === "away")?.percent;
  const possessionTotal = (homePossession ?? 0) + (awayPossession ?? 0);
  const possessionReady =
    possessionRows.length === 2 &&
    typeof homePossession === "number" &&
    typeof awayPossession === "number" &&
    possessionTotal >= 99 &&
    possessionTotal <= 101;
  const scorerEvents = report.goalEvents.filter((event) => SCOREABLE_GOAL_TYPES.has(event.eventType));
  const scorersMapped = scorerEvents.every((event) =>
    event.player?.externalId ? mappings.get(event.player.externalId)?.player_id : false,
  );
  const providerScorersReady = report.categoryStatuses?.goal_events === "ready";
  const scorersReady = providerScorersReady && (scorerEvents.length === 0 || scorersMapped);
  const homeStarters = report.lineups.filter((lineup) => lineup.teamSide === "home" && lineup.isStarter);
  const awayStarters = report.lineups.filter((lineup) => lineup.teamSide === "away" && lineup.isStarter);
  const lineupHomeReady =
    homeStarters.length === 11 && homeStarters.every((lineup) => mappings.get(lineup.externalId)?.player_id);
  const lineupAwayReady =
    awayStarters.length === 11 && awayStarters.every((lineup) => mappings.get(lineup.externalId)?.player_id);

  const fallbackStatuses = {
    exact_result: readinessStatus(exactReady, !report.isFinal || report.homeScore === null || report.awayScore === null),
    possession: readinessStatus(possessionReady, report.possession.length === 0),
    goal_events: readinessStatus(scorersReady, false),
    lineup_home: readinessStatus(lineupHomeReady, homeStarters.length === 0),
    lineup_away: readinessStatus(lineupAwayReady, awayStarters.length === 0),
  } satisfies Record<ProviderPostMatchReportCategory, ProviderPostMatchReportCategoryStatus>;

  return Object.fromEntries(
    REPORT_CATEGORIES.map((category) => [category, providerCategoryStatus(report, category, fallbackStatuses[category])]),
  ) as Record<ProviderPostMatchReportCategory, ProviderPostMatchReportCategoryStatus>;
}

async function updateReadiness(
  supabase: AdminClient,
  matchId: string,
  statuses: Record<string, string>,
) {
  const { error } = await supabase.rpc("set_match_bonus_scoring_readiness", {
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
  reason?: SyncFailureReason,
  warnings: string[] = [],
  extraMetadata: Record<string, unknown> = {},
) {
  const reviewCategories = reviewList(statuses);
  const readyCategories = categoryList(statuses);
  const scoringRunId = await latestScoringRunId(supabase, matchId);
  const status =
    statusOverride ??
    (reviewCategories.length > 0
      ? retryCount >= MAX_RETRIES
        ? "needs_review"
        : statuses.exact_result === "ready"
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
          : nextRetryAt(retryCount),
      retry_count: retryCount,
      metadata: { readyCategories, reviewCategories, reason: retryCount >= MAX_RETRIES && status !== "fully_scored" ? "bonus_waiting_admin_review" : reason ?? null, warnings, retryScheduleMinutes: BONUS_RETRY_DELAYS_MINUTES, ...extraMetadata },
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

  const isOpenAiWebSearch = provider.name === "google-openai";
  const providerMatchId = mapping?.provider_match_id ?? (isOpenAiWebSearch ? match.id : null);

  if (!providerMatchId || !provider.fetchPostMatchReport) {
    const statuses = missingStatuses();
    const reason: SyncFailureReason = isOpenAiWebSearch ? "openai_extraction_failed" : "structured_provider_mapping_missing";
    await updateSyncState(supabase, match.id, provider.name, runId, statuses, retryCount, "needs_review", reason);
    await finishSyncRun(supabase, runId, {
      status: "needs_review",
      records_processed: 0,
      categories_needing_review: Object.keys(statuses),
      error_message: reasonMessage(reason),
      metadata: { reason },
    });
    return "needs_review" as const;
  }

  try {
    const report = await provider.fetchPostMatchReport(providerMatchId, {
      matchId: match.id,
      competitionCode: "WC2026",
      homeTeamName: match.home_team_name,
      awayTeamName: match.away_team_name,
      homeTeamCode: match.home_team_code,
      awayTeamCode: match.away_team_code,
      homeCountryCode: match.home_country_code,
      awayCountryCode: match.away_country_code,
      kickoffAt: match.kickoff_at,
      venue: match.venue,
      city: match.city,
    });
    if (!report) {
      const statuses = missingStatuses();
      const reason: SyncFailureReason = isOpenAiWebSearch ? "openai_web_search_no_sources" : "final_score_missing";
      await updateSyncState(supabase, match.id, provider.name, runId, statuses, retryCount, "awaiting_final_data", reason);
      await finishSyncRun(supabase, runId, {
        status: "needs_review",
        records_processed: 0,
        categories_needing_review: Object.keys(statuses),
        error_message: reasonMessage(reason),
        metadata: { reason },
      });
      return "needs_review" as const;
    }

    const aliases = await loadTeamAliases(supabase, [
      match.home_team_code,
      match.away_team_code,
      match.home_country_code,
      match.away_country_code,
      ...report.lineups.map((lineup: ProviderLineupPlayer) => lineup.teamCode),
      ...report.goalEvents.map((event: ProviderGoalEvent) => event.player?.teamCode),
    ]);
    const warnings: string[] = [];
    try {
      await ensureReportPlayerMappings(supabase, provider.name, report, aliases);
    } catch (error) {
      warnings.push(reasonMessage("player_mapping_failed"));
      console.warn("provider player auto-mapping failed", error);
    }
    let mappings = new Map<string, PlayerMappingRow>();
    try {
      mappings = await loadPlayerMappings(supabase, provider.name, report);
    } catch (error) {
      warnings.push(reasonMessage("player_mapping_failed"));
      console.warn("provider player mapping load failed", error);
    }
    const statuses = validateReport(report, mappings);

    await stageReport(supabase, provider.name, runId, match.id, report, mappings, aliases);
    await applyCanonicalData(supabase, provider.name, match.id, report, mappings, aliases, statuses);

    let readinessUpdated = false;
    try {
      await updateReadiness(supabase, match.id, statuses);
      readinessUpdated = true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Could not update bonus readiness";
      warnings.push(detail);
      console.warn("bonus readiness update failed after exact/result scoring", error);
    }

    if (readinessUpdated) {
      const readiness = await getMatchBonusReadiness(match.id);
      statuses.possession = readiness?.possessionReady ? "ready" : statuses.possession;
      statuses.goal_events = readiness?.scorersReady ? "ready" : statuses.goal_events;
      statuses.lineup_home = readiness?.lineupHomeReady ? "ready" : statuses.lineup_home;
      statuses.lineup_away = readiness?.lineupAwayReady ? "ready" : statuses.lineup_away;
    }

    const exactAlreadyScored = existingState?.exact_result_status === "ready";
    let scored = false;
    const newlyReadyBonus = [
      [statuses.possession, existingState?.possession_status],
      [statuses.goal_events, existingState?.goal_events_status],
      [statuses.lineup_home, existingState?.lineup_home_status],
      [statuses.lineup_away, existingState?.lineup_away_status],
    ].some(([currentStatus, previousStatus]) => currentStatus === "ready" && previousStatus !== "ready");
    if (statuses.exact_result === "ready" && !exactAlreadyScored) {
      await scoreFinishedMatch(match.id);
      scored = true;
    } else if (newlyReadyBonus) {
      await scoreFinishedMatch(match.id);
    }

    const reviewCategories = reviewList(statuses);
    const scoreableScorers = report.goalEvents.filter((event) => SCOREABLE_GOAL_TYPES.has(event.eventType));
    const scorerMetadata = scoreableScorers.map((event) => ({
      name: event.player?.displayName ?? null,
      teamSide: event.teamSide,
      eventType: event.eventType,
      minute: event.minute ?? null,
      stoppageMinute: event.stoppageMinute ?? null,
      penalty: event.eventType === "penalty_goal",
      ownGoal: event.eventType === "own_goal",
      mapped: Boolean(mappedPlayerId(mappings, event.player?.externalId)),
      mappedPlayerId: mappedPlayerId(mappings, event.player?.externalId),
      sources: metadataStringArray(metadataRecord(event.rawPayload).sourceUrls),
      mappingFailure: event.player?.externalId && !mappedPlayerId(mappings, event.player.externalId) ? "missing_player_mapping" : null,
    }));
    const lineupMetadata = (teamSide: "home" | "away") => {
      const starters = report.lineups.filter((lineup) => lineup.teamSide === teamSide && lineup.isStarter);
      const mapped = starters.filter((lineup) => mappedPlayerId(mappings, lineup.externalId));
      return {
        extractedCount: starters.length,
        mappedCount: mapped.length,
        expectedCount: 11,
        unmapped: starters.filter((lineup) => !mappedPlayerId(mappings, lineup.externalId)).map((lineup) => lineup.displayName),
        players: starters.map((lineup) => ({
          name: lineup.displayName,
          mapped: Boolean(mappedPlayerId(mappings, lineup.externalId)),
          mappedPlayerId: mappedPlayerId(mappings, lineup.externalId),
          sources: metadataStringArray(metadataRecord(lineup.rawPayload).sourceUrls),
        })),
      };
    };
    const openAiRawPayload = report.rawPayload as {
      sourceSelection?: {
        selectedSources?: unknown[];
        extractionStatus?: string;
        sourceCapture?: string;
      };
      categoryReasons?: Record<string, string>;
      agreeingSources?: Record<string, string[]>;
      conflictingSources?: Record<string, string[]>;
    } | undefined;
    await updateSyncState(
      supabase,
      match.id,
      provider.name,
      runId,
      statuses,
      retryCount,
      undefined,
      warnings.some((warning) => warning.startsWith("player_mapping_failed")) ? "player_mapping_failed" : undefined,
      warnings,
      {
      sources: openAiRawPayload?.sourceSelection?.selectedSources ?? [],
      extractionStatus: openAiRawPayload?.sourceSelection?.extractionStatus,
      sourceCapture: openAiRawPayload?.sourceSelection?.sourceCapture,
      finalScore: report.homeScore !== null && report.awayScore !== null ? { home: report.homeScore, away: report.awayScore } : null,
      extractedPossession: report.possession,
      extractedScorers: scorerMetadata,
      extractedLineups: {
        home: lineupMetadata("home"),
        away: lineupMetadata("away"),
      },
      categoryReasons: openAiRawPayload?.categoryReasons ?? {},
      agreeingSources: openAiRawPayload?.agreeingSources ?? {},
      conflictingSources: openAiRawPayload?.conflictingSources ?? {},
      exactResultReason: openAiRawPayload?.categoryReasons?.exact_result,
      exactResultScored: statuses.exact_result === "ready",
      exactResultAlreadyScored: exactAlreadyScored,
      bonusScoringTriggered: newlyReadyBonus,
      bonusScoringTriggerReason: newlyReadyBonus ? "new_bonus_category_ready" : "no_new_ready_bonus_category",
      bonusSyncStatus: reviewCategories.length > 0 ? (retryCount >= MAX_RETRIES ? "needs_review" : "retryable") : "complete",
      },
    );
    await finishSyncRun(supabase, runId, {
      status: reviewCategories.length > 0 ? "partial" : "completed",
      records_processed: 1,
      records_inserted: 1,
      categories_ready: categoryList(statuses),
      categories_needing_review: reviewCategories,
      confidence: report.confidence ?? null,
    });

    return scored ? "scored" : reviewCategories.length > 0 ? "needs_review" : "skipped";
  } catch (error) {
    const statuses = missingStatuses();
    const reason = syncReasonForError(provider.name, error);
    const detail = syncErrorMessage(reason, error);
    await updateSyncState(supabase, match.id, provider.name, runId, statuses, retryCount, "needs_review", reason, [detail], { reasonDetails: detail });
    await finishSyncRun(supabase, runId, {
      status: provider.name === "google-openai" ? "needs_review" : "failed",
      records_processed: 0,
      categories_needing_review: Object.keys(statuses),
      error_message: detail,
      metadata: { reason, detail },
    });
    if (provider.name === "google-openai") return "needs_review" as const;
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
      "id, competition_id, kickoff_at, status, home_score, away_score, home_team_name, away_team_name, home_team_code, away_team_code, home_country_code, away_country_code, venue, city, sync_state:match_provider_sync_state(status,next_sync_after,retry_count,exact_result_status,possession_status,goal_events_status,lineup_home_status,lineup_away_status), provider_match_mappings(provider_match_id,provider,mapping_status)",
    )
    .in("status", ["scheduled", "live", "in_progress", "completed", "finished"])
    .not("kickoff_at", "is", null)
    .lte("kickoff_at", addMinutes(now, -EXPECTED_FULL_TIME_MINUTES).toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(matchId ? 1 : 100);

  if (matchId) query.eq("id", matchId);

  const { data, error } = await query;
  if (error) throw new Error(`Could not load eligible matches: ${error.message}`);

  const eligible = ((data ?? []) as unknown as EligibleMatchRow[]).filter((match) => {
    const existingState = firstRelation(match.sync_state);
    if (!matchId && existingState?.next_sync_after && new Date(existingState.next_sync_after) > now) return false;
    if (!matchId && (existingState?.retry_count ?? 0) >= MAX_RETRIES) return false;
    if (
      !matchId &&
      existingState?.status === "fully_scored" &&
      existingState?.exact_result_status === "ready"
    ) return false;
    const providerMapping = firstRelation(match.provider_match_mappings);
    return provider.name === "google-openai" || !providerMapping || providerMapping.provider === provider.name;
  });

  return { eligible, batch: matchId ? eligible : eligible.slice(0, POST_MATCH_BATCH_SIZE) };
}

export async function syncFinishedMatches(
  provider: FootballDataProvider = DEFAULT_PROVIDER,
  matchId?: string,
): Promise<PostMatchSyncResult> {
  const supabase = createAdminClient();
  const { eligible, batch } = await loadEligibleMatches(supabase, provider, matchId);
  const result: PostMatchSyncResult = {
    provider: provider.name,
    eligible: eligible.length,
    processed: 0,
    remaining: Math.max(eligible.length - batch.length, 0),
    scored: 0,
    needsReview: 0,
    failed: 0,
    skipped: 0,
  };

  for (const match of batch) {
    try {
      const status = await syncOneMatch(supabase, provider, match);
      result.processed += 1;
      if (status === "scored") result.scored += 1;
      else if (status === "needs_review") result.needsReview += 1;
      else result.skipped += 1;
    } catch (error) {
      console.error("post-match sync failed for match", { matchId: match.id, error });
      result.processed += 1;
      result.failed += 1;
    }
  }

  return result;
}
