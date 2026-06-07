import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchUpcomingPredictionMatches } from "@/lib/data/upcomingPredictionMatches";
import { savePrediction } from "./actions";

type PredictionRow = {
  match_id: string;
  home_score: number | null;
  away_score: number | null;
};

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
    supabase.from("predictions").select("match_id, home_score, away_score").eq("user_id", user.id),
  ]);

  const scoresByMatch = new Map(
    ((predictions ?? []) as PredictionRow[]).map((prediction) => [prediction.match_id, prediction]),
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
          <h1 className="text-3xl font-bold text-gray-900 sm:text-5xl">Predict the <span className="gold-text-gradient">exact score</span></h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-500">
            Enter the exact final score before kickoff. Each match accepts one prediction per user, and you can update it until the match locks.
          </p>
        </section>

        {params.saved && (
          <div className="mb-5 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">
            Prediction saved.
          </div>
        )}
        {params.error && (
          <div className="mb-5 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
            {params.error === "invalid_prediction"
              ? "Please enter both scores."
              : params.error === "locked"
                ? "Predictions are locked for this match."
                : "Could not save prediction. Please try again."}
          </div>
        )}

        <div className="space-y-4">
          {matches.map((match) => {
            const savedScore = scoresByMatch.get(match.id);
            const locked = match.status.toLowerCase() !== "scheduled" || !match.kickoff_at || new Date(match.kickoff_at) <= now;
            const isHighlighted = params.match === match.id;
            const savedPredictionLabel = savedScore && savedScore.home_score !== null && savedScore.away_score !== null
              ? `${savedScore.home_score} - ${savedScore.away_score}`
              : null;

            return (
              <article
                key={match.id}
                id={`match-${match.id}`}
                className={`scroll-mt-6 rounded-3xl border p-4 shadow-sm sm:p-6 ${
                  isHighlighted
                    ? "border-gold bg-gold/10 shadow-lg shadow-gold/10"
                    : "border-gray-200 bg-white"
                }`}
              >
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-gray-500">{formatKickoff(match.kickoff_at)}</p>
                    <h2 className="mt-2 text-xl font-bold text-gray-900 sm:text-2xl">
                      {match.home_team} <span className="text-gold">vs</span> {match.away_team}
                    </h2>
                    {savedPredictionLabel && (
                      <p className="mt-2 text-sm font-medium text-gray-500">
                        Saved prediction: <span className="text-gray-900">{savedPredictionLabel}</span>
                      </p>
                    )}
                  </div>
                  <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${locked ? "bg-red-50 text-red-700" : "bg-gold/10 text-gold"}`}>
                    {locked ? "Prediction locked" : "Open"}
                  </span>
                </div>

                {locked ? (
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-600">
                    Prediction locked
                  </div>
                ) : (
                  <form action={savePrediction} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <input type="hidden" name="match_id" value={match.id} />
                    <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 sm:flex-1">
                      <label className="min-w-0">
                        <span className="mb-2 block truncate text-sm font-semibold text-gray-700">{match.home_team}</span>
                        <input
                          type="number"
                          name="home_score"
                          min="0"
                          max="20"
                          step="1"
                          inputMode="numeric"
                          required
                          defaultValue={savedScore?.home_score ?? ""}
                          aria-label={`${match.home_team} score`}
                          className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-center text-xl font-bold text-gray-900 outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/20 sm:max-w-24"
                        />
                      </label>
                      <span className="pb-3 text-xl font-bold text-gold">-</span>
                      <label className="min-w-0">
                        <span className="mb-2 block truncate text-sm font-semibold text-gray-700">{match.away_team}</span>
                        <input
                          type="number"
                          name="away_score"
                          min="0"
                          max="20"
                          step="1"
                          inputMode="numeric"
                          required
                          defaultValue={savedScore?.away_score ?? ""}
                          aria-label={`${match.away_team} score`}
                          className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-center text-xl font-bold text-gray-900 outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/20 sm:max-w-24"
                        />
                      </label>
                    </div>
                    <button
                      type="submit"
                      className="rounded-2xl border border-gold bg-gold px-5 py-3 text-sm font-bold text-black shadow-lg shadow-gold/20 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-gold/30"
                    >
                      {savedPredictionLabel ? "Update prediction" : "Save prediction"}
                    </button>
                  </form>
                )}
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
