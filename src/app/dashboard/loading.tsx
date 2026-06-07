import DashboardSkeleton from "@/components/dashboard/DashboardSkeleton";

export default function DashboardLoading() {
  return (
    <main className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚽</span>
            <span className="text-xl font-bold gold-text-gradient">Predict26</span>
          </div>
        </header>
        <DashboardSkeleton />
      </div>
    </main>
  );
}
