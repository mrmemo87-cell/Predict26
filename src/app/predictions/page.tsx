import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchUpcomingPredictionMatches } from "@/lib/data/upcomingPredictionMatches";
import { savePrediction } from "./actions";

type PredictionRow = {
  match_id: string;
  choice: "home" | "draw" | "away";
};

const pickLabels = {
  home: "Home",
  draw: "Draw",
  away: "Away",
} as const;

const formatKickoff = (kickoffAt: string | null) => {
  if (!kickoffAt) return "Time TBA";
  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(kickoffAt));
  } catch {
    return "Time TBA";
  }
};

export default async function PredictionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; match?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/predictions");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("country_code")
    .eq("id", user.id)
    .single();

  if (!profile?.country_code) {
    redirect("/onboarding/country");
  }

  const [matches, { data: predictions }] = await Promise.all([
    fetchUpcomingPredictionMatches(supabase, 20),
    supabase.from("predictions").select("match_id, choice").eq("user_id", user.id),
  ]);

  const selectedByMatch = new Map(
    ((predictions ?? []) as PredictionRow[]).map((prediction) => [prediction.match_id, prediction.choice]),
  );
  const now = new Date();

  return (
    <main className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="text-sm text-gray-400 transition hover:text-gold">← Dashboard</Link>
          <div className="rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
            Predictions
          </div>
        </header>

        <section className="mb-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-gold">World Cup 2026</p>
          <h1 className="text-3xl font-bold text-gray-900 sm:text-5xl">Pick the <span className="gold-text-gradient">result</span></h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-500">
            Choose home, draw, or away before kickoff. Each match accepts one prediction per user, and you can update it until the match locks.
          </p>
        </section>

        {params.saved && (
          <div className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
            Prediction saved.
          </div>
        )}
        {params.error && (
          <div className="mb-5 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
            {params.error === "locked" ? "That match is locked." : "Could not save that prediction. Please try again."}
          </div>
        )}

        <div className="space-y-4">
          {matches.map((match) => {
            const selected = selectedByMatch.get(match.id);
            const matchStatus = match.status.toLowerCase();
            const isNonPredictable = matchStatus !== "scheduled" && matchStatus !== "upcoming";
            const locked = isNonPredictable || (match.kickoff_at ? new Date(match.kickoff_at) <= now : false);

            const isHighlighted = params.match === match.id;

            return (
              <article
                key={match.id}
                id={`match-${match.id}`}
                className={`scroll-mt-6 rounded-3xl border p-4 sm:p-6 ${
                  isHighlighted
                    ? "border-gold bg-gold/10 shadow-lg shadow-gold/10"
                    : "border-gray-200 bg-white"
                }`}
              >
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-gray-500">{formatKickoff(match.kickoff_at)}</p>
                    <h2 className="mt-2 text-xl font-bold text-gray-900 sm:text-2xl">{match.home_team} <span className="text-gold">vs</span> {match.away_team}</h2>
                  </div>
                  <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${locked ? "bg-red-50 text-red-700" : "bg-gold/10 text-gold"}`}>
                    {locked ? "Locked" : "Open"}
                  </span>
                </div>

                <form action={savePrediction} className="grid grid-cols-3 gap-2 sm:gap-3">
                  <input type="hidden" name="match_id" value={match.id} />
                  {(["home", "draw", "away"] as const).map((pick) => (
                    <button
                      key={pick}
                      type="submit"
                      name="pick"
                      value={pick}
                      disabled={locked}
                      className={`rounded-2xl border px-3 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 sm:px-5 sm:py-4 ${
                        selected === pick
                          ? "border-gold bg-gold text-black shadow-lg shadow-gold/20"
                          : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gold/60 hover:text-gold"
                      }`}
                    >
                      {pickLabels[pick]}
                    </button>
                  ))}
                </form>
              </article>
            );
          })}

          {matches.length === 0 && (
            <div className="rounded-3xl border border-gray-200 bg-white p-10 text-center text-gray-500">
              No upcoming prediction matches are available yet.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
