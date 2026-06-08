import Link from "next/link";

const scoringRules = [
  { label: "Exact score", points: "5 points" },
  { label: "Correct result only", points: "2 points" },
  { label: "Possession leader", points: "1 point" },
  { label: "Predicted scorers", points: "1 point each, max 4" },
  { label: "Wrong result or bonus miss", points: "0 points" },
];

const tieBreakers = [
  "Highest total points",
  "Most exact scores",
  "Most correct results",
  "Earliest first submitted prediction if available",
  "Admin review or shared prize if still tied",
];

export default function RulesPage() {
  return (
    <main className="min-h-screen bg-gray-50 bg-[radial-gradient(circle_at_top_left,rgba(22,163,74,0.10),transparent_30%)] px-4 py-8 text-gray-900 sm:py-12">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="text-2xl">⚽</span>
            <span className="text-xl font-bold gold-text-gradient">Predict26</span>
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold-dark transition hover:border-gold hover:bg-gold/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            Sign in
          </Link>
        </header>

        <section className="mb-6 rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm sm:p-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-emerald-700">
            Rules
          </p>
          <h1 className="text-3xl font-black text-gray-900 sm:text-5xl">
            Simple rules for <span className="gold-text-gradient">Predict26</span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-600">
            Predict World Cup match scores, add optional possession and scorer bonus picks,
            and climb the global and country leaderboards after results are confirmed.
          </p>
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
            Predict26 is a friendly score prediction game — no betting, odds, wagers, or casino mechanics.
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl font-bold text-gray-900">How predictions work</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                <p className="text-sm font-semibold text-gray-900">1. Pick a score</p>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Enter the final score you think each match will have. Exact score remains the core pick.
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                <p className="text-sm font-semibold text-gray-900">2. Update before kickoff</p>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  You can change your score and available bonus picks while the match is still open.
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
                <p className="text-sm font-semibold text-gray-900">3. Lock at kickoff</p>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Score, possession, and scorer picks lock at kickoff and cannot be changed after that.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl font-bold text-gray-900">Scoring</h2>
            <div className="mt-5 grid gap-3">
              {scoringRules.map((rule) => (
                <div
                  key={rule.label}
                  className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"
                >
                  <span className="font-semibold text-gray-900">{rule.label}</span>
                  <span className="rounded-full bg-gold/10 px-3 py-1 text-sm font-bold text-gold-dark">
                    {rule.points}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl font-bold text-gray-900">Leaderboards and winners</h2>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-gray-600">
              <li>• Predict26 has a global leaderboard for all players.</li>
              <li>• Predict26 has country leaderboards for players representing each country.</li>
              <li>• Ranks update after scores are confirmed.</li>
              <li>• MVP winners are global-only for the first launch.</li>
              <li>• Country winners may be added later.</li>
            </ul>
          </section>

          <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl font-bold text-gray-900">Tie-breakers</h2>
            <ol className="mt-5 space-y-3 text-sm leading-6 text-gray-600">
              {tieBreakers.map((tieBreaker, index) => (
                <li key={tieBreaker} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/10 text-xs font-bold text-gold-dark">
                    {index + 1}
                  </span>
                  <span>{tieBreaker}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-3xl border border-gold/20 bg-gold/5 p-6 shadow-sm sm:p-8">
            <h2 className="text-2xl font-bold text-gray-900">Data disclaimer</h2>
            <p className="mt-4 text-sm leading-6 text-gray-700">
              Schedules, scores, teams, venues, lineups, referees, and live data may update.
              Admins may correct data before scoring. Users should verify important details
              from FIFA or other official sources.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
