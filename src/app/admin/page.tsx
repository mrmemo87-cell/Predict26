import Link from "next/link";

import { requireAdminUser } from "@/lib/admin/permissions";
import { fetchRealDataStatus } from "@/lib/admin/real-data-status";
import { reconcileExactResultLedger } from "@/lib/scoring/exactResultLedger";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  dryRunExactResultLedgerBackfill,
  runExactResultLedgerBackfill,
  runExactResultLedgerReconciliation,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  ledger_action?: string;
  ledger_status?: string;
  ledger_error?: string;
  ledger_rows_to_insert?: string;
  ledger_points_to_insert?: string;
  ledger_inserted_rows?: string;
  ledger_inserted_points?: string;
}>;

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

export default async function AdminPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  await requireAdminUser("/admin");

  const supabase = createAdminClient();
  const [realDataStatus, ledgerStatus] = await Promise.all([
    fetchRealDataStatus(supabase),
    reconcileExactResultLedger(),
  ]);
  const mismatchUsers = parseMismatchUsers(ledgerStatus.usersWithMismatch);
  const ledgerActionMessage = params.ledger_action
    ? ledgerActionMessages[params.ledger_action]
    : null;
  const ledgerErrorMessage = params.ledger_error
    ? ledgerErrorMessages[params.ledger_error]
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
                {ledgerErrorMessage ? "Action failed" : "Action complete"}
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
                Showing up to 50 users returned by the service-role
                reconciliation helper.
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
              These utilities are admin-only and service-role-only. Phase 5B
              scoring uses active ledger rows as the authoritative source for
              profile points while preserving profile accuracy and existing
              user-facing read paths.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <form action={runExactResultLedgerReconciliation}>
              <button
                type="submit"
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:border-gold hover:text-gold"
              >
                Run reconciliation
              </button>
            </form>
            <form action={dryRunExactResultLedgerBackfill}>
              <button
                type="submit"
                className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800 transition hover:border-amber-400 hover:bg-amber-100"
              >
                Dry-run exact-result ledger backfill
              </button>
            </form>
            <form action={runExactResultLedgerBackfill}>
              <button
                type="submit"
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700"
              >
                Run exact-result ledger backfill
              </button>
            </form>
          </div>
        </section>

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
