import { redirect } from "next/navigation";
import { getDashboardData } from "@/lib/data/dashboard";

const renderMetric = (label: string, value: string | number) => (
  <article className="glass-panel rounded-2xl p-5">
    <p className="text-xs uppercase tracking-wider text-[var(--muted)]">{label}</p>
    <p className="mt-2 text-2xl font-semibold text-[var(--gold)]">{value}</p>
  </article>
);

export default async function DashboardPage() {
  const dashboardData = await getDashboardData();

  if (!dashboardData) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-8 sm:px-8 lg:py-10">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <p className="text-sm text-[var(--muted)]">Track your rank, points, accuracy, and prize zone progress.</p>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {renderMetric("Current Rank", dashboardData.rank ?? "—")}
        {renderMetric("Total Points", dashboardData.points)}
        {renderMetric("Accuracy", `${dashboardData.accuracy}%`)}
        {renderMetric("Distance to Top 3", dashboardData.distanceToTop3 ?? "—")}
        {renderMetric("Distance to Prize Zone", dashboardData.distanceToPrizeZone ?? "—")}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="glass-panel rounded-2xl p-5">
          <h2 className="text-lg font-semibold">Upcoming Matches</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {dashboardData.upcomingMatches.length === 0 ? (
              <li className="text-[var(--muted)]">No scheduled matches yet.</li>
            ) : (
              dashboardData.upcomingMatches.map((match) => (
                <li key={match.id} className="rounded-xl border border-[var(--border)] px-3 py-2">
                  {match.home_team} vs {match.away_team}
                  <span className="ml-2 text-xs text-[var(--muted)]">
                    {new Date(match.kickoff_at).toLocaleString()}
                  </span>
                </li>
              ))
            )}
          </ul>
        </article>

        <article className="glass-panel rounded-2xl p-5">
          <h2 className="text-lg font-semibold">Recent Predictions</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {dashboardData.recentPredictions.length === 0 ? (
              <li className="text-[var(--muted)]">No predictions submitted yet.</li>
            ) : (
              dashboardData.recentPredictions.map((prediction) => (
                <li key={prediction.id} className="rounded-xl border border-[var(--border)] px-3 py-2">
                  {(prediction.matches?.home_team ?? "TBD") + " vs " + (prediction.matches?.away_team ?? "TBD")}
                  <span className="ml-2 text-xs text-[var(--muted)]">
                    {prediction.choice.toUpperCase()} · {prediction.points_awarded} pts
                  </span>
                </li>
              ))
            )}
          </ul>
        </article>
      </section>
    </main>
  );
}
