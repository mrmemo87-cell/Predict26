import Link from "next/link";
import { AuthButtons } from "@/components/ui/auth-buttons";
import { PRIZE_POOL, SCORING_RULES, SUPPORTED_COUNTRIES } from "@/lib/domain/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const landingSections = [
  "Hero",
  "Prize Pool",
  "Stats",
  "How It Works",
  "Country Battle",
  "Founder Badge",
  "Final CTA",
] as const;

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:py-12">
      <header className="glass-panel flex items-center justify-between rounded-2xl px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Predict26</p>
          <h1 className="text-lg font-semibold text-[var(--gold)]">FIFA World Cup 2026 Competition</h1>
        </div>
        <AuthButtons isAuthenticated={Boolean(user)} />
      </header>

      <section className="glass-panel rounded-3xl p-6 sm:p-10">
        <p className="mb-3 text-xs uppercase tracking-[0.25em] text-[var(--muted)]">Hero</p>
        <h2 className="max-w-3xl text-3xl font-bold leading-tight sm:text-5xl">
          Predict match winners, represent your country, and race to the World Cup prize zone.
        </h2>
        <p className="mt-5 max-w-2xl text-sm text-[var(--muted)] sm:text-base">
          Predict26 is a social football prediction platform for fans across Kazakhstan, Kyrgyzstan, Uzbekistan,
          Russia, and the wider Russian-speaking world.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-full bg-[var(--gold)] px-6 py-3 text-sm font-semibold text-black transition hover:bg-[var(--gold-soft)]"
          >
            Open Dashboard
          </Link>
          <span className="rounded-full border border-[var(--border)] px-6 py-3 text-sm text-[var(--muted)]">
            Correct prediction = {SCORING_RULES.correctPredictionPoints} points
          </span>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {PRIZE_POOL.map((prize) => (
          <article key={prize.position} className="glass-panel rounded-2xl p-5">
            <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Prize Pool</p>
            <h3 className="mt-2 text-2xl font-bold text-[var(--gold)]">#{prize.position}</h3>
            <p className="text-xl font-semibold">${prize.amount}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="glass-panel rounded-2xl p-5">
          <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Country Battle</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SUPPORTED_COUNTRIES.map((country) => (
              <div key={country.code} className="rounded-xl border border-[var(--border)] px-3 py-3 text-center">
                <p className="text-xl">{country.flag}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{country.name}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="glass-panel rounded-2xl p-5">
          <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Founder Badge</p>
          <h3 className="mt-3 text-xl font-semibold text-[var(--gold)]">First 1,000 users are Founders</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Founders receive a permanent badge in profile, leaderboards, and referral rankings.
          </p>
        </article>
      </section>

      <section className="glass-panel rounded-2xl p-5">
        <p className="text-xs uppercase tracking-wider text-[var(--muted)]">How It Works</p>
        <ol className="mt-3 grid gap-2 text-sm text-[var(--foreground)] sm:grid-cols-2">
          <li>1. Sign in with Google</li>
          <li>2. Pick Home Win / Draw / Away Win</li>
          <li>3. Earn 10 points for each correct prediction</li>
          <li>4. Climb global, country, and referral leaderboards</li>
          <li>5. Track distance to Top 3 and Prize Zone</li>
          <li>6. Win real-world prizes</li>
        </ol>
      </section>

      <section className="glass-panel rounded-2xl p-5">
        <p className="text-xs uppercase tracking-wider text-[var(--muted)]">Stats</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-2xl font-semibold text-[var(--gold)]">3</p>
            <p className="text-sm text-[var(--muted)]">Leaderboards</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-[var(--gold)]">{SUPPORTED_COUNTRIES.length}</p>
            <p className="text-sm text-[var(--muted)]">Core launch countries</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-[var(--gold)]">$450</p>
            <p className="text-sm text-[var(--muted)]">MVP prize pool</p>
          </div>
        </div>
      </section>

      <section className="glass-panel rounded-2xl p-8 text-center">
        <p className="text-xs uppercase tracking-[0.25em] text-[var(--muted)]">Final CTA</p>
        <h2 className="mt-3 text-2xl font-bold">Build your prediction streak before kickoff.</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Prepare your profile, secure your Founder badge, and invite friends.</p>
      </section>

      <footer className="pb-2 text-center text-xs text-[var(--muted)]">
        Landing sections: {landingSections.join(" • ")}
      </footer>
    </div>
  );
}
