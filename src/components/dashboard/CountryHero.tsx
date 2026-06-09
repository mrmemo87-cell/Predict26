import Link from "next/link";
import { countryCodesMatch, getCountryFlag, resolveCountryFlag } from "@/lib/domain/countries";
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

function TeamBlock({ name, code }: { name: string; code: string | null }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center rounded-2xl border border-white/70 bg-white/90 px-4 py-5 text-center shadow-sm">
      {getCountryFlag(code) && (
        <span className="text-4xl" aria-hidden="true">
          {getCountryFlag(code)}
        </span>
      )}
      <span className="mt-3 max-w-full truncate text-lg font-black text-gray-900 sm:text-2xl">
        {name || "Team TBA"}
      </span>
      {code && (
        <span className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
          {code}
        </span>
      )}
    </div>
  );
}

export default function CountryHero({
  match,
  userCountryCode,
}: CountryHeroProps) {
  if (!match) {
    return (
      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-center text-gray-500">
          Your next match card will appear here soon.
        </p>
      </section>
    );
  }

  const isUserCountryMatch =
    countryCodesMatch(match.home_country_code, userCountryCode) ||
    countryCodesMatch(match.away_country_code, userCountryCode);
  const venue = match.venue?.trim() || "Venue TBA";
  const userFlag = resolveCountryFlag(userCountryCode);

  return (
    <section
      className={`relative overflow-hidden rounded-3xl border p-5 shadow-sm sm:p-8 ${
        isUserCountryMatch
          ? "border-gold/70 bg-gold/5 shadow-gold/15 ring-1 ring-gold/20"
          : "border-emerald-100 bg-white"
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.14),transparent_38%),linear-gradient(90deg,rgba(22,163,74,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(22,163,74,0.06)_1px,transparent_1px)] bg-[size:auto,36px_36px,36px_36px]" />
      {isUserCountryMatch && userFlag && (
        <div
          className="pointer-events-none absolute -right-8 -top-8 select-none text-[9rem] opacity-[0.08] sm:text-[13rem]"
          aria-hidden="true"
        >
          {userFlag}
        </div>
      )}
      <div className="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-emerald-200/70 sm:block" />
      <div className="relative">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                isUserCountryMatch
                  ? "bg-gold text-black shadow-lg shadow-gold/20"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              {isUserCountryMatch ? "Your country match" : "Next match"}
            </span>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">
              {formatStage(match.stage)}
            </p>
          </div>
          <span className="w-fit rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-semibold text-gray-600">
            {venue}
          </span>
        </div>

        <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <TeamBlock name={match.home_team} code={match.home_country_code} />
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-gold/40 bg-white text-sm font-black uppercase tracking-[0.2em] text-gold shadow-sm">
            vs
          </div>
          <TeamBlock name={match.away_team} code={match.away_country_code} />
        </div>

        <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-white/70 bg-white/85 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-500">
              Kickoff countdown
            </p>
            {match.kickoff_at ? (
              <MatchCountdown kickoffAt={match.kickoff_at} />
            ) : (
              <span className="text-sm text-gray-500">Time TBA</span>
            )}
          </div>
          <Link
            href={`/predictions?match=${match.id}`}
            className="inline-flex items-center justify-center rounded-full bg-emerald-700 px-6 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
          >
            Predict this match
          </Link>
        </div>
      </div>
    </section>
  );
}
