interface PerformanceCardProps {
  points: number;
  submittedPredictions: number;
  scoredPredictions: number;
  correctPredictions: number;
}

const statCards = [
  { key: "points", label: "Points", helper: "Tournament total", tone: "gold" },
  { key: "submitted", label: "Submitted", helper: "Saved predictions", tone: "green" },
  { key: "scored", label: "Scored", helper: "Accuracy denominator", tone: "slate" },
  { key: "correct", label: "Correct", helper: "Exact or result", tone: "emerald" },
] as const;

export default function PerformanceCard({
  points,
  submittedPredictions,
  scoredPredictions,
  correctPredictions,
}: PerformanceCardProps) {
  const accuracy = scoredPredictions > 0
    ? `${Math.round((correctPredictions / scoredPredictions) * 100)}%`
    : "Not scored yet";
  const values = {
    points,
    submitted: submittedPredictions,
    scored: scoredPredictions,
    correct: correctPredictions,
  };

  return (
    <section className="relative overflow-hidden rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm sm:p-8">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(22,163,74,0.06)_1px,transparent_1px),linear-gradient(0deg,rgba(22,163,74,0.04)_1px,transparent_1px)] bg-[size:34px_34px]" />
      <div className="relative">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">My Performance</p>
            <h2 className="mt-1 text-xl font-black text-gray-900">Scoreboard summary</h2>
          </div>
          <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-sm font-bold text-gold-dark">
            Accuracy: {accuracy}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {statCards.map((card) => (
            <div
              key={card.key}
              className="rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-sm"
            >
              <p
                className={`text-2xl font-black ${
                  card.tone === "gold"
                    ? "gold-text-gradient"
                    : card.tone === "emerald"
                      ? "text-emerald-700"
                      : card.tone === "green"
                        ? "text-green-700"
                        : "text-gray-900"
                }`}
              >
                {values[card.key]}
              </p>
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-gray-700">{card.label}</p>
              <p className="mt-1 text-xs text-gray-500">{card.helper}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm leading-6 text-gray-600">
          Accuracy uses scored predictions only, so pending matches never lower your percentage.
        </p>
      </div>
    </section>
  );
}
