import Link from "next/link";
import PendingSubmitButton from "@/components/PendingSubmitButton";
import MatchTimeBlock from "@/components/matches/MatchTimeBlock";
import { formatUtcMatchTime } from "@/lib/dates/matchTime";
import { requireAdminUser } from "@/lib/admin/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { markMatchSyncReviewed, markReportReviewed, processSyncQueueNow, queueFinishedMatchesBatch, queueMatchSync, retryFailedSyncJobs, saveMatch, scoreMatch, updateBonusReadiness, saveProviderPlayerMapping } from "./actions";
import MatchForm from "./MatchForm";
import { buildFlagLookup, formatFlaggedLabel } from "@/lib/domain/countries";
import { BONUS_READINESS_STATUSES, getMatchBonusReadinessMap, type BonusReadinessCategory, type BonusReadinessDiagnostics } from "@/lib/scoring/bonusReadiness";

type SearchParams = Promise<{
  error?: string;
  saved?: string;
  report_saved?: string;
  scored?: string;
  already_scored?: string;
  bonus_readiness_saved?: string;
  synced?: string;
  queued?: string;
  eligible?: string;
  processed?: string;
  remaining?: string;
  needs_review?: string;
  failed?: string;
  skipped?: string;
  reviewed?: string;
  edit?: string;
}>;

export type CompetitionRow = { id: string; name: string; slug: string };
export type StadiumRow = { id: string; name: string; city: string };
export type MatchRow = {
  id: string;
  competition_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  home_team_code: string | null;
  away_team_code: string | null;
  kickoff_at: string | null;
  status: string | null;
  stadium_id: string | null;
  venue: string | null;
  city: string | null;
  home_score: number | null;
  away_score: number | null;
  match_number: number | null;
  stage: string | null;
  sync_state?: Array<MatchSyncStateRow> | MatchSyncStateRow | null;
  provider_sync_runs?: Array<ProviderSyncRunRow> | ProviderSyncRunRow | null;
  stadiums?:
    | { name: string; city: string }
    | Array<{ name: string; city: string }>
    | null;
};


type MatchSyncStateRow = {
  status: string | null;
  exact_result_status: string | null;
  possession_status: string | null;
  goal_events_status: string | null;
  lineup_home_status: string | null;
  lineup_away_status: string | null;
  last_synced_at: string | null;
  next_sync_after: string | null;
  retry_count: number | null;
  provider: string | null;
  metadata: unknown;
};

type ProviderSyncRunRow = {
  status: string | null;
  started_at: string | null;
  finished_at: string | null;
  categories_ready: string[] | null;
  categories_needing_review: string[] | null;
  error_message: string | null;
  provider: string | null;
  metadata: unknown;
};

type MatchScoringSummary = {
  predictions: number;
  scoredPredictions: number;
  pointsApplied: number;
};

type MatchScoringRunRow = {
  match_id: string | null;
  categories_completed: string[] | null;
  categories_skipped: unknown;
  status: string | null;
  finished_at: string | null;
  metadata: unknown;
};

type MatchScoringRunSummary = {
  completed: string[];
  skipped: Array<{ category: string; reason: string }>;
  status: string;
  finishedAt: string | null;
};

type PredictionScoringRow = {
  match_id: string | null;
  points_awarded: number | null;
  result_points_applied: boolean | null;
};


type AdminSyncJobRow = {
  id: string;
  job_type: string;
  match_id: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
  result: unknown;
};

type ReportRow = {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  matches:
    | {
        home_team_name: string | null;
        away_team_name: string | null;
        kickoff_at: string | null;
      }
    | Array<{
        home_team_name: string | null;
        away_team_name: string | null;
        kickoff_at: string | null;
      }>
    | null;
};

const firstRelation = <T,>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

const formatAdminDate = (value: string | null) => {
  if (!value) return "Time TBA";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time TBA";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const ERROR_MESSAGES: Record<string, string> = {
  score_not_allowed_for_status:
    "Scores can only be saved for live or finished matches.",
  invalid_non_negative_number:
    "Scores and match numbers must be non-negative whole numbers.",
  incomplete_score: "Enter both scores before saving the match.",
  score_required_for_status:
    "Live or finished matches need both scores before saving.",
  invalid_match_status: "Choose a valid match status before saving.",
  missing_match_fields: "Enter both teams and a kickoff time before saving.",
  invalid_kickoff_time: "Enter a valid kickoff time before saving.",
  missing_competition: "Choose a competition before saving.",
  invalid_report: "Choose a valid report update before saving.",
  match_not_scoreable: "Only finished matches with final scores can be scored.",
  scoring_failed: "Could not score this match. Please try again.",
  save_failed:
    "Could not save this match. Please check the form and try again.",
  report_save_failed: "Could not update that report. Please try again.",
  invalid_bonus_readiness: "Choose a valid bonus readiness status before saving.",
  bonus_readiness_failed: "Could not update bonus data readiness. Please try again.",
  sync_failed: "Could not sync provider data. See the match sync panel for the specific provider reason.",
  invalid_sync_review: "Choose a valid match before marking it reviewed.",
  sync_review_failed: "Could not mark this match reviewed. Please try again.",
};

const friendlyError = (error: string) =>
  ERROR_MESSAGES[error] ??
  "Could not save changes. Please check the form and try again.";

const formatPercent = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(2)}%`;

const statusLabel = (status: string | null | undefined) =>
  (status ?? "unreviewed").replaceAll("_", " ");

const readinessMetadata = (readiness: BonusReadinessDiagnostics | undefined) =>
  readiness?.metadata ?? {};

const metadataRecord = (metadata: unknown): Record<string, unknown> => {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }

  return {};
};


const stringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];

const mappedSummary = (items: unknown[], expectedCount?: number) => {
  const mapped = items.filter((item) => metadataRecord(item).mapped === true).length;
  const denominator = expectedCount ?? items.length;
  return `${mapped}/${denominator}`;
};

const categoryReason = (metadata: Record<string, unknown>, category: string, fallback: string | null | undefined) => {
  const reasons = metadataRecord(metadata.categoryReasons);
  return typeof reasons[category] === "string" ? reasons[category] as string : fallback ?? "unreviewed";
};

const categorySources = (metadata: Record<string, unknown>, category: string) => {
  const agreeing = metadataRecord(metadata.agreeingSources);
  return stringArray(agreeing[category]);
};

const readinessStatuses = (readiness: BonusReadinessDiagnostics | undefined) => {
  const metadata = readinessMetadata(readiness);
  const statuses = metadata.readiness_statuses;

  if (statuses && typeof statuses === "object" && !Array.isArray(statuses)) {
    return statuses as Partial<Record<"possession" | "goal_events" | "lineup_home" | "lineup_away", string>>;
  }

  return {};
};

const statusBadgeClasses = (ready: boolean, status: string | null | undefined) => {
  if (ready) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "ready") return "border-amber-200 bg-amber-50 text-amber-800";
  if (!status || status === "unreviewed") return "border-gray-200 bg-white text-gray-500";
  return "border-rose-200 bg-rose-50 text-rose-700";
};

const scoringCategoryLabel = (category: string) => {
  const labels: Record<string, string> = {
    match_exact_result: "Exact result",
    match_possession: "Possession",
    match_scorer: "Scorers",
    match_lineup_home: "Home lineup",
    match_lineup_away: "Away lineup",
  };

  return labels[category] ?? statusLabel(category);
};

type CurrentAdminSyncState = {
  headline: string | null;
  blockers: string[];
  resolvedHistoricalIssues: string[];
};

const currentAdminSyncState = (
  state: MatchSyncStateRow | null,
  run: ProviderSyncRunRow | null,
  latestScoringRun: MatchScoringRunSummary | undefined,
): CurrentAdminSyncState => {
  const blockers: string[] = [
    ["Exact result", state?.exact_result_status],
    ["Possession", state?.possession_status],
    ["Scorers", state?.goal_events_status],
    ["Home XI mapping incomplete", state?.lineup_home_status],
    ["Away XI mapping incomplete", state?.lineup_away_status],
  ].flatMap(([label, status]) => typeof label === "string" && status && status !== "ready" ? [label] : []);
  const lineupBlockers = blockers.filter((blocker) => blocker.includes("XI"));
  const stateMetadata = metadataRecord(state?.metadata);
  const warnings = stringArray(stateMetadata.warnings);
  const scorerCurrentlyReady = state?.goal_events_status === "ready" || latestScoringRun?.completed.includes("match_scorer") === true;
  const historical = [
    ...(typeof run?.error_message === "string" && run.error_message.length > 0 ? [run.error_message] : []),
    ...warnings,
  ].filter((issue) => !(scorerCurrentlyReady && issue.includes("goal_event_apply_failed")));
  const resolvedHistoricalIssues = historical.length < ((run?.error_message ? 1 : 0) + warnings.length)
    ? ["previous goal event upsert failed, resolved after retry", ...historical]
    : historical;

  let headline: string | null = null;
  if (lineupBlockers.length === 2 && blockers.length === 2) headline = "Bonus pending: Home XI and Away XI incomplete";
  else if (lineupBlockers.length > 0 && blockers.every((blocker) => blocker.includes("XI"))) headline = "Lineups pending";
  else if (blockers.length > 0) headline = `Current blocker: ${blockers.join(", ")}`;
  else if (state?.status === "fully_scored") headline = "Fully scored";

  return { headline, blockers, resolvedHistoricalIssues };
};

const syncStatusClasses = (status: string | null | undefined) => {
  if (status === "fully_scored" || status === "final_score_scored") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "bonus_pending" || status === "awaiting_final_data") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "needs_review") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "corrected_rescored") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-gray-200 bg-white text-gray-500";
};

const latestSyncRun = (match: MatchRow) => firstRelation(match.provider_sync_runs);
const syncState = (match: MatchRow) => firstRelation(match.sync_state);
const POST_MATCH_SYNC_MINUTES = 120;

const postMatchReadyAt = (kickoffAt: string | null) => {
  if (!kickoffAt) return null;
  const kickoff = new Date(kickoffAt);
  if (Number.isNaN(kickoff.getTime())) return null;
  return new Date(kickoff.getTime() + POST_MATCH_SYNC_MINUTES * 60_000);
};

const syncEligibility = (match: MatchRow, summary: MatchScoringSummary) => {
  const state = syncState(match);
  const readyAt = postMatchReadyAt(match.kickoff_at);
  const now = new Date();
  const statusAllowed = ["scheduled", "live", "in_progress", "completed", "finished"].includes(match.status ?? "scheduled");
  const exactScored = summary.predictions > 0 && summary.predictions === summary.scoredPredictions;

  if (!readyAt) return { eligible: false, reason: "missing kickoff time", readyAt: null };
  if (readyAt > now) return { eligible: false, reason: `not ready until ${formatAdminDate(readyAt.toISOString())}`, readyAt };
  if (!statusAllowed) return { eligible: false, reason: `raw status ${statusLabel(match.status)} is not syncable`, readyAt };
  if (state?.status === "fully_scored") return { eligible: false, reason: "match fully scored", readyAt };
  if (state?.next_sync_after && new Date(state.next_sync_after) > now) {
    return { eligible: false, reason: `waiting for retry window ${formatAdminDate(state.next_sync_after)}`, readyAt };
  }

  return { eligible: true, reason: exactScored || state?.exact_result_status === "ready" ? "exact result scored; bonus sync retryable" : "kickoff + full time elapsed", readyAt };
};

const operationalStatus = (match: MatchRow, summary: MatchScoringSummary) => {
  const state = syncState(match);
  const kickoff = match.kickoff_at ? new Date(match.kickoff_at) : null;
  const exactScored = summary.predictions > 0 && summary.predictions === summary.scoredPredictions;
  if (exactScored || state?.status === "fully_scored") return state?.status === "bonus_pending" ? "scored · bonus pending" : "scored";
  if (state?.status === "bonus_pending") return "scored · bonus pending";
  if (state?.status === "needs_review") return "needs review";
  if (kickoff && kickoff <= new Date() && match.status === "scheduled") return "kickoff passed · awaiting final data";
  if (kickoff && kickoff <= new Date()) return "awaiting final data";
  return "upcoming";
};

const matchControlGroup = (match: MatchRow, summary: MatchScoringSummary) => {
  const state = syncState(match);
  const kickoffAt = match.kickoff_at ? new Date(match.kickoff_at) : null;
  const hasFinalScore = match.status === "finished" && match.home_score !== null && match.away_score !== null;
  const exactScored = summary.predictions > 0 && summary.predictions === summary.scoredPredictions;

  if (state?.status === "needs_review") return "Needs review";
  if (state?.status === "corrected_rescored") return "Corrected/rescored";
  if (state?.status === "fully_scored") return "Fully scored";
  if (state?.status === "bonus_pending") return "Bonus data pending";
  if (hasFinalScore && exactScored) return "Final score scored";
  if (kickoffAt && kickoffAt <= new Date()) return "Awaiting final data";
  if (match.status === "scheduled") return "Upcoming";
  return "Locked / waiting for match";
};

const scoringRunStatusClasses = (status: string) => {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "partial") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-gray-200 bg-white text-gray-500";
};

const normalizeSkippedCategories = (categoriesSkipped: unknown) =>
  Object.entries(metadataRecord(categoriesSkipped)).map(([category, value]) => {
    const details = metadataRecord(value);
    const reason = typeof details.reason === "string" ? details.reason : "skipped";

    return { category, reason };
  });

function LatestScoringRunSummary({
  summary,
}: {
  summary: MatchScoringRunSummary | undefined;
}) {
  if (!summary) {
    return (
      <p className="mt-2 text-xs font-semibold text-gray-500">
        No scoring run recorded yet.
      </p>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-1 font-bold uppercase tracking-[0.14em] ${scoringRunStatusClasses(summary.status)}`}>
          {statusLabel(summary.status)} scoring run
        </span>
        {summary.finishedAt && (
          <span className="font-semibold text-gray-500">
            {formatAdminDate(summary.finishedAt)}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {summary.completed.map((category) => (
          <span key={category} className="rounded-full border border-emerald-200 bg-white px-2 py-1 font-semibold text-emerald-700">
            ✓ {scoringCategoryLabel(category)}
          </span>
        ))}
        {summary.skipped.map((skip) => (
          <span key={skip.category} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-900">
            Skipped {scoringCategoryLabel(skip.category)}: {statusLabel(skip.reason)}
          </span>
        ))}
      </div>
    </div>
  );
}

function LatestSyncRunSummary({
  state,
  run,
  latestScoringRun,
}: {
  state: MatchSyncStateRow | null;
  run: ProviderSyncRunRow | null;
  latestScoringRun?: MatchScoringRunSummary;
}) {
  const hasSyncState = Boolean(state);
  const stateMetadata = metadataRecord(state?.metadata);
  const runMetadata = metadataRecord(run?.metadata);
  const adminState = currentAdminSyncState(state, run, latestScoringRun);
  const reason = adminState.headline;
  const warnings = Array.isArray(stateMetadata.warnings) ? stateMetadata.warnings.filter((item): item is string => typeof item === "string") : [];
  const sources = Array.isArray(stateMetadata.sources) ? stateMetadata.sources : Array.isArray(runMetadata.sources) ? runMetadata.sources : [];
  const sourceNames = sources
    .map((source) => metadataRecord(source).label ?? metadataRecord(source).host ?? metadataRecord(source).url)
    .filter((source): source is string => typeof source === "string" && source.length > 0);
  const finalScore = metadataRecord(stateMetadata.finalScore);
  const finalScoreText = typeof finalScore.home === "number" && typeof finalScore.away === "number" ? `${finalScore.home}-${finalScore.away}` : null;
  const exactResultReason = typeof stateMetadata.exactResultReason === "string" ? stateMetadata.exactResultReason : null;
  const sourceCapture = typeof stateMetadata.sourceCapture === "string" ? stateMetadata.sourceCapture : null;
  const extractionStatus = typeof stateMetadata.extractionStatus === "string" ? stateMetadata.extractionStatus : null;

  return (
    <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-1 font-bold uppercase tracking-[0.14em] ${syncStatusClasses(state?.status)}`}>
          {hasSyncState ? statusLabel(state?.status ?? "not_started") : "No sync yet"}
        </span>
        {state?.last_synced_at && (
          <span className="font-semibold text-gray-500">
            Latest sync {formatAdminDate(state.last_synced_at)}
          </span>
        )}
        {(state?.provider || run?.provider) && (
          <span className="rounded-full border border-sky-100 bg-sky-50 px-2 py-1 font-semibold text-sky-700">
            Provider {state?.provider ?? run?.provider}
          </span>
        )}
        {run?.status && (
          <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 font-semibold text-gray-600">
            Run {statusLabel(run.status)}
          </span>
        )}
      </div>
      <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Exact", state?.exact_result_status],
          ["Possession", state?.possession_status],
          ["Scorers", state?.goal_events_status],
          ["Home XI", state?.lineup_home_status],
          ["Away XI", state?.lineup_away_status],
        ].map(([label, value]) => (
          <span key={label} className={`rounded-full border px-2 py-1 font-semibold ${statusBadgeClasses(value === "ready", value)}`}>
            {label}: {statusLabel(value)}
          </span>
        ))}
      </div>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        <p className="font-semibold text-gray-600">Exact result: {stateMetadata.exactResultAlreadyScored === true || stateMetadata.exactResultScored === true || state?.exact_result_status === "ready" ? "scored" : statusLabel(state?.exact_result_status)}</p>
        <p className="font-semibold text-gray-600">Bonus sync: {typeof stateMetadata.bonusSyncStatus === "string" ? statusLabel(stateMetadata.bonusSyncStatus) : [state?.possession_status, state?.goal_events_status, state?.lineup_home_status, state?.lineup_away_status].every((status) => status === "ready") ? "complete" : "pending / retryable / needs review"}</p>
      </div>
      {reason && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-900">
          {reason}
        </p>
      )}
      {adminState.blockers.length > 0 && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-900">
          Current blocker: {adminState.blockers.join(", ")}
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 font-semibold text-amber-900">
          {warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
      <div className="mt-2 space-y-1 font-semibold text-gray-600">
        <p>Sources found: {sources.length}{sourceNames.length > 0 ? ` · ${Array.from(new Set(sourceNames)).join(", ")}` : ""}</p>
        {finalScoreText && <p>Extracted final score: {finalScoreText}</p>}
        <p>Exact result scoring: {stateMetadata.exactResultAlreadyScored === true ? "already scored; exact rescore skipped" : stateMetadata.exactResultScored === true ? "scored / ready" : stateMetadata.exactResultScored === false ? "not scored" : state?.exact_result_status === "ready" ? "ready" : statusLabel(state?.exact_result_status)}</p>
        {exactResultReason && <p>Exact result reason: {exactResultReason}</p>}
        {(sourceCapture || extractionStatus) && <p>Source extraction: {[statusLabel(sourceCapture), statusLabel(extractionStatus)].filter(Boolean).join(" · ")}</p>}
      </div>
      {state?.next_sync_after && (
        <p className="mt-2 font-semibold text-amber-800">
          Next post-match retry after {formatAdminDate(state.next_sync_after)} · retry {state.retry_count ?? 0}
        </p>
      )}
      {adminState.resolvedHistoricalIssues.length > 0 && (
        <details className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1">
          <summary className="cursor-pointer font-semibold text-gray-700">Historical resolved issues</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5 font-semibold text-gray-600">
            {adminState.resolvedHistoricalIssues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

type BonusReadinessItem = {
  category: BonusReadinessCategory;
  label: string;
  ready: boolean;
  status: string | null | undefined;
  reason: string | null;
  healthText: string;
  notesName: string;
  details?: string;
};

function BonusDataReadinessPanel({
  matchId,
  readiness,
  state,
  run,
}: {
  matchId: string;
  readiness: BonusReadinessDiagnostics | undefined;
  state: MatchSyncStateRow | null;
  run: ProviderSyncRunRow | null;
}) {
  const stateMetadata = metadataRecord(state?.metadata);
  const runMetadata = metadataRecord(run?.metadata);
  const syncMetadata = Object.keys(stateMetadata).length > 0 ? stateMetadata : runMetadata;
  const extractedPossession = Array.isArray(syncMetadata.extractedPossession) ? syncMetadata.extractedPossession : [];
  const extractedScorers = Array.isArray(syncMetadata.extractedScorers) ? syncMetadata.extractedScorers : [];
  const scorerMapping = metadataRecord(syncMetadata.scorerMapping);
  const extractedLineups = metadataRecord(syncMetadata.extractedLineups);
  const homeLineupSummary = Object.keys(metadataRecord(syncMetadata.homeLineup)).length > 0 ? metadataRecord(syncMetadata.homeLineup) : metadataRecord(extractedLineups.home);
  const awayLineupSummary = Object.keys(metadataRecord(syncMetadata.awayLineup)).length > 0 ? metadataRecord(syncMetadata.awayLineup) : metadataRecord(extractedLineups.away);
  const homeLineups = Array.isArray(homeLineupSummary.players) ? homeLineupSummary.players : Array.isArray(extractedLineups.home) ? extractedLineups.home : [];
  const awayLineups = Array.isArray(awayLineupSummary.players) ? awayLineupSummary.players : Array.isArray(extractedLineups.away) ? extractedLineups.away : [];
  const homeUnmapped = stringArray(homeLineupSummary.unmapped);
  const awayUnmapped = stringArray(awayLineupSummary.unmapped);
  const statuses = readinessStatuses(readiness);
  const items: BonusReadinessItem[] = [
    {
      category: "possession",
      label: "Possession",
      ready: readiness?.possessionReady ?? false,
      status: statuses.possession,
      reason: readiness?.possessionSkipReason ?? "unreviewed",
      healthText: `Rows H/A ${readiness?.possessionHomeRows ?? 0}/${readiness?.possessionAwayRows ?? 0} · Values ${formatPercent(readiness?.possessionHomePercent ?? null)}/${formatPercent(readiness?.possessionAwayPercent ?? null)}`,
      notesName: "possession notes",
      details: extractedPossession.map((item) => { const row = metadataRecord(item); return `${statusLabel(typeof row.teamSide === "string" ? row.teamSide : null)} ${formatPercent(typeof row.percent === "number" ? row.percent : null)}`; }).join(" · "),
    },
    {
      category: "goal_events",
      label: "Scorers/events",
      ready: readiness?.scorersReady ?? false,
      status: statuses.goal_events,
      reason: categoryReason(syncMetadata, "goal_events", readiness?.scorersSkipReason),
      healthText: `Extracted ${scorerMapping.extractedCount ?? extractedScorers.length} · mapped ${scorerMapping.mappedCount ?? mappedSummary(extractedScorers)} · ${readiness?.normalGoalEventsCount ?? 0} canonical normal/penalty goal events`,
      notesName: "scorer/event notes",
      details: [
        extractedScorers.length > 0 ? extractedScorers.map((item) => { const row = metadataRecord(item); return `${row.name ?? "Unknown"}${row.mapped ? " ✓" : " (mapping review)"}${row.minute ? ` ${row.minute}'` : ""}`; }).join(", ") : "No extracted scorer names stored",
        stringArray(scorerMapping.unmapped).length > 0 ? `Unmapped: ${stringArray(scorerMapping.unmapped).join(", ")}` : "",
        categorySources(syncMetadata, "goal_events").length > 0 ? `Sources: ${categorySources(syncMetadata, "goal_events").join(", ")}` : "",
      ].filter(Boolean).join(" · "),
    },
    {
      category: "lineup_home",
      label: "Home lineup",
      ready: readiness?.lineupHomeReady ?? false,
      status: statuses.lineup_home,
      reason: categoryReason(syncMetadata, "lineup_home", readiness?.lineupHomeSkipReason),
      healthText: `Extracted ${homeLineupSummary.extractedCount ?? homeLineups.length}/11 · mapped ${homeLineupSummary.mappedCount ?? homeLineups.filter((item) => metadataRecord(item).mapped === true).length}/11`,
      notesName: "home lineup notes",
      details: [
        homeLineups.map((item) => { const row = metadataRecord(item); return `${row.name ?? "Unknown"}${row.mapped ? " ✓" : ` (${row.mappingFailure ?? "mapping review"})`}`; }).join(", "),
        homeUnmapped.length > 0 ? `Unmapped: ${homeUnmapped.join(", ")}` : "",
        categorySources(syncMetadata, "lineup_home").length > 0 ? `Sources: ${categorySources(syncMetadata, "lineup_home").join(", ")}` : "",
      ].filter(Boolean).join(" · "),
    },
    {
      category: "lineup_away",
      label: "Away lineup",
      ready: readiness?.lineupAwayReady ?? false,
      status: statuses.lineup_away,
      reason: categoryReason(syncMetadata, "lineup_away", readiness?.lineupAwaySkipReason),
      healthText: `Extracted ${awayLineupSummary.extractedCount ?? awayLineups.length}/11 · mapped ${awayLineupSummary.mappedCount ?? awayLineups.filter((item) => metadataRecord(item).mapped === true).length}/11`,
      notesName: "away lineup notes",
      details: [
        awayLineups.map((item) => { const row = metadataRecord(item); return `${row.name ?? "Unknown"}${row.mapped ? " ✓" : ` (${row.mappingFailure ?? "mapping review"})`}`; }).join(", "),
        awayUnmapped.length > 0 ? `Unmapped: ${awayUnmapped.join(", ")}` : "",
        categorySources(syncMetadata, "lineup_away").length > 0 ? `Sources: ${categorySources(syncMetadata, "lineup_away").join(", ")}` : "",
      ].filter(Boolean).join(" · "),
    },
  ];

  return (
    <details className="mt-3 rounded-2xl border border-gray-200 bg-white p-3 text-sm" open={false}>
      <summary className="cursor-pointer list-none font-bold text-gray-800">
        <span>Bonus Data Readiness</span>
        <span className="ml-2 text-xs font-semibold text-gray-500">controls bonus scoring eligibility</span>
      </summary>
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {items.map((item) => (
          <div key={item.category} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold text-gray-900">{item.label}</p>
                <p className="text-xs text-gray-500">{item.healthText}</p>
                {(item.details || (!item.ready && item.status !== "ready")) && (
                  <p className="mt-1 max-w-xl text-xs font-semibold text-gray-600">
                    Details: {item.details || item.reason || "No extraction details stored"}
                  </p>
                )}
              </div>
              <span className={`rounded-full border px-2 py-1 text-[0.65rem] font-bold uppercase tracking-[0.14em] ${statusBadgeClasses(item.ready, item.status)}`}>
                {item.ready ? "ready" : statusLabel(item.status)}
              </span>
            </div>
            {!item.ready && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">
                Not scoreable yet: {statusLabel(item.reason)}
              </p>
            )}
            {(item.category === "lineup_home" || item.category === "lineup_away") && (
              <div className="mt-2 space-y-2">
                <p className="text-xs font-semibold text-gray-500">
                  Diagnostics: team code used for extraction {String((item.category === "lineup_home" ? homeLineupSummary.teamCodeUsedForExtraction : awayLineupSummary.teamCodeUsedForExtraction) ?? "—")} · canonical squad lookup {String((item.category === "lineup_home" ? homeLineupSummary.canonicalSquadTeamCode : awayLineupSummary.canonicalSquadTeamCode) ?? "—")} · squad players {String((item.category === "lineup_home" ? homeLineupSummary.squadPlayerCount : awayLineupSummary.squadPlayerCount) ?? 0)}
                </p>
                {(item.category === "lineup_home" ? homeLineups : awayLineups).filter((lineup) => metadataRecord(lineup).mapped !== true).map((lineup) => {
                  const row = metadataRecord(lineup);
                  const suggestions = Array.isArray(row.suggestions) ? row.suggestions.map(metadataRecord) : [];
                  return (
                    <form key={String(row.providerPlayerId ?? row.name)} action={saveProviderPlayerMapping} className="rounded-lg border border-amber-100 bg-white p-2 text-xs">
                      <input type="hidden" name="match_id" value={matchId} />
                      <input type="hidden" name="provider" value={state?.provider ?? "google-openai"} />
                      <input type="hidden" name="provider_player_id" value={String(row.providerPlayerId ?? "")} />
                      <input type="hidden" name="team_code" value={String(row.teamCode ?? "")} />
                      <p className="font-bold text-gray-800">{String(row.name ?? "Unknown player")} · {String(row.mappingFailure ?? "mapping review")}</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <select name="competition_team_player_id" className="min-w-48 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700">
                          {suggestions.length === 0 && <option value="">No confident suggestions</option>}
                          {suggestions.map((suggestion) => (
                            <option key={String(suggestion.competitionTeamPlayerId)} value={String(suggestion.competitionTeamPlayerId)}>
                              {String(suggestion.displayName)} · {String(suggestion.confidence)}% · {String(suggestion.reason)}
                            </option>
                          ))}
                        </select>
                        <PendingSubmitButton idleText="Save mapping" pendingText="Saving..." className="rounded-full bg-gray-900 px-3 py-2 text-xs font-bold text-white" />
                      </div>
                    </form>
                  );
                })}
              </div>
            )}
            {item.status === "ready" && !item.ready && (
              <p className="mt-2 text-xs font-semibold text-rose-700">
                Marked ready, but required match data still needs attention.
              </p>
            )}
            <form action={updateBonusReadiness} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="match_id" value={matchId} />
              <input type="hidden" name="category" value={item.category} />
              <select name="status" defaultValue={item.status ?? "unreviewed"} className="min-w-32 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700">
                {BONUS_READINESS_STATUSES.map((status) => (
                  <option key={status} value={status}>{statusLabel(status)}</option>
                ))}
              </select>
              <input
                name="notes"
                placeholder={item.notesName}
                className="min-w-0 flex-1 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700"
              />
              <PendingSubmitButton
                idleText="Save status"
                pendingText="Saving..."
                className="rounded-full bg-gray-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-gold hover:text-black"
              />
            </form>
          </div>
        ))}
      </div>
    </details>
  );
}

export default async function AdminMatchManagerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  await requireAdminUser("/admin/matches");

  const supabase = createAdminClient();
  const [
    { data: competitions },
    { data: stadiums },
    { data: matches },
    { data: reports },
    { data: countries },
    { data: syncJobs },
  ] = await Promise.all([
    supabase
      .from("competitions")
      .select("id, name, slug")
      .order("created_at", { ascending: true }),
    supabase
      .from("stadiums")
      .select("id, name, city")
      .order("name", { ascending: true }),
    supabase
      .from("matches")
      .select(
        "id, competition_id, home_team_name, away_team_name, home_team_code, away_team_code, kickoff_at, status, stadium_id, venue, city, home_score, away_score, match_number, stage, stadiums(name, city), sync_state:match_provider_sync_state(provider,status,exact_result_status,possession_status,goal_events_status,lineup_home_status,lineup_away_status,last_synced_at,next_sync_after,retry_count,metadata), provider_sync_runs(provider,status,started_at,finished_at,categories_ready,categories_needing_review,error_message,metadata)",
      )
      .order("kickoff_at", { ascending: true, nullsFirst: false })
      .limit(100),
    supabase
      .from("wrong_match_reports")
      .select(
        "id, reason, details, status, created_at, matches(home_team_name, away_team_name, kickoff_at)",
      )
      .in("status", ["open", "reviewed"])
      .order("created_at", { ascending: false })
      .limit(25),
    supabase.from("countries").select("code, flag_emoji"),
    supabase
      .from("admin_sync_jobs")
      .select("id, job_type, match_id, status, attempts, max_attempts, error_code, error_message, created_at, started_at, finished_at, updated_at, result")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const competitionRows = (competitions ?? []) as CompetitionRow[];
  const stadiumRows = (stadiums ?? []) as StadiumRow[];
  const matchRows = (matches ?? []) as unknown as MatchRow[];
  const flagLookup = buildFlagLookup(countries);
  const matchIds = matchRows.map((match) => match.id);
  const [
    { data: predictionScoringRows },
    { data: scoringRunRows },
    bonusReadinessByMatchId,
  ] = await Promise.all([
    matchIds.length > 0
      ? supabase
          .from("predictions")
          .select("match_id, points_awarded, result_points_applied")
          .in("match_id", matchIds)
      : Promise.resolve({ data: [] }),
    matchIds.length > 0
      ? supabase
          .from("scoring_runs")
          .select("match_id, categories_completed, categories_skipped, status, finished_at, metadata")
          .eq("scope_type", "match")
          .eq("source", "score_finished_match")
          .in("match_id", matchIds)
          .order("finished_at", { ascending: false, nullsFirst: false })
          .order("started_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    getMatchBonusReadinessMap(matchIds),
  ]);
  const scoringSummaries = (
    (predictionScoringRows ?? []) as PredictionScoringRow[]
  ).reduce<Record<string, MatchScoringSummary>>((summaries, prediction) => {
    if (!prediction.match_id) return summaries;

    const summary = summaries[prediction.match_id] ?? {
      predictions: 0,
      scoredPredictions: 0,
      pointsApplied: 0,
    };
    summary.predictions += 1;

    if (prediction.result_points_applied) {
      summary.scoredPredictions += 1;
      summary.pointsApplied += prediction.points_awarded ?? 0;
    }

    summaries[prediction.match_id] = summary;
    return summaries;
  }, {});
  const latestScoringRuns = ((scoringRunRows ?? []) as MatchScoringRunRow[]).reduce<
    Record<string, MatchScoringRunSummary>
  >((runsByMatchId, run) => {
    if (!run.match_id || runsByMatchId[run.match_id]) return runsByMatchId;

    runsByMatchId[run.match_id] = {
      completed: run.categories_completed ?? [],
      skipped: normalizeSkippedCategories(run.categories_skipped),
      status: run.status ?? "started",
      finishedAt: run.finished_at,
    };

    return runsByMatchId;
  }, {});
  const reportRows = (reports ?? []) as unknown as ReportRow[];
  const jobRows = (syncJobs ?? []) as AdminSyncJobRow[];
  const editingMatch =
    matchRows.find((match) => match.id === params.edit) ?? null;
  const defaultCompetitionId =
    editingMatch?.competition_id ?? competitionRows[0]?.id ?? "";
  const exactScoredCount = matchRows.filter((match) => {
    const summary = scoringSummaries[match.id] ?? { predictions: 0, scoredPredictions: 0, pointsApplied: 0 };
    return summary.predictions > 0 && summary.predictions === summary.scoredPredictions;
  }).length;
  const fullyScoredCount = matchRows.filter((match) => syncState(match)?.status === "fully_scored").length;
  const bonusPendingCount = matchRows.filter((match) => syncState(match)?.status === "bonus_pending").length;
  const reviewCount = matchRows.filter((match) => syncState(match)?.status === "needs_review").length;
  const failedJobCount = jobRows.filter((job) => job.status === "failed").length;
  const runningJobCount = jobRows.filter((job) => job.status === "running" || job.status === "queued").length;
  const nextRetry = matchRows
    .map((match) => syncState(match)?.next_sync_after)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
  const playedCount = matchRows.filter((match) => match.status === "finished" || Boolean(postMatchReadyAt(match.kickoff_at) && postMatchReadyAt(match.kickoff_at)! <= new Date())).length;
  const attentionMatches = matchRows.filter((match) => {
    const summary = scoringSummaries[match.id] ?? { predictions: 0, scoredPredictions: 0, pointsApplied: 0 };
    const state = syncState(match);
    const exactScored = summary.predictions > 0 && summary.predictions === summary.scoredPredictions;
    const readyAt = postMatchReadyAt(match.kickoff_at);
    const finalMissingLate = readyAt !== null && readyAt <= new Date() && (match.home_score === null || match.away_score === null);
    return Boolean(finalMissingLate || (!exactScored && match.status === "finished") || state?.status === "needs_review" || state?.status === "bonus_pending");
  }).slice(0, 12);

  return (
    <main className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex gap-4 text-sm">
              <Link
                href="/admin"
                className="text-gray-400 transition hover:text-gold"
              >
                ← Admin Dashboard
              </Link>
              <Link
                href="/dashboard"
                className="text-gray-400 transition hover:text-gold"
              >
                Main Dashboard
              </Link>
            </div>
            <h1 className="mt-3 text-3xl font-bold text-gray-900 sm:text-5xl">
              Admin Command Center
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Add or edit fixtures, assign stadiums, update kickoff times,
              adjust status and score, review wrong match reports, and handle
              post-match provider sync exceptions. Normal finished matches score automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={queueFinishedMatchesBatch}>
              <PendingSubmitButton idleText="Queue next eligible batch" pendingText="Queueing..." className="w-fit rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold transition hover:bg-gold hover:text-black" />
            </form>
            <form action={processSyncQueueNow}>
              <PendingSubmitButton idleText="Process queue now" pendingText="Processing 1–2..." className="w-fit rounded-full bg-gray-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-gold hover:text-black" />
            </form>
            <form action={retryFailedSyncJobs}>
              <PendingSubmitButton idleText="Retry failed jobs" pendingText="Queueing..." className="w-fit rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-700" />
            </form>
          </div>
        </header>

        {params.saved && (
          <div className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
            Match saved.
          </div>
        )}
        {params.report_saved && (
          <div className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
            Report updated.
          </div>
        )}
        {params.scored && (
          <div className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
            Match scored successfully.
          </div>
        )}
        {params.bonus_readiness_saved && (
          <div className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
            Bonus data readiness saved. Future scoring runs will use the updated eligibility state.
          </div>
        )}
        {params.synced && (
          <div className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
            Post-match provider sync processed {params.processed ?? "0"} of {params.eligible ?? "0"} eligible matches. Scored exact {params.scored ?? "0"}; needs review {params.needs_review ?? "0"}; failed {params.failed ?? "0"}; skipped {params.skipped ?? "0"}; remaining {params.remaining ?? "0"}.
          </div>
        )}
        {params.queued && (
          <div className="mb-5 rounded-2xl border border-sky-300 bg-sky-50 p-4 text-sm text-sky-700">
            Queued {params.queued} sync job(s). {params.remaining ? `${params.remaining} eligible match(es) remain for a later batch.` : "Use Process queue now to run a small worker batch."}
          </div>
        )}
        {params.reviewed && (
          <div className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
            Match marked reviewed. You can rescore after any manual correction.
          </div>
        )}
        {params.already_scored && (
          <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            This match has already been scored.
          </div>
        )}
        {params.error && (
          <div className="mb-5 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
            {friendlyError(params.error)}
          </div>
        )}

        <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Matches played", playedCount],
            ["Exact results scored", exactScoredCount],
            ["Fully scored", fullyScoredCount],
            ["Bonus pending", bonusPendingCount],
            ["Waiting admin review", reviewCount],
            ["Failed syncs", failedJobCount],
            ["Sync queue running", runningJobCount],
            ["Next scheduled retry", nextRetry ? formatAdminDate(nextRetry) : "—"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">{label}</p>
              <p className="mt-2 text-2xl font-black text-gray-900">{value}</p>
            </div>
          ))}
        </section>

        <section className="mb-8 rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-bold text-gray-900">What needs my attention?</h2>
          <div className="mt-4 space-y-3">
            {attentionMatches.map((match) => {
              const state = syncState(match);
              const summary = scoringSummaries[match.id] ?? { predictions: 0, scoredPredictions: 0, pointsApplied: 0 };
              const exactScored = summary.predictions > 0 && summary.predictions === summary.scoredPredictions;
              const problem = state?.status === "needs_review" ? metadataRecord(state.metadata).reason ?? "waiting admin review" : state?.status === "bonus_pending" ? "bonus categories pending" : !exactScored && match.status === "finished" ? "exact result not scored" : "final score missing after kickoff + 120 min";
              return (
                <article key={match.id} className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900">{match.home_team_name ?? "Team TBA"} vs {match.away_team_name ?? "Team TBA"}</h3>
                    <p className="text-sm font-semibold text-amber-900">Problem: {statusLabel(String(problem))}</p>
                    <p className="text-sm text-gray-600">Suggested action: exact score can be scored independently; retry only the pending bonus categories or open manual review for mapping/data issues.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={queueMatchSync}><input type="hidden" name="match_id" value={match.id} /><input type="hidden" name="job_type" value="score_match" /><PendingSubmitButton idleText="Score exact now" pendingText="Queueing..." className="rounded-full bg-emerald-600 px-3 py-2 text-xs font-bold text-white" /></form>
                    <form action={queueMatchSync}><input type="hidden" name="match_id" value={match.id} /><input type="hidden" name="job_type" value="sync_match_bonus" /><PendingSubmitButton idleText="Retry bonus" pendingText="Queueing..." className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700" /></form>
                    <Link href={`/admin/matches?edit=${match.id}`} className="rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700">Manual review</Link>
                  </div>
                </article>
              );
            })}
            {attentionMatches.length === 0 && <p className="text-sm font-semibold text-amber-900">No action-needed matches in the current window.</p>}
          </div>
        </section>

        <section className="mb-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-bold text-gray-900">
            {editingMatch ? "Edit match" : "Add match"}
          </h2>
          <MatchForm
            competitions={competitionRows}
            stadiums={stadiumRows}
            editingMatch={editingMatch}
            defaultCompetitionId={defaultCompetitionId}
            saveAction={saveMatch}
          />
        </section>

        <section className="mb-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-bold text-gray-900">
            Match control
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Grouped operational state for post-match sync, scoring, bonus readiness, and exception review.
          </p>
          <div className="mt-6 space-y-3">
            {matchRows.map((match) => {
              const scoringSummary = scoringSummaries[match.id] ?? {
                predictions: 0,
                scoredPredictions: 0,
                pointsApplied: 0,
              };
              const isScored =
                scoringSummary.predictions > 0 &&
                scoringSummary.predictions === scoringSummary.scoredPredictions;
              const isScoreable =
                match.status === "finished" &&
                match.home_score !== null &&
                match.away_score !== null;
              const controlGroup = matchControlGroup(match, scoringSummary);
              const eligibility = syncEligibility(match, scoringSummary);
              const opStatus = operationalStatus(match, scoringSummary);
              const state = syncState(match);
              const run = latestSyncRun(match);
              const homeLabel = formatFlaggedLabel(
                match.home_team_name,
                match.home_team_code,
                flagLookup,
              );
              const awayLabel = formatFlaggedLabel(
                match.away_team_name,
                match.away_team_code,
                flagLookup,
              );

              return (
                <article
                  key={match.id}
                  className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="text-xs">
                      <MatchTimeBlock
                        kickoffAt={match.kickoff_at}
                        status={match.status}
                        venue={match.venue ?? firstRelation(match.stadiums)?.name ?? null}
                        city={match.city ?? firstRelation(match.stadiums)?.city ?? null}
                        compact
                        countdownLabel="Kickoff in"
                        className="space-y-1"
                      />
                      <p className="mt-1 uppercase tracking-[0.2em] text-gray-500">
                        UTC: {formatUtcMatchTime(match.kickoff_at)} · Raw DB status: {match.status ?? "scheduled"}
                      </p>
                    </div>
                    <h3 className="mt-1 text-lg font-bold text-gray-900">
                      {homeLabel} vs {awayLabel}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Score: {match.home_score ?? "—"} -{" "}
                      {match.away_score ?? "—"} · Stadium:{" "}
                      {firstRelation(match.stadiums)?.name ??
                        match.venue ??
                        "Unassigned"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className={`rounded-full border px-2 py-1 font-bold uppercase tracking-[0.14em] ${syncStatusClasses(state?.status)}`}>
                        {controlGroup}
                      </span>
                      <span className="rounded-full border border-sky-100 bg-white px-2 py-1 font-semibold text-sky-700">
                        Operational: {opStatus}
                      </span>
                      <span className={`rounded-full border px-2 py-1 font-semibold ${eligibility.eligible ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                        Eligible for sync: {eligibility.eligible ? "yes" : `no · ${eligibility.reason}`}
                      </span>
                      <span className="rounded-full border border-gray-200 bg-white px-2 py-1 font-semibold text-gray-600">
                        {isScored ? "Scored" : "Not scored"} · Predictions {scoringSummary.predictions} · Points {scoringSummary.pointsApplied}
                      </span>
                    </div>
                    <LatestSyncRunSummary state={state} run={run} latestScoringRun={latestScoringRuns[match.id]} />
                    {match.status === "finished" && (
                      <>
                        <LatestScoringRunSummary summary={latestScoringRuns[match.id]} />
                        <BonusDataReadinessPanel
                          matchId={match.id}
                          readiness={bonusReadinessByMatchId[match.id]}
                          state={state}
                          run={run}
                        />
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <form action={queueMatchSync}>
                      <input type="hidden" name="match_id" value={match.id} />
                      <input type="hidden" name="job_type" value="sync_match_full" />
                      <PendingSubmitButton
                        idleText="Queue sync"
                        pendingText="Queueing..."
                        className="w-fit rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-bold text-sky-700 transition hover:border-sky-400"
                      />
                    </form>
                    <form action={queueMatchSync}>
                      <input type="hidden" name="match_id" value={match.id} />
                      <input type="hidden" name="job_type" value="sync_match_exact" />
                      <PendingSubmitButton idleText="Queue exact-only sync" pendingText="Queueing..." className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700" />
                    </form>
                    <form action={queueMatchSync}>
                      <input type="hidden" name="match_id" value={match.id} />
                      <input type="hidden" name="job_type" value="sync_match_bonus" />
                      <PendingSubmitButton idleText="Queue bonus sync" pendingText="Queueing..." className="w-fit rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800" />
                    </form>
                    {isScoreable && (
                      <form action={scoreMatch}>
                        <input type="hidden" name="match_id" value={match.id} />
                        <PendingSubmitButton
                          idleText="Score/rescore"
                          pendingText="Scoring..."
                          className="w-fit rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700"
                        />
                      </form>
                    )}
                    <form action={markMatchSyncReviewed}>
                      <input type="hidden" name="match_id" value={match.id} />
                      <PendingSubmitButton
                        idleText="Mark reviewed"
                        pendingText="Saving..."
                        className="w-fit rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:border-sky-400 hover:text-sky-700"
                      />
                    </form>
                    <Link
                      href={`/admin/matches?edit=${match.id}`}
                      className="w-fit rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:border-gold hover:text-gold"
                    >
                      Manual review/edit
                    </Link>
                  </div>
                </article>
              );
            })}
            {matchRows.length === 0 && (
              <p className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                No matches found.
              </p>
            )}
          </div>
        </section>

        <section
          id="wrong-match-reports"
          className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <h2 className="text-2xl font-bold text-gray-900">
            Wrong match reports
          </h2>
          <div className="mt-6 space-y-3">
            {reportRows.map((report) => (
              <article
                key={report.id}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                      {report.status} · {formatAdminDate(report.created_at)}
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-gray-900">
                      {firstRelation(report.matches)?.home_team_name ??
                        "Team TBA"}{" "}
                      vs{" "}
                      {firstRelation(report.matches)?.away_team_name ??
                        "Team TBA"}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-gray-700">
                      {report.reason}
                    </p>
                    {report.details && (
                      <p className="mt-1 text-sm text-gray-500">
                        {report.details}
                      </p>
                    )}
                  </div>
                  <form action={markReportReviewed} className="flex gap-2">
                    <input type="hidden" name="report_id" value={report.id} />
                    <select
                      name="report_status"
                      defaultValue="reviewed"
                      className="rounded-full border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                    >
                      <option value="reviewed">Reviewed</option>
                      <option value="resolved">Resolved</option>
                      <option value="dismissed">Dismissed</option>
                    </select>
                    <PendingSubmitButton
                      idleText="Update report"
                      pendingText="Updating..."
                      className="rounded-full bg-gold px-4 py-2 text-sm font-bold text-black"
                    />
                  </form>
                </div>
              </article>
            ))}
            {reportRows.length === 0 && (
              <p className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                No open reports.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
