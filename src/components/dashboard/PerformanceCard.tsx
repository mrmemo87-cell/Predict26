interface PerformanceCardProps {
  totalPredictions: number;
  correctPredictions: number;
}

export default function PerformanceCard({ totalPredictions, correctPredictions }: PerformanceCardProps) {
  const accuracy = totalPredictions > 0
    ? Math.round((correctPredictions / totalPredictions) * 100)
    : 0;

  return (
    <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="mb-5 text-lg font-bold text-gray-900">📊 My Performance</h2>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-2xl font-bold gold-text-gradient">{totalPredictions}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-gray-500">Total</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{correctPredictions}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-gray-500">Correct</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{accuracy}%</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-gray-500">Accuracy</p>
        </div>
      </div>
    </section>
  );
}
