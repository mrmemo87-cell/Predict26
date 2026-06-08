import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import CountryHero from "@/components/dashboard/CountryHero";
import UpcomingMatches from "@/components/dashboard/UpcomingMatches";
import PerformanceCard from "@/components/dashboard/PerformanceCard";
import NewsFeed from "@/components/dashboard/NewsFeed";
import GroupTables from "@/components/dashboard/GroupTables";
import UserCountryBadge from "@/components/dashboard/UserCountryBadge";
import { countryCodesMatch } from "@/lib/domain/countries";
import { fetchUpcomingPredictionMatches } from "@/lib/data/upcomingPredictionMatches";
import { fetchWorldCupGroups } from "@/lib/data/groups";

export const dynamic = "force-dynamic";

type NewsRow = {
  id: string;
  title: string;
  created_at: string;
};

type PredictionRow = {
  id: string;
  points_awarded: number | null;
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

  const [profileRes, matches, newsRes, predictionsRes, leaderboardRes, groups] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, username, avatar_url, country_code, points, is_founder, referral_code")
      .eq("id", user.id)
      .maybeSingle(),
    fetchUpcomingPredictionMatches(supabase, 20),
    supabase
      .from("world_cup_news")
      .select("id, title, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("predictions")
      .select("id, points_awarded")
      .eq("user_id", user.id),
    supabase
      .from("leaderboards")
      .select("global_rank, distance_to_prize_zone")
      .eq("user_id", user.id)
      .maybeSingle(),
    fetchWorldCupGroups(supabase),
  ]);

  const profile = profileRes.data;
  const userCountryCode = profile?.country_code ?? "";
  const news = (newsRes.error ? [] : (newsRes.data as NewsRow[] | null)) ?? [];
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

  const totalPredictions = predictions.length;
  const correctPredictions = predictions.filter(
    (prediction) =>
      prediction.points_awarded !== null && prediction.points_awarded > 0,
  ).length;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center justify-between gap-4 sm:mb-8">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="text-2xl">⚽</span>
            <span className="text-xl font-bold gold-text-gradient">Predict26</span>
          </Link>
          <div className="flex items-center gap-3">
            <UserCountryBadge
              flagEmoji={userFlagEmoji}
              countryName={userCountryName}
              countryCode={userCountryCode || null}
            />
            <form action={signOut}>
              <button type="submit" className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-gold/60 hover:text-gray-900">
                Sign Out
              </button>
            </form>
          </div>
        </header>

        <section className="mb-5 rounded-3xl border border-gold/20 bg-gold/5 px-5 py-4 sm:mb-6 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold">
            World Cup Command Center
          </p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">
            Your live prediction dashboard
          </h1>
        </section>

        <div className="space-y-6">
          <CountryHero match={heroMatch} userCountryCode={userCountryCode} />

          <PerformanceCard
            totalPredictions={totalPredictions}
            correctPredictions={correctPredictions}
          />

          <UpcomingMatches matches={matches} userCountryCode={userCountryCode} />

          <GroupTables groups={groups} userCountryCode={userCountryCode} />

          <NewsFeed news={news} />

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

          <nav className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Link href="/predictions" className="rounded-3xl border border-gold/30 bg-gold/5 p-6 transition hover:border-gold hover:bg-gold/10">
              <span className="text-3xl">🎯</span>
              <h2 className="mt-4 text-xl font-bold text-gray-900">Predictions</h2>
              <p className="mt-2 text-sm leading-6 text-gray-500">Pick home, draw, or away before each match locks.</p>
            </Link>
            <Link href="/leaderboard" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-gold/60">
              <span className="text-3xl">🏅</span>
              <h2 className="mt-4 text-xl font-bold text-gray-900">Leaderboard</h2>
              <p className="mt-2 text-sm leading-6 text-gray-500">Track global points and country rivals.</p>
            </Link>
            <Link href="/rules" className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-gold/60">
              <span className="text-3xl">📋</span>
              <h2 className="mt-4 text-xl font-bold text-gray-900">Rules</h2>
              <p className="mt-2 text-sm leading-6 text-gray-500">Review scoring, leaderboards, prizes, and tie-breakers.</p>
            </Link>
          </nav>
        </div>
      </div>
    </main>
  );
}
