interface PerformanceCardProps {
  submittedPredictions: number;
  scoredPredictions: number;
  correctPredictions: number;
}

export default function PerformanceCard({
  submittedPredictions,
  scoredPredictions,
  correctPredictions,
}: PerformanceCardProps) {
  const accuracy = scoredPredictions > 0
    ? `${Math.round((correctPredictions / scoredPredictions) * 100)}%`
    : "Not scored yet";

  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="mb-5 text-lg font-bold text-gray-900">📊 My Performance</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-2xl font-bold gold-text-gradient">{submittedPredictions}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-gray-500">Submitted</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{scoredPredictions}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-gray-500">Scored</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{correctPredictions}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-gray-500">Correct</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-xl font-bold text-gray-900 sm:text-2xl">{accuracy}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-gray-500">Accuracy</p>
        </div>
      </div>
    </section>
  );
}
