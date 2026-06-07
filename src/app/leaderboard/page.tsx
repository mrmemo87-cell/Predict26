import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type LeaderboardProfile = {
  display_name: string | null;
  username: string | null;
  points: number | null;
  country_code: string | null;
  is_founder: boolean | null;
};

type LeaderboardRow = {
  global_rank: number | null;
  country_rank: number | null;
  referral_count: number | null;
  profiles: LeaderboardProfile | LeaderboardProfile[] | null;
};

const getLeaderboardProfile = (profile: LeaderboardRow["profiles"]) =>
  Array.isArray(profile) ? (profile[0] ?? null) : profile;

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/leaderboard");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("country_code")
    .eq("id", user.id)
    .single();

  if (!profile?.country_code) {
    redirect("/onboarding/country");
  }

  const { data: rows } = await supabase
    .from("leaderboards")
    .select("global_rank, country_rank, referral_count, profiles(display_name, username, points, country_code, is_founder)")
    .order("global_rank", { ascending: true, nullsFirst: false })
    .limit(50);

  return (
    <main className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="text-sm text-gray-400 transition hover:text-gold">← Dashboard</Link>
          <div className="rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold">Leaderboard</div>
        </header>

        <section className="mb-6 rounded-3xl border border-surface-border bg-surface p-6 sm:p-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-gold">Top players</p>
          <h1 className="text-3xl font-bold sm:text-5xl">Global <span className="gold-text-gradient">leaderboard</span></h1>
        </section>

        <div className="overflow-hidden rounded-3xl border border-surface-border bg-surface">
          {((rows ?? []) as unknown as LeaderboardRow[]).map((row, index) => {
            const player = getLeaderboardProfile(row.profiles);

            return (
              <div key={`${player?.username ?? "player"}-${index}`} className="flex items-center gap-4 border-b border-surface-border p-4 last:border-b-0 sm:p-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-background font-bold text-gold">
                  {row.global_rank ?? index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-white">
                    {player?.display_name || player?.username || "Player"} {player?.is_founder ? "🏅" : ""}
                  </p>
                  <p className="text-xs text-gray-500">{player?.country_code ?? "—"} · Country rank {row.country_rank ?? "—"} · Referrals {row.referral_count ?? 0}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold gold-text-gradient">{player?.points ?? 0}</p>
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">pts</p>
                </div>
              </div>
            );
          })}

          {(!rows || rows.length === 0) && (
            <div className="p-10 text-center text-gray-400">Leaderboard rows will appear after players start scoring points.</div>
          )}
        </div>
      </div>
    </main>
  );
}
