import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import CountryHero from "@/components/dashboard/CountryHero";
import UpcomingMatches from "@/components/dashboard/UpcomingMatches";
import PerformanceCard from "@/components/dashboard/PerformanceCard";
import NewsFeed from "@/components/dashboard/NewsFeed";
import { countryCodesMatch } from "@/lib/domain/countries";

export const dynamic = "force-dynamic";

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

type LeaderboardRow = {
  global_rank: number | null;
  distance_to_prize_zone: number | null;
};

const matchSelectAttempts = [
  "id, home_team, away_team, kickoff_at, stage, status, venue, home_country_code, away_country_code",
  "id, home_team, away_team, kickoff_at, stage, status, venue",
  "id, home_team:home_team_name, away_team:away_team_name, kickoff_at, stage, status, venue, home_country_code:home_team_code, away_country_code:away_team_code",
] as const;

async function fetchUpcomingMatches(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<MatchRow[]> {
  for (const selectColumns of matchSelectAttempts) {
    const { data, error } = await supabase
      .from("matches")
      .select(selectColumns)
      .eq("status", "scheduled")
      .order("kickoff_at", { ascending: true })
      .limit(20);

    if (!error) {
      return ((data as Partial<MatchRow>[] | null) ?? []).map((match) => ({
        id: match.id ?? "",
        home_team: match.home_team ?? "TBD",
        away_team: match.away_team ?? "TBD",
        kickoff_at: match.kickoff_at ?? new Date().toISOString(),
        stage: match.stage ?? null,
        status: match.status ?? "scheduled",
        venue: match.venue ?? null,
        home_country_code: match.home_country_code ?? null,
        away_country_code: match.away_country_code ?? null,
      }));
    }
  }

  return [];
}

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
    .maybeSingle();

  const userCountryCode = profile?.country_code ?? "";

  const [matches, newsRes, predictionsRes, leaderboardRes] = await Promise.all([
    fetchUpcomingMatches(supabase),
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
  ]);

  const news = (newsRes.error ? [] : (newsRes.data as NewsRow[] | null)) ?? [];
  const predictions = (predictionsRes.data as PredictionRow[] | null) ?? [];
  const leaderboard = (leaderboardRes.data as LeaderboardRow | null) ?? null;

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
    <main className="min-h-screen px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center justify-between gap-4 sm:mb-8">
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

        <section className="mb-5 rounded-3xl border border-gold/20 bg-gold/5 px-5 py-4 sm:mb-6 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-gold">
            World Cup Command Center
          </p>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
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

          <NewsFeed news={news} />

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-surface-border bg-surface p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Points</p>
              <p className="mt-2 text-3xl font-bold gold-text-gradient">{profile?.points ?? 0}</p>
            </div>
            <div className="rounded-3xl border border-surface-border bg-surface p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Global Rank</p>
              <p className="mt-2 text-3xl font-bold text-white">
                {leaderboard?.global_rank ? `#${leaderboard.global_rank}` : "—"}
              </p>
            </div>
            <div className="rounded-3xl border border-surface-border bg-surface p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Prize Zone</p>
              <p className="mt-2 text-3xl font-bold text-white">
                {leaderboard?.distance_to_prize_zone === null || leaderboard?.distance_to_prize_zone === undefined
                  ? "—"
                  : `${leaderboard.distance_to_prize_zone} pts`}
              </p>
            </div>
          </section>

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
