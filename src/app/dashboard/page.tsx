import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import CountryHero from "@/components/dashboard/CountryHero";
import UpcomingMatches from "@/components/dashboard/UpcomingMatches";
import PerformanceCard from "@/components/dashboard/PerformanceCard";
import NewsFeed from "@/components/dashboard/NewsFeed";

type MatchRow = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  stage: string | null;
  status: string;
  venue: string | null;
  home_country_code: string | null;
  away_country_code: string | null;
};

type NewsRow = {
  id: string;
  title: string;
  created_at: string;
};

type PredictionRow = {
  id: string;
  points_awarded: number | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/dashboard");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, avatar_url, country_code, points, is_founder, referral_code")
    .eq("id", user.id)
    .single();

  if (!profile?.country_code) {
    redirect("/onboarding/country");
  }

  const userCountryCode = profile.country_code;

  // Fetch all dashboard data in parallel
  let matches: MatchRow[] = [];
  let news: NewsRow[] = [];
  let predictions: PredictionRow[] = [];
  let fetchError = false;

  try {
    const [matchesRes, newsRes, predictionsRes] = await Promise.all([
      supabase
        .from("matches")
        .select("id, home_team, away_team, kickoff_at, stage, status, venue, home_country_code, away_country_code")
        .eq("status", "scheduled")
        .order("kickoff_at", { ascending: true })
        .limit(20),
      supabase
        .from("world_cup_news")
        .select("id, title, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("predictions")
        .select("id, points_awarded")
        .eq("user_id", user.id),
    ]);

    matches = (matchesRes.data as MatchRow[] | null) ?? [];
    news = (newsRes.data as NewsRow[] | null) ?? [];
    predictions = (predictionsRes.data as PredictionRow[] | null) ?? [];
  } catch {
    fetchError = true;
  }

  // Determine hero match: nearest country match, or fallback to nearest overall
  const countryMatch = matches.find(
    (m) => m.home_country_code === userCountryCode || m.away_country_code === userCountryCode
  );
  const heroMatch = countryMatch ?? matches[0] ?? null;

  // Performance calculations
  const totalPredictions = predictions.length;
  const correctPredictions = predictions.filter(
    (p) => p.points_awarded !== null && p.points_awarded > 0
  ).length;

  if (fetchError) {
    return (
      <main className="min-h-screen px-4 py-8 sm:py-12">
        <div className="mx-auto max-w-5xl">
          <header className="mb-8 flex items-center justify-between gap-4">
            <Link href="/dashboard" className="flex items-center gap-3">
              <span className="text-2xl">⚽</span>
              <span className="text-xl font-bold gold-text-gradient">Predict26</span>
            </Link>
            <form action={signOut}>
              <button type="submit" className="rounded-full border border-surface-border px-4 py-2 text-sm text-gray-400 transition hover:border-gold/60 hover:text-white">
                Sign Out
              </button>
            </form>
          </header>
          <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-8 text-center">
            <p className="text-lg font-semibold text-red-300">Something went wrong</p>
            <p className="mt-2 text-sm text-gray-400">We couldn&apos;t load your dashboard data. Please try refreshing the page.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="text-2xl">⚽</span>
            <span className="text-xl font-bold gold-text-gradient">Predict26</span>
          </Link>
          <form action={signOut}>
            <button type="submit" className="rounded-full border border-surface-border px-4 py-2 text-sm text-gray-400 transition hover:border-gold/60 hover:text-white">
              Sign Out
            </button>
          </form>
        </header>

        {/* Desktop: Hero → Performance → Matches → News */}
        {/* Mobile: Hero → Performance → News → Matches */}
        <div className="space-y-6">
          {/* Hero Card */}
          <CountryHero match={heroMatch} userCountryCode={userCountryCode} />

          {/* Performance Card */}
          <PerformanceCard
            totalPredictions={totalPredictions}
            correctPredictions={correctPredictions}
          />

          {/* News - shown before matches on mobile, after on desktop */}
          <div className="block lg:hidden">
            <NewsFeed news={news} />
          </div>

          {/* Upcoming Matches */}
          <UpcomingMatches matches={matches} userCountryCode={userCountryCode} />

          {/* News - shown after matches on desktop */}
          <div className="hidden lg:block">
            <NewsFeed news={news} />
          </div>

          {/* Quick Nav */}
          <nav className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Link href="/predictions" className="rounded-3xl border border-gold/30 bg-gold/10 p-6 transition hover:border-gold hover:bg-gold/15">
              <span className="text-3xl">🎯</span>
              <h2 className="mt-4 text-xl font-bold text-white">Predictions</h2>
              <p className="mt-2 text-sm leading-6 text-gray-400">Pick home, draw, or away before each match locks.</p>
            </Link>
            <Link href="/leaderboard" className="rounded-3xl border border-surface-border bg-surface p-6 transition hover:border-gold/60">
              <span className="text-3xl">🏅</span>
              <h2 className="mt-4 text-xl font-bold text-white">Leaderboard</h2>
              <p className="mt-2 text-sm leading-6 text-gray-400">Track global points and country rivals.</p>
            </Link>
          </nav>
        </div>
      </div>
    </main>
  );
}
