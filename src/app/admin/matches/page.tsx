import Link from "next/link";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { markReportReviewed, saveMatch } from "./actions";

type SearchParams = Promise<{ error?: string; saved?: string; report_saved?: string; edit?: string }>;

type CompetitionRow = { id: string; name: string; slug: string };
type StadiumRow = { id: string; name: string; city: string };
type MatchRow = {
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
  stadiums?: { name: string; city: string } | Array<{ name: string; city: string }> | null;
};

type ReportRow = {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  matches: { home_team_name: string | null; away_team_name: string | null; kickoff_at: string | null } | Array<{ home_team_name: string | null; away_team_name: string | null; kickoff_at: string | null }> | null;
};

const STATUS_OPTIONS = ["scheduled", "live", "in_progress", "completed", "postponed", "cancelled"];

const requireAdminUser = async () => {
  const allowedEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (allowedEmails.length === 0) {
    redirect("/dashboard?error=admin_not_configured");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/admin/matches");
  }

  const email = user.email?.toLowerCase();
  if (!email || !allowedEmails.includes(email)) {
    redirect("/dashboard?error=admin_required");
  }
};

const formatDateTimeLocal = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
};

const firstRelation = <T,>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

const formatKickoff = (value: string | null) => {
  if (!value) return "Time TBA";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

export default async function AdminMatchManagerPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  await requireAdminUser();

  const supabase = createAdminClient();
  const [{ data: competitions }, { data: stadiums }, { data: matches }, { data: reports }] = await Promise.all([
    supabase.from("competitions").select("id, name, slug").order("created_at", { ascending: true }),
    supabase.from("stadiums").select("id, name, city").order("name", { ascending: true }),
    supabase
      .from("matches")
      .select("id, competition_id, home_team_name, away_team_name, home_team_code, away_team_code, kickoff_at, status, stadium_id, venue, city, home_score, away_score, match_number, stage, stadiums(name, city)")
      .order("kickoff_at", { ascending: true, nullsFirst: false })
      .limit(100),
    supabase
      .from("wrong_match_reports")
      .select("id, reason, details, status, created_at, matches(home_team_name, away_team_name, kickoff_at)")
      .in("status", ["open", "reviewed"])
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const competitionRows = (competitions ?? []) as CompetitionRow[];
  const stadiumRows = (stadiums ?? []) as StadiumRow[];
  const matchRows = (matches ?? []) as unknown as MatchRow[];
  const reportRows = (reports ?? []) as unknown as ReportRow[];
  const editingMatch = matchRows.find((match) => match.id === params.edit) ?? null;
  const defaultCompetitionId = editingMatch?.competition_id ?? competitionRows[0]?.id ?? "";

  return (
    <main className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/dashboard" className="text-sm text-gray-400 transition hover:text-gold">← Dashboard</Link>
            <h1 className="mt-3 text-3xl font-bold text-gray-900 sm:text-5xl">Admin Match Manager</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Add or edit fixtures, assign stadiums, update kickoff times, adjust status and score, and review wrong match reports. Sync preparation stays server-side.
            </p>
          </div>
          <span className="w-fit rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
            Server-side admin
          </span>
        </header>

        {params.saved && <div className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">Match saved.</div>}
        {params.report_saved && <div className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">Report updated.</div>}
        {params.error && <div className="mb-5 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{params.error}</div>}

        <section className="mb-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-bold text-gray-900">{editingMatch ? "Edit match" : "Add match"}</h2>
          <form action={saveMatch} className="mt-6 grid gap-4 md:grid-cols-2">
            <input type="hidden" name="match_id" value={editingMatch?.id ?? ""} />

            <label className="text-sm font-semibold text-gray-700">
              Competition
              <select name="competition_id" defaultValue={defaultCompetitionId} className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900">
                {competitionRows.map((competition) => (
                  <option key={competition.id} value={competition.id}>{competition.name}</option>
                ))}
              </select>
            </label>

            <label className="text-sm font-semibold text-gray-700">
              Stadium
              <select name="stadium_id" defaultValue={editingMatch?.stadium_id ?? ""} className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900">
                <option value="">No stadium assigned</option>
                {stadiumRows.map((stadium) => (
                  <option key={stadium.id} value={stadium.id}>{stadium.name} · {stadium.city}</option>
                ))}
              </select>
            </label>

            <label className="text-sm font-semibold text-gray-700">
              Home team
              <input name="home_team_name" required defaultValue={editingMatch?.home_team_name ?? ""} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
            </label>

            <label className="text-sm font-semibold text-gray-700">
              Away team
              <input name="away_team_name" required defaultValue={editingMatch?.away_team_name ?? ""} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
            </label>

            <label className="text-sm font-semibold text-gray-700">
              Home code
              <input name="home_team_code" defaultValue={editingMatch?.home_team_code ?? ""} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
            </label>

            <label className="text-sm font-semibold text-gray-700">
              Away code
              <input name="away_team_code" defaultValue={editingMatch?.away_team_code ?? ""} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
            </label>

            <label className="text-sm font-semibold text-gray-700">
              Kickoff time
              <input name="kickoff_at" type="datetime-local" required defaultValue={formatDateTimeLocal(editingMatch?.kickoff_at)} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
            </label>

            <label className="text-sm font-semibold text-gray-700">
              Status
              <select name="status" defaultValue={editingMatch?.status ?? "scheduled"} className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-gray-900">
                {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>

            <label className="text-sm font-semibold text-gray-700">
              Home score
              <input name="home_score" type="number" min="0" defaultValue={editingMatch?.home_score ?? ""} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
            </label>

            <label className="text-sm font-semibold text-gray-700">
              Away score
              <input name="away_score" type="number" min="0" defaultValue={editingMatch?.away_score ?? ""} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
            </label>

            <label className="text-sm font-semibold text-gray-700">
              Venue override
              <input name="venue" defaultValue={editingMatch?.venue ?? ""} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
            </label>

            <label className="text-sm font-semibold text-gray-700">
              City override
              <input name="city" defaultValue={editingMatch?.city ?? ""} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
            </label>

            <label className="text-sm font-semibold text-gray-700">
              Match number
              <input name="match_number" type="number" min="1" defaultValue={editingMatch?.match_number ?? ""} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
            </label>

            <label className="text-sm font-semibold text-gray-700">
              Stage
              <input name="stage" defaultValue={editingMatch?.stage ?? "group"} className="mt-2 w-full rounded-2xl border border-gray-200 px-4 py-3 text-gray-900" />
            </label>

            <div className="flex items-end gap-3 md:col-span-2">
              <button type="submit" className="rounded-full bg-gold px-6 py-3 text-sm font-bold text-black shadow-lg shadow-gold/20 transition hover:-translate-y-0.5">
                Save match
              </button>
              {editingMatch && <Link href="/admin/matches" className="rounded-full border border-gray-200 px-6 py-3 text-sm font-bold text-gray-700 transition hover:border-gold hover:text-gold">Cancel edit</Link>}
            </div>
          </form>
        </section>

        <section className="mb-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-bold text-gray-900">Upcoming and active matches</h2>
          <div className="mt-6 space-y-3">
            {matchRows.map((match) => (
              <article key={match.id} className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">{formatKickoff(match.kickoff_at)} · {match.status ?? "scheduled"}</p>
                  <h3 className="mt-1 text-lg font-bold text-gray-900">{match.home_team_name ?? "Team TBA"} vs {match.away_team_name ?? "Team TBA"}</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Score: {match.home_score ?? "—"} - {match.away_score ?? "—"} · Stadium: {firstRelation(match.stadiums)?.name ?? match.venue ?? "Unassigned"}
                  </p>
                </div>
                <Link href={`/admin/matches?edit=${match.id}`} className="w-fit rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:border-gold hover:text-gold">
                  Edit
                </Link>
              </article>
            ))}
            {matchRows.length === 0 && <p className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">No matches found.</p>}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-bold text-gray-900">Wrong match reports</h2>
          <div className="mt-6 space-y-3">
            {reportRows.map((report) => (
              <article key={report.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500">{report.status} · {formatKickoff(report.created_at)}</p>
                    <h3 className="mt-1 text-lg font-bold text-gray-900">
                      {firstRelation(report.matches)?.home_team_name ?? "Team TBA"} vs {firstRelation(report.matches)?.away_team_name ?? "Team TBA"}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-gray-700">{report.reason}</p>
                    {report.details && <p className="mt-1 text-sm text-gray-500">{report.details}</p>}
                  </div>
                  <form action={markReportReviewed} className="flex gap-2">
                    <input type="hidden" name="report_id" value={report.id} />
                    <select name="report_status" defaultValue="reviewed" className="rounded-full border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                      <option value="reviewed">Reviewed</option>
                      <option value="resolved">Resolved</option>
                      <option value="dismissed">Dismissed</option>
                    </select>
                    <button type="submit" className="rounded-full bg-gold px-4 py-2 text-sm font-bold text-black">Update</button>
                  </form>
                </div>
              </article>
            ))}
            {reportRows.length === 0 && <p className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">No open reports.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
