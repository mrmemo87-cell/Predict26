import Link from "next/link";
import MatchCountdown from "./MatchCountdown";

interface HeroMatch {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  stage: string | null;
  venue: string | null;
  home_country_code: string | null;
  away_country_code: string | null;
}

interface CountryHeroProps {
  match: HeroMatch | null;
  userCountryCode: string;
}

export default function CountryHero({ match, userCountryCode }: CountryHeroProps) {
  if (!match) {
    return (
      <section className="rounded-3xl border border-surface-border bg-surface p-6 shadow-2xl shadow-gold/5 sm:p-8">
        <p className="text-center text-gray-400">No upcoming matches available.</p>
      </section>
    );
  }

  const isUserCountryMatch =
    match.home_country_code === userCountryCode ||
    match.away_country_code === userCountryCode;

  return (
    <section
      className={`relative overflow-hidden rounded-3xl border bg-surface p-6 shadow-2xl sm:p-8 ${
        isUserCountryMatch
          ? "border-gold/60 shadow-gold/20 animate-pulse-gold"
          : "border-surface-border shadow-gold/5"
      }`}
    >
      <div className="bg-[radial-gradient(circle_at_top_right,_rgba(212,175,55,0.15),_transparent_40%)] absolute inset-0" />
      <div className="relative">
        {isUserCountryMatch && (
          <span className="mb-3 inline-block rounded-full bg-gold/15 px-3 py-1 text-xs font-bold uppercase tracking-wider text-gold">
            🏟️ YOUR COUNTRY
          </span>
        )}
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-gray-400">
          Next Match
        </p>
        <h2 className="text-2xl font-bold sm:text-4xl">
          {match.home_team} <span className="text-gold">vs</span> {match.away_team}
        </h2>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-400">
          {match.stage && (
            <span className="rounded-full border border-surface-border bg-background/80 px-3 py-1">
              {match.stage}
            </span>
          )}
          {match.venue && (
            <span className="rounded-full border border-surface-border bg-background/80 px-3 py-1">
              📍 {match.venue}
            </span>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-gray-500">Kickoff in</p>
            <MatchCountdown kickoffAt={match.kickoff_at} />
          </div>
          <Link
            href={`/predictions`}
            className="inline-flex items-center justify-center rounded-full bg-gold px-6 py-3 text-sm font-bold text-black transition hover:bg-gold-light"
          >
            🎯 Predict
          </Link>
        </div>
      </div>
    </section>
  );
}
