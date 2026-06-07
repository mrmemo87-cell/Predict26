import Link from "next/link";
import { countryCodesMatch } from "@/lib/domain/countries";
import MatchCountdown from "./MatchCountdown";

interface HeroMatch {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string | null;
  stage: string | null;
  venue: string | null;
  home_country_code: string | null;
  away_country_code: string | null;
}

interface CountryHeroProps {
  match: HeroMatch | null;
  userCountryCode: string;
}

function formatStage(stage: string | null): string {
  if (!stage) {
    return "World Cup 2026";
  }

  if (stage.toLowerCase() === "group") {
    return "Group Stage";
  }

  return stage
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function CountryHero({ match, userCountryCode }: CountryHeroProps) {
  if (!match) {
    return (
      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-center text-gray-500">No upcoming matches available.</p>
      </section>
    );
  }

  const isUserCountryMatch =
    countryCodesMatch(match.home_country_code, userCountryCode) ||
    countryCodesMatch(match.away_country_code, userCountryCode);
  const venue = match.venue?.trim() || "Venue TBA";

  return (
    <section
      className={`relative overflow-hidden rounded-3xl border bg-white p-6 shadow-sm sm:p-8 ${
        isUserCountryMatch
          ? "border-gold/70 shadow-gold/15 ring-1 ring-gold/20"
          : "border-gray-200"
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(212,175,55,0.08),_transparent_42%)]" />
      {isUserCountryMatch && (
        <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-gold/10 blur-3xl" />
      )}
      <div className="relative">
        <span
          className={`mb-3 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
            isUserCountryMatch
              ? "bg-gold text-black shadow-lg shadow-gold/20"
              : "border border-gray-200 bg-gray-50 text-gray-600"
          }`}
        >
          {isUserCountryMatch ? "🏟️ Your Country Match" : "Next Match"}
        </span>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">
          {formatStage(match.stage)}
        </p>
        <h2 className="text-2xl font-bold text-gray-900 sm:text-4xl">
          {match.home_team || "Team TBA"} <span className="text-gold">vs</span> {match.away_team || "Team TBA"}
        </h2>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-500">
          <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
            📍 {venue}
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-gray-400">Kickoff in</p>
            {match.kickoff_at ? (
              <MatchCountdown kickoffAt={match.kickoff_at} />
            ) : (
              <span className="text-sm text-gray-500">Time TBA</span>
            )}
          </div>
          <Link
            href={`/predictions?match=${match.id}`}
            className="inline-flex items-center justify-center rounded-full bg-gold px-6 py-3 text-sm font-bold text-black transition hover:bg-gold-light"
          >
            🎯 Predict
          </Link>
        </div>
      </div>
    </section>
  );
}
