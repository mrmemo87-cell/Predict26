import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

type Country = { name: string; flag_emoji: string | null };

type Profile = {
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  country_code: string | null;
  points: number | null;
  is_founder: boolean | null;
  referral_code: string | null;
  countries: Country | Country[] | null;
};

const getCountry = (country: Profile["countries"]) =>
  Array.isArray(country) ? (country[0] ?? null) : country;

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/dashboard");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, avatar_url, country_code, points, is_founder, referral_code, countries(name, flag_emoji)")
    .eq("id", user.id)
    .single();

  const typedProfile = profile as Profile | null;

  if (!typedProfile?.country_code) {
    redirect("/onboarding/country");
  }

  const country = getCountry(typedProfile.countries);
  const countryLabel = country ? `${country.flag_emoji ?? "🌍"} ${country.name}` : typedProfile.country_code;

  return (
    <main className="min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="text-2xl">⚽</span>
            <span className="text-xl font-bold gold-text-gradient">Predict26</span>
          </Link>
          <form action={signOut}>
            <button type="submit" className="rounded-full border border-surface-border px-4 py-2 text-sm text-gray-400 transition hover:border-gold/60 hover:text-white">
              Sign Out
            </button>
          </form>
        </header>

        <section className="mb-6 overflow-hidden rounded-3xl border border-surface-border bg-surface shadow-2xl shadow-gold/5">
          <div className="bg-[radial-gradient(circle_at_top_right,_rgba(212,175,55,0.18),_transparent_35%)] p-6 sm:p-8">
            <div className="mb-8 flex items-center gap-4">
              {typedProfile.avatar_url ? (
                <Image src={typedProfile.avatar_url} alt="Avatar" width={72} height={72} className="h-16 w-16 rounded-full border-2 border-gold/50 object-cover sm:h-[72px] sm:w-[72px]" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-gold/50 bg-background text-2xl sm:h-[72px] sm:w-[72px]">🏆</div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Welcome back</p>
                <h1 className="truncate text-2xl font-bold sm:text-4xl">{typedProfile.display_name || typedProfile.username || "Player"}</h1>
                <p className="mt-1 text-sm text-gray-400">Representing {countryLabel}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-surface-border bg-background/80 p-5">
                <p className="text-3xl font-bold gold-text-gradient">{typedProfile.points ?? 0}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-gray-500">Points</p>
              </div>
              <div className="rounded-2xl border border-surface-border bg-background/80 p-5">
                <p className="text-lg font-bold text-white">{countryLabel}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-gray-500">Country</p>
              </div>
              <div className="rounded-2xl border border-surface-border bg-background/80 p-5">
                <p className={typedProfile.is_founder ? "text-lg font-bold text-gold" : "text-lg font-bold text-gray-300"}>
                  {typedProfile.is_founder ? "🏅 Founder" : "Not yet"}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-gray-500">Founder badge</p>
              </div>
            </div>
          </div>
        </section>

        <nav className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link href="/predictions" className="rounded-3xl border border-gold/30 bg-gold/10 p-6 transition hover:border-gold hover:bg-gold/15">
            <span className="text-3xl">🎯</span>
            <h2 className="mt-4 text-xl font-bold text-white">Predictions</h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">Pick home, draw, or away before each match locks.</p>
          </Link>
          <Link href="/leaderboard" className="rounded-3xl border border-surface-border bg-surface p-6 transition hover:border-gold/60">
            <span className="text-3xl">🏅</span>
            <h2 className="mt-4 text-xl font-bold text-white">Leaderboard</h2>
            <p className="mt-2 text-sm leading-6 text-gray-400">Track global points and country rivals.</p>
          </Link>
        </nav>
      </div>
    </main>
  );
}
