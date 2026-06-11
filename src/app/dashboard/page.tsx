import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import CountryHero from "@/components/dashboard/CountryHero";
import UpcomingMatches from "@/components/dashboard/UpcomingMatches";
import PerformanceCard from "@/components/dashboard/PerformanceCard";
import PulsePreview from "@/components/dashboard/PulsePreview";
import GroupTables from "@/components/dashboard/GroupTables";
import UserCountryBadge from "@/components/dashboard/UserCountryBadge";
import { countryCodesMatch } from "@/lib/domain/countries";
import { fetchUpcomingPredictionMatches } from "@/lib/data/upcomingPredictionMatches";
import { fetchWorldCupGroups } from "@/lib/data/groups";
import { fetchDashboardPulsePosts } from "@/lib/data/pulse";
import { isConfiguredAdminEmail } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

type PredictionRow = {
  id: string;
  points: number | null;
  points_awarded: number | null;
  scoring_outcome: string | null;
  scored_at: string | null;
  result_points_applied: boolean | null;
};

type LeaderboardRow = {
  global_rank: number | null;
  distance_to_prize_zone: number | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/dashboard");
  }

  const [profileRes, matches, pulsePosts, predictionsRes, leaderboardRes, groups, countriesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, username, avatar_url, country_code, points, is_founder, referral_code")
      .eq("id", user.id)
      .maybeSingle(),
    fetchUpcomingPredictionMatches(supabase, 20),
    fetchDashboardPulsePosts(supabase),
    supabase
      .from("predictions")
      .select("id, points, points_awarded, scoring_outcome, scored_at, result_points_applied")
      .eq("user_id", user.id),
    supabase
      .from("leaderboards")
      .select("global_rank, distance_to_prize_zone")
      .eq("user_id", user.id)
      .maybeSingle(),
    fetchWorldCupGroups(supabase),
    supabase.from("countries").select("code, flag_emoji"),
  ]);

  const profile = profileRes.data;
  const userCountryCode = profile?.country_code ?? "";
  const countries = countriesRes.error ? [] : countriesRes.data ?? [];
  const predictions = (predictionsRes.error ? [] : (predictionsRes.data as PredictionRow[] | null)) ?? [];
  const leaderboard = (leaderboardRes.error ? null : (leaderboardRes.data as LeaderboardRow | null)) ?? null;

  // Get country info for badge
  let userCountryName: string | null = null;
  let userFlagEmoji: string | null = null;
  if (userCountryCode) {
    const { data: countryRow } = await supabase
      .from("countries")
      .select("name, flag_emoji")
      .eq("code", userCountryCode)
      .maybeSingle();
    userCountryName = countryRow?.name ?? null;
    userFlagEmoji = countryRow?.flag_emoji ?? null;
  }

  const countryMatch = userCountryCode
    ? matches.find(
        (match) =>
          countryCodesMatch(match.home_country_code, userCountryCode) ||
          countryCodesMatch(match.away_country_code, userCountryCode),
      )
    : null;
  const heroMatch = countryMatch ?? matches[0] ?? null;

  const isAdmin = isConfiguredAdminEmail(user.email);

  const submittedPredictions = predictions.length;
  const scoredPredictions = predictions.filter(
    (prediction) =>
      prediction.result_points_applied === true ||
      prediction.scoring_outcome !== null ||
      prediction.scored_at !== null,
  ).length;
  const correctPredictions = predictions.filter(
    (prediction) => {
      const isScored =
        prediction.result_points_applied === true ||
        prediction.scoring_outcome !== null ||
        prediction.scored_at !== null;
      const points = prediction.points ?? prediction.points_awarded ?? 0;

      return (
        isScored &&
        (points > 0 || prediction.scoring_outcome === "exact" || prediction.scoring_outcome === "result")
      );
    },
  ).length;

  return (
    <main className="min-h-screen bg-gray-50 bg-[radial-gradient(circle_at_top_left,rgba(22,163,74,0.10),transparent_32%),linear-gradient(90deg,rgba(22,163,74,0.05)_1px,transparent_1px),linear-gradient(0deg,rgba(22,163,74,0.04)_1px,transparent_1px)] bg-[size:auto,44px_44px,44px_44px] px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 sm:mb-8">
          <Link href="/dashboard" className="shrink-0 flex items-center gap-3 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-700 text-xl text-white shadow-sm">⚽</span>
            <span className="text-xl font-bold gold-text-gradient">Predict26</span>
          </Link>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
            <UserCountryBadge
              flagEmoji={userFlagEmoji}
              countryName={userCountryName}
              countryCode={userCountryCode || null}
            />
            <form action={signOut}>
              <button type="submit" className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:border-gold/60 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
                Sign Out
              </button>
            </form>
          </div>
        </header>

        <section className="mb-5 overflow-hidden rounded-3xl border border-emerald-100 bg-white px-5 py-5 shadow-sm sm:mb-6 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700">
                World Cup Command Center
              </p>
              <h1 className="mt-2 text-2xl font-black text-gray-900 sm:text-3xl">
                Your live prediction dashboard
              </h1>
            </div>
            <Link
              href={heroMatch ? `/predictions?match=${heroMatch.id}` : "/predictions"}
              className="inline-flex items-center justify-center rounded-full bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            >
              Predict upcoming match
            </Link>
          </div>
        </section>

        <div className="space-y-6">
          <CountryHero match={heroMatch} userCountryCode={userCountryCode} />

          <PerformanceCard
            points={profile?.points ?? 0}
            submittedPredictions={submittedPredictions}
            scoredPredictions={scoredPredictions}
            correctPredictions={correctPredictions}
          />

          <UpcomingMatches matches={matches} userCountryCode={userCountryCode} />

          <GroupTables groups={groups} userCountryCode={userCountryCode} />

          <PulsePreview posts={pulsePosts} countries={countries} />

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Points</p>
              <p className="mt-2 text-3xl font-bold gold-text-gradient">{profile?.points ?? 0}</p>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Global Rank</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {leaderboard?.global_rank ? `#${leaderboard.global_rank}` : "—"}
              </p>
            </div>
            <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Prize Zone</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">
                {leaderboard?.distance_to_prize_zone === null || leaderboard?.distance_to_prize_zone === undefined
                  ? "—"
                  : `${leaderboard.distance_to_prize_zone} pts`}
              </p>
            </div>
          </section>

          <nav aria-label="Quick actions" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Link href="/predictions" className="group rounded-3xl border border-emerald-200 bg-emerald-700 p-6 text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
              <span className="text-3xl">🎯</span>
              <h2 className="mt-4 text-xl font-black">Predictions</h2>
              <p className="mt-2 text-sm leading-6 text-emerald-50">Enter exact scores before kickoff locks each match.</p>
              <span className="mt-4 inline-flex text-sm font-bold">Next action →</span>
            </Link>
            <Link href="/leaderboard" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-gold/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
              <span className="text-3xl">🏅</span>
              <h2 className="mt-4 text-xl font-black text-gray-900">Leaderboard</h2>
              <p className="mt-2 text-sm leading-6 text-gray-500">Catch up on global points and country rivals.</p>
            </Link>
            <Link href="/rules" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-gold/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
              <span className="text-3xl">📋</span>
              <h2 className="mt-4 text-xl font-black text-gray-900">Rules</h2>
              <p className="mt-2 text-sm leading-6 text-gray-500">Review exact-score scoring, locks, and tie-breakers.</p>
            </Link>
            {isAdmin && (
              <Link href="/admin" className="rounded-3xl border border-gold/30 bg-white p-6 shadow-sm transition hover:border-gold hover:bg-gold/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
                <span className="text-3xl">🛠️</span>
                <h2 className="mt-4 text-xl font-bold text-gray-900">Admin Dashboard</h2>
                <p className="mt-2 text-sm leading-6 text-gray-500">Open match operations and real data readiness tools.</p>
              </Link>
            )}
          </nav>
        </div>
      </div>
    </main>
  );
}
