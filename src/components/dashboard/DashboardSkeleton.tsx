export default function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Hero skeleton */}
      <div className="rounded-3xl border border-surface-border bg-surface p-6 sm:p-8">
        <div className="mb-3 h-4 w-24 rounded bg-surface-light" />
        <div className="h-8 w-64 rounded bg-surface-light" />
        <div className="mt-4 flex gap-3">
          <div className="h-6 w-20 rounded-full bg-surface-light" />
          <div className="h-6 w-28 rounded-full bg-surface-light" />
        </div>
        <div className="mt-5 h-10 w-32 rounded-full bg-surface-light" />
      </div>

      {/* Performance skeleton */}
      <div className="rounded-3xl border border-surface-border bg-surface p-6 sm:p-8">
        <div className="mb-5 h-5 w-36 rounded bg-surface-light" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-surface-border bg-background/80 p-4">
              <div className="mx-auto h-7 w-10 rounded bg-surface-light" />
              <div className="mx-auto mt-2 h-3 w-12 rounded bg-surface-light" />
            </div>
          ))}
        </div>
      </div>

      {/* Matches skeleton */}
      <div className="rounded-3xl border border-surface-border bg-surface p-6 sm:p-8">
        <div className="mb-5 h-5 w-40 rounded bg-surface-light" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-surface-border bg-background/60 p-4">
              <div className="h-5 w-48 rounded bg-surface-light" />
              <div className="mt-2 h-4 w-32 rounded bg-surface-light" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
