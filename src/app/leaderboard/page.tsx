import Link from "next/link";
import { redirect } from "next/navigation";
import { getCountryFlag } from "@/lib/domain/countries";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ country?: string }>;

type LeaderboardProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
  points: number | null;
  country_code: string | null;
  is_founder: boolean | null;
  created_at: string | null;
};

type LeaderboardRow = {
  player: LeaderboardProfile;
  globalRank: number;
  countryRank: number;
  referralCount: number;
};

type StoredLeaderboardRow = {
  user_id: string | null;
  referral_count: number | null;
};

type CountryRow = {
  code: string | null;
  flag_emoji: string | null;
};

const normalizeCountryFilter = (country: string | undefined) => {
  const normalized = country?.trim().toUpperCase();
  return normalized || null;
};

const getCountryFilterFlags = (countryFilter: string | null, countries: CountryRow[]) => {
  if (!countryFilter) return new Set<string>();

  const flags = new Set<string>();
  const generatedFlag = getCountryFlag(countryFilter);
  if (generatedFlag) flags.add(generatedFlag);

  countries.forEach((country) => {
    if (country.code?.trim().toUpperCase() === countryFilter && country.flag_emoji) {
      flags.add(country.flag_emoji);
    }
  });

  return flags;
};

const countryCodeMatchesFilter = (
  countryCode: string | null,
  countryFilter: string | null,
  matchingFlags: Set<string>,
  countries: CountryRow[],
) => {
  if (!countryFilter) return true;

  const normalizedCode = countryCode?.trim().toUpperCase();
  if (!normalizedCode) return false;
  if (normalizedCode === countryFilter) return true;

  const generatedFlag = getCountryFlag(normalizedCode);
  if (generatedFlag && matchingFlags.has(generatedFlag)) return true;

  return countries.some(
    (country) => country.code?.trim().toUpperCase() === normalizedCode && country.flag_emoji && matchingFlags.has(country.flag_emoji),
  );
};

const buildLeaderboardRows = (
  profiles: LeaderboardProfile[],
  referralCounts: Map<string, number>,
): LeaderboardRow[] => {
  const sortedProfiles = [...profiles].sort((first, second) => {
    const pointDelta = (second.points ?? 0) - (first.points ?? 0);
    if (pointDelta !== 0) return pointDelta;

    return (first.created_at ?? "").localeCompare(second.created_at ?? "");
  });
  const countryRankCounters = new Map<string, number>();

  return sortedProfiles.map((player, index) => {
    const countryCode = player.country_code?.trim().toUpperCase() || "";
    const nextCountryRank = (countryRankCounters.get(countryCode) ?? 0) + 1;
    countryRankCounters.set(countryCode, nextCountryRank);

    return {
      player,
      globalRank: index + 1,
      countryRank: nextCountryRank,
      referralCount: referralCounts.get(player.id) ?? 0,
    };
  });
};

export default async function LeaderboardPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const countryFilter = normalizeCountryFilter(params.country);
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

  const [{ data: profiles }, { data: storedLeaderboardRows }, { data: countries }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, username, points, country_code, is_founder, created_at")
      .order("points", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(500),
    supabase
      .from("leaderboards")
      .select("user_id, referral_count"),
    supabase
      .from("countries")
      .select("code, flag_emoji"),
  ]);

  const referralCounts = new Map(
    ((storedLeaderboardRows ?? []) as unknown as StoredLeaderboardRow[])
      .filter((row) => row.user_id)
      .map((row) => [row.user_id as string, row.referral_count ?? 0]),
  );
  const countryRows = (countries ?? []) as CountryRow[];
  const matchingCountryFlags = getCountryFilterFlags(countryFilter, countryRows);
  const leaderboardRows = buildLeaderboardRows((profiles ?? []) as LeaderboardProfile[], referralCounts);
  const displayedRows = leaderboardRows
    .filter((row) => countryCodeMatchesFilter(row.player.country_code, countryFilter, matchingCountryFlags, countryRows))
    .slice(0, 50);
  const title = countryFilter ? `${countryFilter} leaderboard` : "Global leaderboard";

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="text-sm text-gray-500 transition hover:text-gold">← Dashboard</Link>
          <div className="rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold">Leaderboard</div>
        </header>

        <section className="mb-6 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-gold">Top players</p>
          <h1 className="text-3xl font-bold text-gray-900 sm:text-5xl">
            {countryFilter ? countryFilter : "Global"} <span className="gold-text-gradient">leaderboard</span>
          </h1>
          <p className="mt-3 text-sm text-gray-500">
            {countryFilter
              ? "Country ranks are calculated against players representing this country."
              : "Global ranks are calculated from the latest player points."}
          </p>
        </section>

        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm" aria-label={title}>
          {displayedRows.map((row) => {
            const rank = countryFilter ? row.countryRank : row.globalRank;

            return (
              <div key={row.player.id} className="flex items-center gap-4 border-b border-gray-200 p-4 last:border-b-0 sm:p-5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gray-50 font-bold text-gold">
                  {rank}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-gray-900">
                    {row.player.display_name || row.player.username || "Player"} {row.player.is_founder ? "🏅" : ""}
                  </p>
                  <p className="text-xs text-gray-500">
                    {row.player.country_code ?? "—"} · Global rank {row.globalRank} · Country rank {row.countryRank} · Referrals {row.referralCount}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold gold-text-gradient">{row.player.points ?? 0}</p>
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">pts</p>
                </div>
              </div>
            );
          })}

          {displayedRows.length === 0 && (
            <div className="p-10 text-center text-gray-500">
              {countryFilter
                ? `No ${countryFilter} leaderboard rows are available yet.`
                : "Leaderboard rows will appear after players start scoring points."}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
