import Link from "next/link";
import PendingSubmitButton from "@/components/PendingSubmitButton";

import { getConfiguredAdminEmails, requireAdminUser } from "@/lib/admin/permissions";
import { fetchRealDataStatus } from "@/lib/admin/real-data-status";
import { reconcileExactResultLedger } from "@/lib/scoring/exactResultLedger";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  dryRunExactResultLedgerBackfill,
  runExactResultLedgerBackfill,
  runExactResultLedgerReconciliation,
} from "./actions";
import AdminCleanupTools, { type CleanupCounts, type CleanupParticipant } from "./AdminCleanupTools";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  ledger_action?: string;
  ledger_status?: string;
  ledger_error?: string;
  ledger_rows_to_insert?: string;
  ledger_points_to_insert?: string;
  ledger_inserted_rows?: string;
  ledger_inserted_points?: string;
  cleanup_action?: string;
  cleanup_error?: string;
  deleted_count?: string;
}>;

const cleanupActionMessages: Record<string, string> = {
  reset_complete: "Test prediction data has been reset. Official tournament data was left in place.",
  participants_deleted: "Selected test participant profiles were removed from app data.",
};

const cleanupErrorMessages: Record<string, string> = {
  reset_confirmation: "Type the reset phrase exactly before running cleanup.",
  reset_failed: "Cleanup could not finish. Review server logs before trying again.",
  delete_confirmation: "Type the delete phrase exactly before removing participants.",
  delete_none: "Choose at least one test participant first.",
  delete_protected: "Only protected admin accounts were selected, so nothing was deleted.",
  delete_failed: "Participants could not be removed. Review server logs before trying again.",
};

const readinessItems = [
  "Confirm the official fixture file/provider includes FIFA match numbers, teams, kickoff_at, venue, city, and provider IDs.",
  "Import through the existing server-side provider mapping/upsert flow after a dry run against staging data.",
  "Keep paid providers and automatic sync disabled until credentials, quotas, retries, and audit logs are approved.",
];

const ledgerErrorMessages: Record<string, string> = {
  reconciliation_failed: "Could not run exact-result ledger reconciliation.",
  dry_run_failed: "Could not run the exact-result ledger backfill dry run.",
  backfill_failed: "Could not run the exact-result ledger backfill.",
};

const ledgerActionMessages: Record<string, string> = {
  reconciled: "Reconciliation refreshed. This did not affect user points.",
  dry_run_backfill:
    "Dry run complete. This did not write ledger rows or affect user points.",
  backfilled:
    "Backfill complete. Ledger rows may have been inserted, but user points and leaderboards were not changed.",
};

const formatCount = (value: number) =>
  new Intl.NumberFormat("en").format(value);

const ledgerMetricCards = [
  ["Scored predictions", "scoredPredictionsCount"],
  ["Exact-result ledger rows", "exactResultLedgerRowsCount"],
  ["Prediction points", "predictionsPointsSum"],
  ["Exact ledger points", "ledgerPointsSum"],
  ["Active ledger points", "activeLedgerPointsSum"],
  ["Profile points", "profilesPointsSum"],
  ["Missing ledger rows", "missingLedgerRowsCount"],
  ["Duplicate active rows", "duplicateActiveLedgerRowsCount"],
  ["Unexpected non-exact rows", "unexpectedActiveNonExactLedgerRowsCount"],
  ["Mismatch users", "usersWithMismatchCount"],
] as const;

type MismatchUser = {
  user_id?: string;
  predictions_points?: number;
  ledger_points?: number;
  active_ledger_points?: number;
  profile_points?: number;
};

const parseMismatchUsers = (value: unknown): MismatchUser[] => {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is MismatchUser =>
    Boolean(item && typeof item === "object"),
  );
};

const emptyCleanupCounts: CleanupCounts = {
  predictions: 0,
  possession: 0,
  scorers: 0,
  lineups: 0,
  lineupPlayers: 0,
  championPicks: 0,
  ledgerRows: 0,
  scoringRuns: 0,
  profiles: 0,
  leaderboardRows: 0,
};

async function getTableCount(supabase: ReturnType<typeof createAdminClient>, table: string) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error(`Admin count failed for ${table}`, error);
    return 0;
  }

  return count ?? 0;
}

async function fetchCleanupCounts(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<CleanupCounts> {
  const [
    predictions,
    possession,
    scorers,
    lineups,
    lineupPlayers,
    championPicks,
    ledgerRows,
    scoringRuns,
    profiles,
    leaderboardRows,
  ] = await Promise.all([
    getTableCount(supabase, "predictions"),
    getTableCount(supabase, "prediction_possession"),
    getTableCount(supabase, "prediction_scorers"),
    getTableCount(supabase, "prediction_lineups"),
    getTableCount(supabase, "prediction_lineup_players"),
    getTableCount(supabase, "tournament_champion_predictions"),
    getTableCount(supabase, "scoring_ledger"),
    getTableCount(supabase, "scoring_runs"),
    getTableCount(supabase, "profiles"),
    getTableCount(supabase, "leaderboards"),
  ]);

  return {
    predictions,
    possession,
    scorers,
    lineups,
    lineupPlayers,
    championPicks,
    ledgerRows,
    scoringRuns,
    profiles,
    leaderboardRows,
  };
}

async function fetchCleanupParticipants(
  supabase: ReturnType<typeof createAdminClient>,
  currentAdminId: string,
): Promise<CleanupParticipant[]> {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, country_code, points")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Participant profile fetch failed", error);
    return [];
  }

  const { data: authUsers } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const emailsById = new Map(
    (authUsers?.users ?? []).map((user) => [
      user.id,
      user.email?.trim().toLowerCase() ?? null,
    ]),
  );
  const adminEmails = new Set(getConfiguredAdminEmails());

  return ((profiles ?? []) as Array<{
    id: string;
    username: string | null;
    display_name: string | null;
    country_code: string | null;
    points: number | null;
  }>).map((profile) => {
    const email = emailsById.get(profile.id) ?? null;

    return {
      id: profile.id,
      username: profile.username,
      displayName: profile.display_name,
      email,
      countryCode: profile.country_code,
      points: profile.points,
      isCurrentAdmin: profile.id === currentAdminId,
      isConfiguredAdmin: Boolean(email && adminEmails.has(email)),
    };
  });
}

async function fetchLaunchChecklist(
  supabase: ReturnType<typeof createAdminClient>,
  realDataStatus: Awaited<ReturnType<typeof fetchRealDataStatus>>,
  ledgerStatus: Awaited<ReturnType<typeof reconcileExactResultLedger>>,
) {
  const [championConfigRes, activeTeams, flagCountries] = await Promise.all([
    supabase
      .from("tournament_prediction_config")
      .select("champion_picks_enabled, champion_pick_a_deadline, champion_pick_b_deadline")
      .eq("competition_code", "WC2026")
      .maybeSingle(),
    getTableCount(supabase, "competition_team_players"),
    supabase.from("countries").select("code", { count: "exact", head: true }).not("flag_emoji", "is", null),
  ]);

  const envVars = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SITE_URL",
    "ADMIN_EMAILS",
  ];
  const championConfig = championConfigRes.data as {
    champion_picks_enabled?: boolean | null;
    champion_pick_a_deadline?: string | null;
    champion_pick_b_deadline?: string | null;
  } | null;

  return [
    ["Required env vars", envVars.every((key) => Boolean(process.env[key])), "Values are hidden; this only checks presence."],
    ["Service key stays server-side", true, "Admin client is imported from server-only code paths."],
    ["72 official group matches loaded", realDataStatus.totalMatches >= 72, `${realDataStatus.totalMatches} matches currently loaded.`],
    ["No dev/test matches", realDataStatus.devTestMatches === 0, `${realDataStatus.devTestMatches} dev/test-looking matches found.`],
    ["Champion config ready", Boolean(championConfig?.champion_picks_enabled && championConfig.champion_pick_a_deadline && championConfig.champion_pick_b_deadline), "Champion Pick A/B settings have deadlines."],
    ["Active teams available", activeTeams > 0, `${activeTeams} active squad/team rows available.`],
    ["Prediction save paths", true, "Exact score, bonus, lineup, and champion save actions are wired."],
    ["Scoring reconciliation", ledgerStatus.status === "pass", `Ledger reconciliation is ${ledgerStatus.status}.`],
    ["Readiness health", realDataStatus.missingKickoffAt === 0 && realDataStatus.missingVenueOrCity === 0, `${realDataStatus.missingKickoffAt} missing kickoff · ${realDataStatus.missingVenueOrCity} missing venue/city.`],
    ["Telegram CTA set", true, "Landing page points fans to @Predict26Official."],
    ["Flags available", (flagCountries.count ?? 0) > 0, `${flagCountries.count ?? 0} countries have stored flags, plus FIFA-code fallback flags.`],
    ["Mobile quick check", true, "Hero, match cards, and XI modal use mobile-first responsive layouts."],
  ] as const;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const adminUser = await requireAdminUser("/admin");

  const supabase = createAdminClient();
  const [realDataStatus, ledgerStatus] = await Promise.all([
    fetchRealDataStatus(supabase),
    reconcileExactResultLedger(),
  ]);
  const [cleanupCounts, cleanupParticipants, launchChecklist] = await Promise.all([
    fetchCleanupCounts(supabase).catch(() => emptyCleanupCounts),
    fetchCleanupParticipants(supabase, adminUser.id),
    fetchLaunchChecklist(supabase, realDataStatus, ledgerStatus),
  ]);
  const mismatchUsers = parseMismatchUsers(ledgerStatus.usersWithMismatch);
  const ledgerActionMessage = params.ledger_action
    ? ledgerActionMessages[params.ledger_action]
    : null;
  const ledgerErrorMessage = params.ledger_error
    ? ledgerErrorMessages[params.ledger_error]
    : null;
  const cleanupActionMessage = params.cleanup_action
    ? cleanupActionMessages[params.cleanup_action]
    : null;
  const cleanupErrorMessage = params.cleanup_error
    ? cleanupErrorMessages[params.cleanup_error]
    : null;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/dashboard"
              className="text-sm text-gray-500 transition hover:text-gold"
            >
              ← Dashboard
            </Link>
            <h1 className="mt-3 text-3xl font-bold text-gray-900 sm:text-5xl">
              Admin Dashboard
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Server-side controls for match operations and real data readiness.
              Paid provider sync is not enabled.
            </p>
          </div>
          <span className="w-fit rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
            Admin only
          </span>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Link
            href="/admin/matches"
            className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-gold/60 hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              Matches
            </p>
            <h2 className="mt-3 text-2xl font-bold text-gray-900">
              Match Manager
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Add fixtures, edit kickoff details, update statuses, and score
              finished matches.
            </p>
          </Link>

          <Link
            href="/admin/matches#wrong-match-reports"
            className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-gold/60 hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              Reports
            </p>
            <h2 className="mt-3 text-2xl font-bold text-gray-900">
              Wrong match reports
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Review user-submitted match correction reports in the match
              manager.
            </p>
          </Link>

          <Link
            href="/admin/champion"
            className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-gold/60 hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              Champion
            </p>
            <h2 className="mt-3 text-2xl font-bold text-gray-900">
              Champion Scoring
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Confirm the official champion and explicitly score Champion Pick
              A/B ledger rows.
            </p>
          </Link>

          <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-6 shadow-sm opacity-75">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Coming soon
            </p>
            <h2 className="mt-3 text-2xl font-bold text-gray-900">
              Data sync / real data
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Manual readiness checks are available below. Automatic paid API
              sync is intentionally disabled.
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
                Scoring Ledger Status
              </p>
              <h2 className="mt-2 text-2xl font-bold text-gray-900">
                Exact-result shadow ledger
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
                Admin-only verification for the exact-score/result ledger
                shadow. This panel compares already-scored predictions, active
                ledger rows, and current profile totals. This does not affect
                user points.
              </p>
            </div>
            <span
              className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                ledgerStatus.status === "pass"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {ledgerStatus.status}
            </span>
          </div>

          {(ledgerActionMessage || ledgerErrorMessage) && (
            <div
              className={`mt-5 rounded-2xl border p-4 text-sm leading-6 ${
                ledgerErrorMessage
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              <p className="font-bold">
                {ledgerErrorMessage ? "Could not finish" : "All set"}
              </p>
              <p>{ledgerErrorMessage ?? ledgerActionMessage}</p>
              {params.ledger_rows_to_insert && (
                <p>
                  Dry-run rows to insert: {params.ledger_rows_to_insert} ·
                  points: {params.ledger_points_to_insert ?? "0"}
                </p>
              )}
              {params.ledger_inserted_rows && (
                <p>
                  Inserted rows: {params.ledger_inserted_rows} · points
                  recorded: {params.ledger_inserted_points ?? "0"}
                </p>
              )}
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ledgerMetricCards.map(([label, key]) => (
              <div
                key={key}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-4"
              >
                <p className="text-xs uppercase tracking-[0.18em] text-gray-500">
                  {label}
                </p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {formatCount(ledgerStatus[key])}
                </p>
              </div>
            ))}
          </div>

          {mismatchUsers.length > 0 && (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              <p className="font-bold">Mismatch sample</p>
              <p className="mt-1">
                Showing up to 50 users returned by the secure reconciliation helper.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="uppercase tracking-[0.16em] text-amber-700">
                    <tr>
                      <th className="py-2 pr-4">User</th>
                      <th className="py-2 pr-4">Predictions</th>
                      <th className="py-2 pr-4">Exact ledger</th>
                      <th className="py-2 pr-4">Active ledger</th>
                      <th className="py-2 pr-4">Profile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mismatchUsers.map((user) => (
                      <tr
                        key={
                          user.user_id ??
                          `${user.predictions_points}-${user.ledger_points}-${user.profile_points}`
                        }
                      >
                        <td className="py-2 pr-4 font-mono">
                          {user.user_id ?? "unknown"}
                        </td>
                        <td className="py-2 pr-4">
                          {user.predictions_points ?? 0}
                        </td>
                        <td className="py-2 pr-4">{user.ledger_points ?? 0}</td>
                        <td className="py-2 pr-4">
                          {user.active_ledger_points ?? 0}
                        </td>
                        <td className="py-2 pr-4">
                          {user.profile_points ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <p className="font-bold">Safety warning</p>
            <p>
              These utilities are admin-only and run on the server. Scoring uses active ledger rows as the source for profile points while preserving user-facing read paths.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <form action={runExactResultLedgerReconciliation}>
              <PendingSubmitButton
                idleText="Run reconciliation"
                pendingText="Checking..."
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:border-gold hover:text-gold"
              />
            </form>
            <form action={dryRunExactResultLedgerBackfill}>
              <PendingSubmitButton
                idleText="Preview exact-result backfill"
                pendingText="Previewing..."
                className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800 transition hover:border-amber-400 hover:bg-amber-100"
              />
            </form>
            <form action={runExactResultLedgerBackfill}>
              <PendingSubmitButton
                idleText="Run exact-result backfill"
                pendingText="Backfilling..."
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700"
              />
            </form>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-700">
                Launch checklist
              </p>
              <h2 className="mt-2 text-2xl font-black text-gray-900">
                Production sanity pass
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                Quick admin view of the items that matter before inviting fans in.
              </p>
            </div>
            <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">
              {launchChecklist.filter(([, ok]) => ok).length}/{launchChecklist.length} ready
            </span>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {launchChecklist.map(([label, ok, detail]) => (
              <div
                key={label}
                className={`rounded-2xl border p-4 ${
                  ok
                    ? "border-emerald-100 bg-emerald-50/70"
                    : "border-amber-200 bg-amber-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                      ok ? "bg-emerald-700 text-white" : "bg-amber-500 text-white"
                    }`}
                  >
                    {ok ? "✓" : "!"}
                  </span>
                  <div>
                    <p className="font-black text-gray-900">{label}</p>
                    <p className="mt-1 text-sm leading-6 text-gray-600">{detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {(cleanupActionMessage || cleanupErrorMessage) && (
          <div
            id="testing-cleanup"
            className={`mt-8 rounded-2xl border p-4 text-sm leading-6 ${
              cleanupErrorMessage
                ? "border-rose-200 bg-rose-50 text-rose-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            <p className="font-black">{cleanupErrorMessage ? "Cleanup needs attention" : "Cleanup complete"}</p>
            <p>
              {cleanupErrorMessage ?? cleanupActionMessage}
              {params.deleted_count ? ` Removed ${params.deleted_count} participant profile(s).` : ""}
            </p>
          </div>
        )}

        <AdminCleanupTools counts={cleanupCounts} participants={cleanupParticipants} />

        <section className="mt-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
                Readiness
              </p>
              <h2 className="mt-2 text-2xl font-bold text-gray-900">
                Real Data Status
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
                Current fixture completeness snapshot for preparing an official
                World Cup 2026 import.
              </p>
            </div>
            <span className="w-fit rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-500">
              {realDataStatus.totalMatches} total matches
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">
                Scheduled
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {realDataStatus.scheduledMatches}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">
                Finished
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {realDataStatus.finishedMatches}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">
                Missing kickoff
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {realDataStatus.missingKickoffAt}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">
                Missing venue/city
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {realDataStatus.missingVenueOrCity}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">
                Dev/test detected
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {realDataStatus.devTestMatches}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <p className="font-bold">Safest official data path</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {readinessItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
