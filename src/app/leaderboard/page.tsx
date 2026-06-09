import Link from "next/link";
import PendingSubmitButton from "@/components/PendingSubmitButton";
import { redirect } from "next/navigation";
import {
  buildFlagLookup,
  resolveCountryFlag,
  getCountryFlag,
} from "@/lib/domain/countries";
import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ country?: string }>;

type LeaderboardProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
  points: number | null;
  correct_predictions: number | null;
  total_predictions: number | null;
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
  name: string | null;
  flag_emoji: string | null;
};

const normalizeCountryFilter = (country: string | undefined) => {
  const normalized = country?.trim().toUpperCase();
  return normalized || null;
};

const getCountryFilterFlags = (
  countryFilter: string | null,
  countries: CountryRow[],
) => {
  if (!countryFilter) return new Set<string>();

  const flags = new Set<string>();
  const generatedFlag = getCountryFlag(countryFilter);
  if (generatedFlag) flags.add(generatedFlag);

  countries.forEach((country) => {
    if (
      country.code?.trim().toUpperCase() === countryFilter &&
      country.flag_emoji
    ) {
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
    (country) =>
      country.code?.trim().toUpperCase() === normalizedCode &&
      country.flag_emoji &&
      matchingFlags.has(country.flag_emoji),
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

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
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
    .maybeSingle();

  if (!profile?.country_code) {
    redirect("/onboarding/country");
  }

  const [
    { data: profiles },
    { data: storedLeaderboardRows },
    { data: countries },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, display_name, username, points, correct_predictions, total_predictions, country_code, is_founder, created_at",
      )
      .order("points", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(500),
    supabase.from("leaderboards").select("user_id, referral_count"),
    supabase
      .from("countries")
      .select("code, name, flag_emoji")
      .order("name", { ascending: true }),
  ]);

  const referralCounts = new Map(
    ((storedLeaderboardRows ?? []) as unknown as StoredLeaderboardRow[])
      .filter((row) => row.user_id)
      .map((row) => [row.user_id as string, row.referral_count ?? 0]),
  );
  const countryRows = (countries ?? []) as CountryRow[];
  const flagLookup = buildFlagLookup(countryRows);
  const matchingCountryFlags = getCountryFilterFlags(
    countryFilter,
    countryRows,
  );
  const leaderboardRows = buildLeaderboardRows(
    (profiles ?? []) as LeaderboardProfile[],
    referralCounts,
  );
  const displayedRows = leaderboardRows
    .filter((row) =>
      countryCodeMatchesFilter(
        row.player.country_code,
        countryFilter,
        matchingCountryFlags,
        countryRows,
      ),
    )
    .slice(0, 50);
  const title = countryFilter
    ? `${countryFilter} leaderboard`
    : "Global leaderboard";

  return (
    <main className="min-h-screen bg-gray-50 bg-[radial-gradient(circle_at_top_left,rgba(22,163,74,0.10),transparent_30%)] px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-gray-500 transition hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            ← Dashboard
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/rules"
              className="text-sm font-medium text-gray-500 transition hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              Rules
            </Link>
            <div className="rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              Leaderboard
            </div>
          </div>
        </header>

        <section className="mb-6 rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm sm:p-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-emerald-700">
            Top players
          </p>
          <h1 className="text-3xl font-black text-gray-900 sm:text-5xl">
            {countryFilter ? countryFilter : "Global"}{" "}
            <span className="gold-text-gradient">leaderboard</span>
          </h1>
          <p className="mt-3 text-sm text-gray-500">
            {countryFilter
              ? "Country ranks are calculated against players representing this country."
              : "Global ranks are calculated from the latest player points."}
          </p>
          <form
            action="/leaderboard"
            className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <label
              htmlFor="country"
              className="text-sm font-semibold text-gray-700"
            >
              Country
            </label>
            <select
              id="country"
              name="country"
              defaultValue={countryFilter ?? ""}
              className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-gold focus:ring-4 focus:ring-gold/20"
            >
              <option value="">Global leaderboard</option>
              {countryRows.map((country) => (
                <option
                  key={country.code ?? country.name}
                  value={country.code ?? ""}
                >
                  {country.flag_emoji ? `${country.flag_emoji} ` : ""}
                  {country.name ?? country.code}
                </option>
              ))}
            </select>
            <PendingSubmitButton
              idleText="View ranks"
              pendingText="Loading ranks..."
              className="rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            />
          </form>
        </section>

        <div
          className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm"
          aria-label={title}
        >
          <div className="grid grid-cols-[52px_minmax(0,1fr)_78px] gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-gray-500 sm:grid-cols-[82px_minmax(0,1fr)_260px_110px] sm:px-5">
            <span>Rank</span>
            <span>Player</span>
            <span className="hidden sm:block">Form</span>
            <span className="text-right">Points</span>
          </div>
          {displayedRows.map((row) => {
            const rank = countryFilter ? row.countryRank : row.globalRank;
            const isCurrentUser = row.player.id === user.id;
            const correct = row.player.correct_predictions ?? 0;
            const total = row.player.total_predictions ?? 0;
            const accuracy =
              total > 0 ? `${Math.round((correct / total) * 100)}%` : "—";
            const medal =
              rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;

            return (
              <div
                key={row.player.id}
                className={`grid grid-cols-[52px_minmax(0,1fr)_78px] items-center gap-2 border-b p-4 last:border-b-0 sm:grid-cols-[82px_minmax(0,1fr)_260px_110px] sm:p-5 ${
                  isCurrentUser
                    ? "border-gold/40 bg-gold/10 ring-1 ring-inset ring-gold/30"
                    : "border-gray-200"
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 sm:h-12 sm:w-12 items-center justify-center rounded-2xl font-black ${rank <= 3 ? "bg-gold/15 text-gold-dark" : "bg-emerald-50 text-emerald-800"}`}
                >
                  {medal ?? rank}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-black text-gray-900">
                    {row.player.display_name || row.player.username || "Player"}{" "}
                    {row.player.is_founder ? "🏅" : ""}
                    {isCurrentUser ? (
                      <span className="ml-2 rounded-full bg-gold px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black">
                        You
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {resolveCountryFlag(row.player.country_code, flagLookup)
                      ? `${resolveCountryFlag(row.player.country_code, flagLookup)} `
                      : ""}
                    {row.player.country_code ?? "—"} · Global #{row.globalRank}{" "}
                    · Country #{row.countryRank} · Referrals {row.referralCount}
                  </p>
                </div>
                <div className="hidden grid-cols-3 gap-2 sm:grid">
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 text-center">
                    <p className="text-sm font-black text-gray-900">
                      {correct}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      Correct
                    </p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 text-center">
                    <p className="text-sm font-black text-gray-900">{total}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      Scored
                    </p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-3 py-2 text-center">
                    <p className="text-sm font-black text-emerald-700">
                      {accuracy}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      Accuracy
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black gold-text-gradient">
                    {row.player.points ?? 0}
                  </p>
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500">
                    pts
                  </p>
                  <p className="mt-1 text-xs text-gray-500 sm:hidden">
                    {correct}/{total} · {accuracy}
                  </p>
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
