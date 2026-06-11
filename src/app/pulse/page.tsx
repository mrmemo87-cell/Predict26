import type { Metadata } from "next";
import Link from "next/link";
import PulsePostCard from "@/components/pulse/PulsePostCard";
import { fetchPublishedPulsePosts } from "@/lib/data/pulse";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "World Cup Pulse | Predict26",
  description:
    "Follow matchday updates, prediction trends, country stories, and prize news for World Cup 2026 on Predict26.",
};

export default async function PulsePage() {
  const supabase = await createClient();
  const [posts, countriesRes] = await Promise.all([
    fetchPublishedPulsePosts(supabase, 30),
    supabase.from("countries").select("code, flag_emoji"),
  ]);
  const countries = countriesRes.error ? [] : countriesRes.data ?? [];

  return (
    <main className="min-h-screen bg-gray-50 bg-[radial-gradient(circle_at_top_left,rgba(22,163,74,0.12),transparent_34%),linear-gradient(90deg,rgba(22,163,74,0.05)_1px,transparent_1px),linear-gradient(0deg,rgba(22,163,74,0.04)_1px,transparent_1px)] bg-[size:auto,44px_44px,44px_44px] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <section className="overflow-hidden rounded-[2rem] border border-emerald-100 bg-white shadow-sm">
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr_0.8fr] lg:p-10">
            <div>
              <p className="inline-flex rounded-full bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-800">
                World Cup Pulse
              </p>
              <h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight text-gray-950 sm:text-5xl">
                What’s moving before kickoff
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-gray-700 sm:text-lg">
                Follow the daily story of World Cup 2026: matchday watch notes, country angles, prediction trends, leaderboard buzz, and prize updates — all tied back to what you can predict next.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link href="/predictions" prefetch className="inline-flex items-center justify-center rounded-full bg-emerald-700 px-6 py-3 text-sm font-black text-white shadow-sm transition hover:bg-emerald-800">
                  See what to predict next
                </Link>
                <Link href="/leaderboard" prefetch className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-6 py-3 text-sm font-black text-emerald-800 transition hover:bg-emerald-100">
                  View leaderboard
                </Link>
              </div>
            </div>
            <div className="rounded-3xl border border-gold/20 bg-gold/10 p-5">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-gold-dark">
                Matchday watch
              </p>
              <p className="mt-3 text-2xl font-black text-gray-950">Your quick companion</p>
              <p className="mt-3 text-sm leading-6 text-gray-700">
                Pulse is curated by Predict26 admins. No automatic scraping, no copied articles — just short, useful updates that help you choose your next move.
              </p>
              <a href="https://t.me/Predict26Official" target="_blank" rel="noreferrer" className="mt-5 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-emerald-800 shadow-sm transition hover:bg-emerald-50">
                Join the Telegram crowd
              </a>
            </div>
          </div>
        </section>

        {posts.length > 0 ? (
          <section className="mt-8 grid gap-5">
            {posts.map((post) => (
              <PulsePostCard key={post.id} post={post} countries={countries} />
            ))}
          </section>
        ) : (
          <section className="mt-8 rounded-3xl border border-dashed border-emerald-200 bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-black text-gray-950">Pulse updates are warming up.</p>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-gray-600">
              Check back soon for matchday notes, prediction trends, and prize updates.
            </p>
            <Link href="/predictions" prefetch className="mt-6 inline-flex rounded-full bg-emerald-700 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-800">
              Predict upcoming matches
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
