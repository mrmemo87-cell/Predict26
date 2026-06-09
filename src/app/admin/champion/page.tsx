import Link from "next/link";
import PendingSubmitButton from "@/components/PendingSubmitButton";

import { requireAdminUser } from "@/lib/admin/permissions";
import { CHAMPION_PICK_POINTS } from "@/lib/scoring/championScoring";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  confirmChampionResult,
  saveChampionPickConfig,
  saveChampionResultDraft,
  scoreChampionPicks,
  setupChampionPickConfig,
  withdrawChampionResult,
} from "./actions";

export const dynamic = "force-dynamic";

const COMPETITION_CODE = "WC2026";

type SearchParams = Promise<{
  saved?: string;
  scored?: string;
  error?: string;
  picks?: string;
  rows?: string;
  voided?: string;
  points?: string;
}>;

type TournamentConfigRow = {
  competition_code: string;
  competition_id: string | null;
  knockout_starts_at: string | null;
  round_of_16_starts_at: string | null;
  champion_pick_a_deadline: string | null;
  champion_pick_b_deadline: string | null;
  champion_picks_enabled: boolean;
  updated_at: string | null;
};

type TournamentResultRow = {
  competition_code: string;
  competition_id: string | null;
  champion_team_code: string | null;
  champion_confirmed: boolean;
  champion_confirmed_at: string | null;
  champion_confirmed_by: string | null;
  champion_source: string | null;
  champion_notes: string | null;
  result_version: number;
  updated_at: string | null;
};

type TeamRow = {
  team_code: string | null;
  team_name: string | null;
};

type ChampionPredictionRow = {
  pick_type: string;
  team_code: string;
};

type ScoringRunRow = {
  status: string;
  categories_completed: string[] | null;
  categories_skipped: unknown;
  finished_at: string | null;
  started_at: string | null;
  metadata: unknown;
};

type ActiveLedgerRow = {
  category: string;
  points: number;
};

type ProfileRow = {
  username: string | null;
};

type TeamOption = {
  teamCode: string;
  teamName: string;
};

type PickPreview = {
  saved: number;
  correct: number;
  wrong: number;
  points: number;
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const formatDateTimeInput = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 16);
};

const formatCount = (value: number) =>
  new Intl.NumberFormat("en").format(value);

const metadataRecord = (metadata: unknown): Record<string, unknown> => {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }

  return {};
};

const pickPreview = (
  predictions: ChampionPredictionRow[],
  pickType: "A" | "B",
  championTeamCode: string | null,
): PickPreview => {
  const rows = predictions.filter(
    (prediction) => prediction.pick_type === pickType,
  );
  const correct = championTeamCode
    ? rows.filter((prediction) => prediction.team_code === championTeamCode)
        .length
    : 0;
  const saved = rows.length;
  const wrong = championTeamCode ? saved - correct : saved;
  const points = correct * CHAMPION_PICK_POINTS[pickType];

  return { saved, correct, wrong, points };
};

const statusMessages: Record<string, string> = {
  draft: "Draft champion result saved. No Champion picks were scored.",
  confirmed: "Official Champion result confirmed. Run scoring when ready.",
  withdrawn:
    "Champion confirmation withdrawn. Run scoring to void active Champion ledger rows.",
  config: "Champion Pick configuration saved. No Champion picks were scored.",
  config_setup:
    "Champion Pick configuration set up with default WC2026 deadlines and enabled for eligible users.",
};

const errorMessages: Record<string, string> = {
  save_failed: "Could not save the draft Champion result.",
  confirm_failed: "Could not confirm the Champion result.",
  withdraw_failed: "Could not withdraw Champion confirmation.",
  scoring_failed: "Could not score Champion picks.",
  missing_champion: "Choose a champion team before confirming the result.",
  config_save_failed: "Could not save the Champion Pick configuration.",
};

export default async function AdminChampionPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  await requireAdminUser("/admin/champion");

  const supabase = createAdminClient();
  const [
    { data: config },
    { data: result },
    { data: teamRows },
    { data: predictionRows },
    { data: latestScoringRuns },
    { data: activeLedgerRows },
  ] = await Promise.all([
    supabase
      .from("tournament_prediction_config")
      .select(
        "competition_code, competition_id, knockout_starts_at, round_of_16_starts_at, champion_pick_a_deadline, champion_pick_b_deadline, champion_picks_enabled, updated_at",
      )
      .eq("competition_code", COMPETITION_CODE)
      .maybeSingle<TournamentConfigRow>(),
    supabase
      .from("tournament_results")
      .select(
        "competition_code, competition_id, champion_team_code, champion_confirmed, champion_confirmed_at, champion_confirmed_by, champion_source, champion_notes, result_version, updated_at",
      )
      .eq("competition_code", COMPETITION_CODE)
      .maybeSingle<TournamentResultRow>(),
    supabase
      .from("competition_team_players")
      .select("team_code, team_name")
      .eq("competition_code", COMPETITION_CODE)
      .eq("is_active", true)
      .order("team_name", { ascending: true }),
    supabase
      .from("tournament_champion_predictions")
      .select("pick_type, team_code")
      .eq("competition_code", COMPETITION_CODE),
    supabase
      .from("scoring_runs")
      .select(
        "status, categories_completed, categories_skipped, finished_at, started_at, metadata",
      )
      .eq("scope_type", "competition")
      .eq("source", "score_tournament_champion")
      .order("finished_at", { ascending: false, nullsFirst: false })
      .order("started_at", { ascending: false })
      .limit(1),
    supabase
      .from("scoring_ledger")
      .select("category, points")
      .in("category", ["champion_pick_a", "champion_pick_b"])
      .in("entity_key", [
        `competition:${COMPETITION_CODE}:champion_pick_a`,
        `competition:${COMPETITION_CODE}:champion_pick_b`,
      ])
      .is("voided_at", null),
  ]);

  const confirmedByProfile = result?.champion_confirmed_by
    ? await supabase
        .from("profiles")
        .select("username")
        .eq("id", result.champion_confirmed_by)
        .maybeSingle<ProfileRow>()
    : null;

  const teams = ((teamRows ?? []) as TeamRow[]).reduce<Map<string, TeamOption>>(
    (options, row) => {
      if (!row.team_code) return options;
      options.set(row.team_code, {
        teamCode: row.team_code,
        teamName: row.team_name ?? row.team_code,
      });
      return options;
    },
    new Map(),
  );
  const teamOptions = [...teams.values()].sort((a, b) =>
    a.teamName.localeCompare(b.teamName),
  );
  const predictions = (predictionRows ?? []) as ChampionPredictionRow[];
  const configRow = config as TournamentConfigRow | null;
  const configIssues = [
    !configRow ? "configuration row is missing" : null,
    configRow && !configRow.champion_picks_enabled
      ? "Champion picks are disabled"
      : null,
    configRow && !configRow.champion_pick_a_deadline
      ? "Pick A deadline is missing"
      : null,
    configRow && !configRow.champion_pick_b_deadline
      ? "Pick B deadline is missing"
      : null,
    configRow && !configRow.knockout_starts_at
      ? "Pick A join-time cutoff is missing"
      : null,
    configRow && !configRow.round_of_16_starts_at
      ? "Pick B join-time cutoff is missing"
      : null,
    teamOptions.length === 0 ? "no active WC2026 teams are available" : null,
  ].filter(Boolean) as string[];
  const latestRun = ((latestScoringRuns ?? []) as ScoringRunRow[])[0] ?? null;
  const latestRunMetadata = metadataRecord(latestRun?.metadata);
  const championTeamCode = result?.champion_team_code ?? null;
  const championTeamName = championTeamCode
    ? (teams.get(championTeamCode)?.teamName ?? championTeamCode)
    : "No champion selected";
  const pickAPreview = pickPreview(predictions, "A", championTeamCode);
  const pickBPreview = pickPreview(predictions, "B", championTeamCode);
  const estimatedPoints = pickAPreview.points + pickBPreview.points;
  const ledgerRows = (activeLedgerRows ?? []) as ActiveLedgerRow[];
  const activeChampionLedgerRows = ledgerRows.length;
  const activeChampionLedgerPoints = ledgerRows.reduce(
    (sum, row) => sum + (row.points ?? 0),
    0,
  );
  const successMessage = params.scored
    ? `Champion scoring complete. Evaluated ${params.picks ?? "0"} picks, upserted ${params.rows ?? "0"} ledger rows, voided ${params.voided ?? "0"}, and recorded ${params.points ?? "0"} active points for this run.`
    : params.saved
      ? statusMessages[params.saved]
      : null;
  const errorMessage = params.error ? errorMessages[params.error] : null;
  const previewCards: Array<{ label: string; value: number; detail: string }> =
    [
      {
        label: "Pick A saved",
        value: pickAPreview.saved,
        detail: `${pickAPreview.correct} correct · ${pickAPreview.wrong} wrong`,
      },
      {
        label: "Pick B saved",
        value: pickBPreview.saved,
        detail: `${pickBPreview.correct} correct · ${pickBPreview.wrong} wrong`,
      },
      {
        label: "Estimated points",
        value: estimatedPoints,
        detail: "If scored against selected champion",
      },
      {
        label: "Active Champion ledger rows",
        value: activeChampionLedgerRows,
        detail: "Current non-voided A/B rows",
      },
      {
        label: "Active Champion ledger points",
        value: activeChampionLedgerPoints,
        detail: "Current non-voided A/B points",
      },
      {
        label: "Saved picks evaluated",
        value: pickAPreview.saved + pickBPreview.saved,
        detail: "Missing picks excluded",
      },
    ];
  const latestRunMetricCards: Array<{ label: string; value: number }> = [
    ["Picks evaluated", latestRunMetadata.picks_evaluated],
    ["Ledger rows upserted", latestRunMetadata.ledger_rows_upserted],
    ["Stale rows voided", latestRunMetadata.stale_ledger_rows_voided],
    ["Profiles updated", latestRunMetadata.profiles_updated],
    ["Leaderboards upserted", latestRunMetadata.leaderboards_upserted],
    ["Points awarded", latestRunMetadata.total_points_awarded],
  ].map(([label, value]) => ({
    label: String(label),
    value: Number(value ?? 0),
  }));

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/admin"
              className="text-sm text-gray-500 transition hover:text-gold"
            >
              ← Admin dashboard
            </Link>
            <h1 className="mt-3 text-3xl font-bold text-gray-900 sm:text-5xl">
              Champion Result & Scoring
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Confirm the official World Cup champion and explicitly score
              Champion Pick A/B through the existing scoring ledger.
            </p>
          </div>
          <span className="w-fit rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
            Admin only
          </span>
        </header>

        {(successMessage || errorMessage) && (
          <section
            className={`mb-6 rounded-3xl border p-5 text-sm leading-6 ${
              errorMessage
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            <p className="font-bold">
              {errorMessage ? "Could not finish" : "All set"}
            </p>
            <p>{errorMessage ?? successMessage}</p>
          </section>
        )}

        <section className="mb-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <form className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                  Availability setup
                </p>
                <h2 className="text-2xl font-black text-gray-900">
                  Champion Pick deadlines
                </h2>
                <p className="mt-1 text-sm leading-6 text-gray-500">
                  These controls only govern whether eligible users can save
                  Champion Pick A/B. They do not score Champion picks.
                </p>
              </div>
              <span
                className={`w-fit rounded-full border px-3 py-1 text-xs font-black ${
                  configIssues.length === 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                {configIssues.length === 0 ? "Ready" : "Setup needed"}
              </span>
            </div>

            <input
              type="hidden"
              name="competition_code"
              value={COMPETITION_CODE}
            />

            <label className="mt-5 flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700">
              <input
                type="checkbox"
                name="champion_picks_enabled"
                defaultChecked={configRow?.champion_picks_enabled ?? false}
                className="h-4 w-4 accent-emerald-700"
              />
              Enable Champion Pick saving when deadline and join-time checks
              pass
            </label>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-bold text-gray-700">
                Pick A deadline
                <input
                  type="datetime-local"
                  name="champion_pick_a_deadline"
                  defaultValue={formatDateTimeInput(
                    configRow?.champion_pick_a_deadline,
                  )}
                  className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/20"
                />
              </label>
              <label className="block text-sm font-bold text-gray-700">
                Pick B deadline
                <input
                  type="datetime-local"
                  name="champion_pick_b_deadline"
                  defaultValue={formatDateTimeInput(
                    configRow?.champion_pick_b_deadline,
                  )}
                  className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/20"
                />
              </label>
              <label className="block text-sm font-bold text-gray-700">
                Pick A join-time cutoff
                <input
                  type="datetime-local"
                  name="knockout_starts_at"
                  defaultValue={formatDateTimeInput(
                    configRow?.knockout_starts_at,
                  )}
                  className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/20"
                />
              </label>
              <label className="block text-sm font-bold text-gray-700">
                Pick B join-time cutoff
                <input
                  type="datetime-local"
                  name="round_of_16_starts_at"
                  defaultValue={formatDateTimeInput(
                    configRow?.round_of_16_starts_at,
                  )}
                  className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/20"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <PendingSubmitButton
                idleText="Save Champion Pick config"
                pendingText="Saving config..."
                formAction={saveChampionPickConfig}
                className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-800"
              />
              <PendingSubmitButton
                idleText="Seed/fix WC2026 defaults"
                pendingText="Preparing defaults..."
                formAction={setupChampionPickConfig}
                className="rounded-full border border-gold/40 bg-gold/10 px-5 py-3 text-sm font-black text-gold-dark transition hover:border-gold hover:bg-gold/20"
              />
            </div>
          </form>

          <aside className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-gray-900">Config health</h2>
            <dl className="mt-4 space-y-3 text-sm leading-6 text-gray-600">
              <div>
                <dt className="font-bold text-gray-900">Config row</dt>
                <dd>{configRow ? "Present" : "Missing"}</dd>
              </div>
              <div>
                <dt className="font-bold text-gray-900">Pick A deadline</dt>
                <dd>{formatDateTime(configRow?.champion_pick_a_deadline)}</dd>
              </div>
              <div>
                <dt className="font-bold text-gray-900">Pick B deadline</dt>
                <dd>{formatDateTime(configRow?.champion_pick_b_deadline)}</dd>
              </div>
              <div>
                <dt className="font-bold text-gray-900">
                  Active selector teams
                </dt>
                <dd>{formatCount(teamOptions.length)}</dd>
              </div>
              <div>
                <dt className="font-bold text-gray-900">Updated</dt>
                <dd>{formatDateTime(configRow?.updated_at)}</dd>
              </div>
            </dl>
            {configIssues.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                <p className="font-black">Setup action recommended</p>
                <ul className="mt-2 list-disc pl-5">
                  {configIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
              Competition
            </p>
            <p className="mt-2 text-2xl font-black text-gray-900">
              {result?.competition_code ?? COMPETITION_CODE}
            </p>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
              Status
            </p>
            <p
              className={`mt-2 w-fit rounded-full border px-3 py-1 text-sm font-black ${
                result?.champion_confirmed
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {result?.champion_confirmed ? "Confirmed" : "Not confirmed"}
            </p>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
              Champion
            </p>
            <p className="mt-2 text-2xl font-black text-gray-900">
              {championTeamName}
            </p>
            {championTeamCode && (
              <p className="mt-1 text-xs font-semibold text-gray-500">
                {championTeamCode}
              </p>
            )}
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
              Result version
            </p>
            <p className="mt-2 text-2xl font-black text-gray-900">
              {result?.result_version ?? 1}
            </p>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <form className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-black text-gray-900">
                  Official champion result
                </h2>
                <p className="mt-1 text-sm leading-6 text-gray-500">
                  Saving a draft does not score picks. Scoring always requires
                  the explicit Score / Rescore action.
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600">
                Updated {formatDateTime(result?.updated_at)}
              </span>
            </div>

            <input
              type="hidden"
              name="competition_code"
              value={COMPETITION_CODE}
            />

            <label className="mt-6 block text-sm font-bold text-gray-700">
              Champion team
              <select
                name="champion_team_code"
                defaultValue={championTeamCode ?? ""}
                className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/20"
              >
                <option value="">Choose champion</option>
                {teamOptions.map((team) => (
                  <option key={team.teamCode} value={team.teamCode}>
                    {team.teamName} ({team.teamCode})
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 block text-sm font-bold text-gray-700">
              Source
              <input
                name="champion_source"
                defaultValue={result?.champion_source ?? ""}
                placeholder="Official FIFA result, manual confirmation, etc."
                className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/20"
              />
            </label>

            <label className="mt-4 block text-sm font-bold text-gray-700">
              Notes
              <textarea
                name="champion_notes"
                defaultValue={result?.champion_notes ?? ""}
                rows={4}
                className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/20"
              />
            </label>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <PendingSubmitButton
                idleText="Save draft champion result"
                pendingText="Saving draft..."
                formAction={saveChampionResultDraft}
                className="rounded-full border border-gray-200 px-5 py-3 text-sm font-black text-gray-700 transition hover:border-gold hover:text-gold"
              />
              <PendingSubmitButton
                idleText="Confirm official champion"
                pendingText="Confirming..."
                formAction={confirmChampionResult}
                className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700"
              />
              <PendingSubmitButton
                idleText="Withdraw confirmation"
                pendingText="Withdrawing..."
                formAction={withdrawChampionResult}
                className="rounded-full bg-amber-500 px-5 py-3 text-sm font-black text-white transition hover:bg-amber-600"
              />
            </div>
          </form>

          <aside className="space-y-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-gray-900">
              Confirmation details
            </h2>
            <div className="space-y-3 text-sm leading-6 text-gray-600">
              <p>
                <span className="font-bold text-gray-900">Confirmed at:</span>{" "}
                {formatDateTime(result?.champion_confirmed_at)}
              </p>
              <p>
                <span className="font-bold text-gray-900">Confirmed by:</span>{" "}
                {confirmedByProfile?.data?.username ??
                  result?.champion_confirmed_by ??
                  "—"}
              </p>
              <p>
                <span className="font-bold text-gray-900">Source:</span>{" "}
                {result?.champion_source ?? "—"}
              </p>
              <p>
                <span className="font-bold text-gray-900">Notes:</span>{" "}
                {result?.champion_notes ?? "—"}
              </p>
            </div>
          </aside>
        </section>

        <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-2xl font-black text-gray-900">
                Champion scoring preview
              </h2>
              <p className="mt-1 text-sm leading-6 text-gray-500">
                Wrong saved picks receive active 0-point ledger rows. Missing
                picks do not receive rows.
              </p>
            </div>
            <form
              action={scoreChampionPicks}
              className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
            >
              <input
                type="hidden"
                name="competition_code"
                value={COMPETITION_CODE}
              />
              <p className="max-w-md text-sm font-semibold leading-6 text-amber-900">
                Warning: This may change user points and leaderboard positions.
                {result?.champion_confirmed
                  ? " The current confirmed result will be used."
                  : " Because the result is not confirmed, this will void active Champion ledger rows if any exist."}
              </p>
              <PendingSubmitButton
                idleText="Score / Rescore Champion Picks"
                pendingText="Scoring champion picks..."
                className="mt-3 rounded-full bg-gold px-5 py-3 text-sm font-black text-emerald-950 transition hover:bg-gold-dark"
              />
            </form>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {previewCards.map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-4"
              >
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
                  {card.label}
                </p>
                <p className="mt-2 text-3xl font-black text-gray-900">
                  {formatCount(card.value)}
                </p>
                <p className="mt-1 text-sm text-gray-500">{card.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-black text-gray-900">
            Latest Champion scoring run
          </h2>
          {latestRun ? (
            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
                  Status
                </p>
                <p className="mt-2 text-xl font-black text-gray-900">
                  {latestRun.status}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
                  Finished
                </p>
                <p className="mt-2 text-sm font-bold text-gray-900">
                  {formatDateTime(
                    latestRun.finished_at ?? latestRun.started_at,
                  )}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
                  Completed
                </p>
                <p className="mt-2 text-sm font-bold text-gray-900">
                  {latestRun.categories_completed?.join(", ") || "—"}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
                  Skipped
                </p>
                <p className="mt-2 text-sm font-bold text-gray-900">
                  {Object.keys(metadataRecord(latestRun.categories_skipped))
                    .length > 0
                    ? JSON.stringify(latestRun.categories_skipped)
                    : "—"}
                </p>
              </div>
              {latestRunMetricCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-2xl border border-gray-100 bg-gray-50 p-4"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
                    {card.label}
                  </p>
                  <p className="mt-2 text-2xl font-black text-gray-900">
                    {formatCount(card.value)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              No Champion scoring run has been recorded yet.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
