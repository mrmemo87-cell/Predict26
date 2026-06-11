import Link from "next/link";
import PulsePostCard from "@/components/pulse/PulsePostCard";
import type { PulsePost } from "@/lib/data/pulse";
import type { FlagLookupRow } from "@/lib/domain/countries";

export default function PulsePreview({
  posts,
  countries,
}: {
  posts: PulsePost[];
  countries: FlagLookupRow[];
}) {
  return (
    <section className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
            World Cup Pulse
          </p>
          <h2 className="mt-2 text-2xl font-black text-gray-950">What changed today</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Matchday notes, prediction trends, and next actions for your picks.
          </p>
        </div>
        <Link
          href="/pulse"
          prefetch
          className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800 transition hover:bg-emerald-100"
        >
          View all Pulse updates
        </Link>
      </div>

      {posts.length > 0 ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {posts.map((post) => (
            <PulsePostCard key={post.id} post={post} countries={countries} compact />
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 p-5 text-sm leading-6 text-emerald-900">
          Pulse updates are warming up. Check back soon for matchday notes, prediction trends, and prize updates.
        </div>
      )}
    </section>
  );
}
