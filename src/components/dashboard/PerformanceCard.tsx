interface PerformanceCardProps {
  totalPredictions: number;
  correctPredictions: number;
}

export default function PerformanceCard({ totalPredictions, correctPredictions }: PerformanceCardProps) {
  const accuracy = totalPredictions > 0
    ? Math.round((correctPredictions / totalPredictions) * 100)
    : 0;

  return (
    <section className="rounded-3xl border border-surface-border bg-surface p-6 sm:p-8">
      <h2 className="mb-5 text-lg font-bold text-white">📊 My Performance</h2>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-surface-border bg-background/80 p-4 text-center">
          <p className="text-2xl font-bold gold-text-gradient">{totalPredictions}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-gray-500">Total</p>
        </div>
        <div className="rounded-2xl border border-surface-border bg-background/80 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{correctPredictions}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-gray-500">Correct</p>
        </div>
        <div className="rounded-2xl border border-surface-border bg-background/80 p-4 text-center">
          <p className="text-2xl font-bold text-white">{accuracy}%</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-gray-500">Accuracy</p>
        </div>
      </div>
    </section>
  );
}
