import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CountryRow = {
  code: string;
  name: string;
  flag_emoji: string | null;
};

type ProfileCountryRelation = CountryRow | CountryRow[] | null;

type LeaderboardProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
  points: number | null;
  correct_predictions: number | null;
  total_predictions: number | null;
  country_code: string | null;
  created_at: string | null;
  countries: ProfileCountryRelation;
};

type RankedLeaderboardProfile = LeaderboardProfile & {
  rank: number;
  country: CountryRow | null;
};

type LeaderboardPageProps = {
  searchParams?: Promise<{
    country?: string | string[];
  }>;
};

const getCountryRelation = (country: ProfileCountryRelation) =>
  Array.isArray(country) ? (country[0] ?? null) : country;

const normalizeCountryCode = (countryCode: string | null | undefined) =>
  countryCode?.trim().toUpperCase() ?? "";

const getCountryLabel = (country: CountryRow | null, countryCode: string | null) => {
  if (country) {
    return `${country.flag_emoji ?? "🏳️"} ${country.name}`;
  }

  return countryCode ? `🏳️ ${countryCode}` : "🏳️ No country";
};

const getPlayerName = (player: LeaderboardProfile, currentUserId: string, currentUserEmail?: string | null) =>
  player.display_name?.trim() ||
  player.username?.trim() ||
  (player.id === currentUserId ? currentUserEmail ?? null : null) ||
  "Player";

const getAccuracy = (correctPredictions: number, totalPredictions: number) => {
  if (totalPredictions === 0) {
    return "0%";
  }

  return `${Math.round((correctPredictions / totalPredictions) * 100)}%`;
};

const hasScoredPrediction = (player: LeaderboardProfile) =>
  (player.total_predictions ?? 0) > 0 ||
  (player.correct_predictions ?? 0) > 0 ||
  (player.points ?? 0) > 0;

const sortLeaderboardProfiles = (profiles: LeaderboardProfile[]) =>
  [...profiles].sort((first, second) => {
    const pointsDelta = (second.points ?? 0) - (first.points ?? 0);
    if (pointsDelta !== 0) return pointsDelta;

    const correctDelta = (second.correct_predictions ?? 0) - (first.correct_predictions ?? 0);
    if (correctDelta !== 0) return correctDelta;

    const totalDelta = (first.total_predictions ?? 0) - (second.total_predictions ?? 0);
    if (totalDelta !== 0) return totalDelta;

    const firstCreatedAt = first.created_at ? new Date(first.created_at).getTime() : Number.MAX_SAFE_INTEGER;
    const secondCreatedAt = second.created_at ? new Date(second.created_at).getTime() : Number.MAX_SAFE_INTEGER;
    const createdAtDelta = firstCreatedAt - secondCreatedAt;
    if (createdAtDelta !== 0) return createdAtDelta;

    return first.id.localeCompare(second.id);
  });

const rankProfiles = (profiles: LeaderboardProfile[], countryByCode: Map<string, CountryRow>): RankedLeaderboardProfile[] =>
  sortLeaderboardProfiles(profiles).map((profile, index) => {
    const countryCode = normalizeCountryCode(profile.country_code);
    const country = getCountryRelation(profile.countries) ?? countryByCode.get(countryCode) ?? null;

    return {
      ...profile,
      rank: index + 1,
      country,
    };
  });

function LeaderboardTable({
  rows,
  currentUserId,
  currentUserEmail,
  emptyMessage,
}: {
  rows: RankedLeaderboardProfile[];
  currentUserId: string;
  currentUserEmail?: string | null;
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-10 text-center">
        <p className="text-sm font-semibold text-gray-900">{emptyMessage}</p>
        <p className="mt-2 text-sm text-gray-500">Check back after predictions are scored.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-surface-border bg-white shadow-sm">
      {rows.map((player) => {
        const isCurrentUser = player.id === currentUserId;
        const points = player.points ?? 0;
        const correctPredictions = player.correct_predictions ?? 0;
        const totalPredictions = player.total_predictions ?? 0;

        return (
          <div
            key={player.id}
            className={`grid gap-4 border-b border-surface-border p-4 last:border-b-0 sm:grid-cols-[72px_1fr_auto] sm:items-center sm:p-5 ${
              isCurrentUser ? "bg-gold/10 ring-1 ring-inset ring-gold/40" : "bg-white"
            }`}
          >
            <div className="flex items-center gap-3 sm:block">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-50 text-lg font-bold text-gold ring-1 ring-gray-100">
                {player.rank}
              </div>
              {isCurrentUser && (
                <span className="rounded-full bg-gold px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white sm:mt-2 sm:inline-block">
                  You
                </span>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-lg font-bold text-gray-900">
                  {getPlayerName(player, currentUserId, currentUserEmail)}
                </p>
                {isCurrentUser && (
                  <span className="rounded-full border border-gold/30 bg-white px-2.5 py-1 text-xs font-semibold text-gold">
                    Your row
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {getCountryLabel(player.country, player.country_code)} · {correctPredictions}/{totalPredictions} correct · {getAccuracy(correctPredictions, totalPredictions)} accuracy
              </p>
            </div>

            <div className="rounded-2xl bg-gray-50 px-4 py-3 text-left sm:min-w-32 sm:text-right">
              <p className="text-2xl font-bold gold-text-gradient">{points}</p>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">points</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function LeaderboardPage({ searchParams }: LeaderboardPageProps) {
  const supabase = await createClient();
  const resolvedSearchParams = await searchParams;
  const selectedCountryParam = Array.isArray(resolvedSearchParams?.country)
    ? resolvedSearchParams?.country[0]
    : resolvedSearchParams?.country;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/leaderboard");
  }

  const [profileRes, profilesRes, countriesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("country_code")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, display_name, username, points, correct_predictions, total_predictions, country_code, created_at, countries(code, name, flag_emoji)"),
    supabase
      .from("countries")
      .select("code, name, flag_emoji")
      .order("name", { ascending: true }),
  ]);

  const profile = profileRes.data;

  if (!profile?.country_code) {
    redirect("/onboarding/country");
  }

  const countries = (countriesRes.error ? [] : (countriesRes.data as CountryRow[] | null)) ?? [];
  const countryByCode = new Map(countries.map((country) => [normalizeCountryCode(country.code), country]));
  const profiles = (profilesRes.error ? [] : (profilesRes.data as LeaderboardProfile[] | null)) ?? [];
  const scoredProfiles = profiles.filter(hasScoredPrediction);
  const globalRows = rankProfiles(scoredProfiles, countryByCode);

  const userCountryCode = normalizeCountryCode(profile.country_code);
  const selectedCountryCode = normalizeCountryCode(selectedCountryParam) || userCountryCode;
  const selectedCountry = countryByCode.get(selectedCountryCode) ?? null;
  const countryProfiles = profiles.filter(
    (player) => normalizeCountryCode(player.country_code) === selectedCountryCode,
  );
  const countryRows = rankProfiles(countryProfiles.filter(hasScoredPrediction), countryByCode);
  const userGlobalRank = globalRows.find((player) => player.id === user.id)?.rank ?? null;
  const userCountryRank = rankProfiles(
    scoredProfiles.filter((player) => normalizeCountryCode(player.country_code) === userCountryCode),
    countryByCode,
  ).find((player) => player.id === user.id)?.rank ?? null;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link href="/dashboard" className="text-sm font-medium text-gray-500 transition hover:text-gold">← Dashboard</Link>
          <div className="rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold">Leaderboard</div>
        </header>

        <section className="mb-6 rounded-3xl border border-surface-border bg-white p-6 shadow-sm sm:p-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-gold">Scored predictions</p>
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 sm:text-5xl">Global and country <span className="gold-text-gradient">rankings</span></h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-500">
                Players are ranked by points, then correct predictions, fewer total predictions, and earliest join date.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-72">
              <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Your rank</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{userGlobalRank ? `#${userGlobalRank}` : "—"}</p>
              </div>
              <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Country rank</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{userCountryRank ? `#${userCountryRank}` : "—"}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Global leaderboard</p>
              <h2 className="mt-1 text-2xl font-bold text-gray-900">Top players</h2>
            </div>
          </div>
          <LeaderboardTable
            rows={globalRows.slice(0, 50)}
            currentUserId={user.id}
            currentUserEmail={user.email}
            emptyMessage="No predictions scored yet"
          />
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Country leaderboard</p>
              <h2 className="mt-1 text-2xl font-bold text-gray-900">
                {selectedCountry ? `${selectedCountry.flag_emoji ?? "🏳️"} ${selectedCountry.name}` : selectedCountryCode}
              </h2>
            </div>
            <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
              {countries.map((country) => {
                const isSelected = normalizeCountryCode(country.code) === selectedCountryCode;

                return (
                  <Link
                    key={country.code}
                    href={`/leaderboard?country=${encodeURIComponent(country.code)}`}
                    className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      isSelected
                        ? "border-gold bg-gold text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gold/60 hover:text-gray-900"
                    }`}
                  >
                    {country.flag_emoji ?? "🏳️"} {country.name}
                  </Link>
                );
              })}
            </div>
          </div>

          <LeaderboardTable
            rows={countryRows.slice(0, 50)}
            currentUserId={user.id}
            currentUserEmail={user.email}
            emptyMessage={countryProfiles.length === 0 ? "No players in this country yet" : "No predictions scored yet"}
          />
        </section>
      </div>
    </main>
  );
}
