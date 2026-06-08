import Link from "next/link";

import { requireAdminUser } from "@/lib/admin/permissions";
import { fetchRealDataStatus } from "@/lib/admin/real-data-status";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const readinessItems = [
  "Confirm the official fixture file/provider includes FIFA match numbers, teams, kickoff_at, venue, city, and provider IDs.",
  "Import through the existing server-side provider mapping/upsert flow after a dry run against staging data.",
  "Keep paid providers and automatic sync disabled until credentials, quotas, retries, and audit logs are approved.",
];

export default async function AdminPage() {
  await requireAdminUser("/admin");

  const supabase = createAdminClient();
  const realDataStatus = await fetchRealDataStatus(supabase);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/dashboard" className="text-sm text-gray-500 transition hover:text-gold">← Dashboard</Link>
            <h1 className="mt-3 text-3xl font-bold text-gray-900 sm:text-5xl">Admin Dashboard</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Server-side controls for match operations and real data readiness. Paid provider sync is not enabled.
            </p>
          </div>
          <span className="w-fit rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
            Admin only
          </span>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <Link href="/admin/matches" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-gold/60 hover:shadow-md">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Matches</p>
            <h2 className="mt-3 text-2xl font-bold text-gray-900">Match Manager</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">Add fixtures, edit kickoff details, update statuses, and score finished matches.</p>
          </Link>

          <Link href="/admin/matches#wrong-match-reports" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-gold/60 hover:shadow-md">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Reports</p>
            <h2 className="mt-3 text-2xl font-bold text-gray-900">Wrong match reports</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">Review user-submitted match correction reports in the match manager.</p>
          </Link>

          <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-6 shadow-sm opacity-75">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">Coming soon</p>
            <h2 className="mt-3 text-2xl font-bold text-gray-900">Data sync / real data</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500">Manual readiness checks are available below. Automatic paid API sync is intentionally disabled.</p>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">Readiness</p>
              <h2 className="mt-2 text-2xl font-bold text-gray-900">Real Data Status</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
                Current fixture completeness snapshot for preparing an official World Cup 2026 import.
              </p>
            </div>
            <span className="w-fit rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-500">
              {realDataStatus.totalMatches} total matches
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Scheduled</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{realDataStatus.scheduledMatches}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Finished</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{realDataStatus.finishedMatches}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Missing kickoff</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{realDataStatus.missingKickoffAt}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Missing venue/city</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{realDataStatus.missingVenueOrCity}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Dev/test detected</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{realDataStatus.devTestMatches}</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <p className="font-bold">Safest official data path</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {readinessItems.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
