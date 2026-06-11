import Link from "next/link";
import PendingSubmitButton from "@/components/PendingSubmitButton";
import MatchTimeBlock from "@/components/matches/MatchTimeBlock";
import { formatUtcMatchTime } from "@/lib/dates/matchTime";
import { requireAdminUser } from "@/lib/admin/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { markMatchSyncReviewed, markReportReviewed, saveMatch, scoreMatch, syncFinishedMatchesNow, syncMatchNow, updateBonusReadiness } from "./actions";
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
};

type ProviderSyncRunRow = {
  status: string | null;
  started_at: string | null;
  finished_at: string | null;
  categories_ready: string[] | null;
  categories_needing_review: string[] | null;
  error_message: string | null;
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
  sync_failed: "Could not sync provider data. Check mappings and try again.",
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

const syncStatusClasses = (status: string | null | undefined) => {
  if (status === "fully_scored" || status === "final_score_scored") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "bonus_pending" || status === "awaiting_final_data") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "needs_review") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "corrected_rescored") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-gray-200 bg-white text-gray-500";
};

const latestSyncRun = (match: MatchRow) => firstRelation(match.provider_sync_runs);
const syncState = (match: MatchRow) => firstRelation(match.sync_state);

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
}: {
  state: MatchSyncStateRow | null;
  run: ProviderSyncRunRow | null;
}) {
  const hasSyncState = Boolean(state);

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
      {state?.next_sync_after && (
        <p className="mt-2 font-semibold text-amber-800">
          Next post-match retry after {formatAdminDate(state.next_sync_after)} · retry {state.retry_count ?? 0}
        </p>
      )}
      {run?.error_message && (
        <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 font-semibold text-rose-700">
          Needs review: {run.error_message}
        </p>
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
};

function BonusDataReadinessPanel({
  matchId,
  readiness,
}: {
  matchId: string;
  readiness: BonusReadinessDiagnostics | undefined;
}) {
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
    },
    {
      category: "goal_events",
      label: "Scorers/events",
      ready: readiness?.scorersReady ?? false,
      status: statuses.goal_events,
      reason: readiness?.scorersSkipReason ?? "unreviewed",
      healthText: `${readiness?.normalGoalEventsCount ?? 0} normal goal events`,
      notesName: "scorer/event notes",
    },
    {
      category: "lineup_home",
      label: "Home lineup",
      ready: readiness?.lineupHomeReady ?? false,
      status: statuses.lineup_home,
      reason: readiness?.lineupHomeSkipReason ?? "unreviewed",
      healthText: `${readiness?.officialHomeStartersCount ?? 0}/11 mapped starters`,
      notesName: "home lineup notes",
    },
    {
      category: "lineup_away",
      label: "Away lineup",
      ready: readiness?.lineupAwayReady ?? false,
      status: statuses.lineup_away,
      reason: readiness?.lineupAwaySkipReason ?? "unreviewed",
      healthText: `${readiness?.officialAwayStartersCount ?? 0}/11 mapped starters`,
      notesName: "away lineup notes",
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
          <form key={item.category} action={updateBonusReadiness} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <input type="hidden" name="match_id" value={matchId} />
            <input type="hidden" name="category" value={item.category} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-bold text-gray-900">{item.label}</p>
                <p className="text-xs text-gray-500">{item.healthText}</p>
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
            {item.status === "ready" && !item.ready && (
              <p className="mt-2 text-xs font-semibold text-rose-700">
                Marked ready, but required match data still needs attention.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
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
            </div>
          </form>
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
        "id, competition_id, home_team_name, away_team_name, home_team_code, away_team_code, kickoff_at, status, stadium_id, venue, city, home_score, away_score, match_number, stage, stadiums(name, city), sync_state:match_provider_sync_state(status,exact_result_status,possession_status,goal_events_status,lineup_home_status,lineup_away_status,last_synced_at,next_sync_after,retry_count), provider_sync_runs(status,started_at,finished_at,categories_ready,categories_needing_review,error_message)",
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
  const editingMatch =
    matchRows.find((match) => match.id === params.edit) ?? null;
  const defaultCompetitionId =
    editingMatch?.competition_id ?? competitionRows[0]?.id ?? "";

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
              Admin Match Manager
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Add or edit fixtures, assign stadiums, update kickoff times,
              adjust status and score, review wrong match reports, and handle
              post-match provider sync exceptions. Normal finished matches score automatically.
            </p>
          </div>
          <form action={syncFinishedMatchesNow}>
            <PendingSubmitButton
              idleText="Sync finished matches now"
              pendingText="Syncing..."
              className="w-fit rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold transition hover:bg-gold hover:text-black"
            />
          </form>
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
            Post-match provider sync queued and processed. Matches with incomplete data were marked for review.
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
                        UTC: {formatUtcMatchTime(match.kickoff_at)} · {match.status ?? "scheduled"}
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
                      <span className="rounded-full border border-gray-200 bg-white px-2 py-1 font-semibold text-gray-600">
                        {isScored ? "Scored" : "Not scored"} · Predictions {scoringSummary.predictions} · Points {scoringSummary.pointsApplied}
                      </span>
                    </div>
                    <LatestSyncRunSummary state={state} run={run} />
                    {match.status === "finished" && (
                      <>
                        <LatestScoringRunSummary summary={latestScoringRuns[match.id]} />
                        <BonusDataReadinessPanel
                          matchId={match.id}
                          readiness={bonusReadinessByMatchId[match.id]}
                        />
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <form action={syncMatchNow}>
                      <input type="hidden" name="match_id" value={match.id} />
                      <PendingSubmitButton
                        idleText="Sync now"
                        pendingText="Syncing..."
                        className="w-fit rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-bold text-sky-700 transition hover:border-sky-400"
                      />
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
                      Manual override/edit data
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
