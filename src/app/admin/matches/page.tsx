import Link from "next/link";
import { requireAdminUser } from "@/lib/admin/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { markReportReviewed, saveMatch } from "./actions";
import MatchForm from "./MatchForm";

type SearchParams = Promise<{ error?: string; saved?: string; report_saved?: string; edit?: string }>;

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

const firstRelation = <T,>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
};

const formatKickoff = (value: string | null) => {
  if (!value) return "Time TBA";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};

const ERROR_MESSAGES: Record<string, string> = {
  score_not_allowed_for_status: "Scores can only be saved for live or finished matches.",
  invalid_non_negative_number: "Scores and match numbers must be non-negative whole numbers.",
  incomplete_score: "Enter both scores before saving the match.",
  score_required_for_status: "Live or finished matches need both scores before saving.",
  invalid_match_status: "Choose a valid match status before saving.",
  missing_match_fields: "Enter both teams and a kickoff time before saving.",
  invalid_kickoff_time: "Enter a valid kickoff time before saving.",
  missing_competition: "Choose a competition before saving.",
  invalid_report: "Choose a valid report update before saving.",
};

const friendlyError = (error: string) => ERROR_MESSAGES[error] ?? "Could not save changes. Please check the form and try again.";

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
        {params.error && <div className="mb-5 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{friendlyError(params.error)}</div>}

        <section className="mb-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-bold text-gray-900">{editingMatch ? "Edit match" : "Add match"}</h2>
          <MatchForm
            competitions={competitionRows}
            stadiums={stadiumRows}
            editingMatch={editingMatch}
            defaultCompetitionId={defaultCompetitionId}
            saveAction={saveMatch}
          />
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
