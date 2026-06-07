import Link from "next/link";
import { countryCodesMatch, getCountryFlag } from "@/lib/domain/countries";

interface MatchRow {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  stage: string | null;
  status: string;
  venue: string | null;
  home_country_code: string | null;
  away_country_code: string | null;
}

interface UpcomingMatchesProps {
  matches: MatchRow[];
  userCountryCode: string;
}

function formatDate(kickoffAt: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(kickoffAt));
}

function formatTime(kickoffAt: string): string {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(kickoffAt));
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

function formatStatus(status: string): string {
  return status
    .replace(/[_-]/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function TeamLabel({ name, code }: { name: string; code: string | null }) {
  const flag = getCountryFlag(code);

  return (
    <span className="flex min-w-0 items-center gap-2">
      {flag && <span className="text-lg leading-none">{flag}</span>}
      <span className="truncate font-semibold text-white">{name}</span>
      {code && (
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
          {code}
        </span>
      )}
    </span>
  );
}

export default function UpcomingMatches({ matches, userCountryCode }: UpcomingMatchesProps) {
  if (matches.length === 0) {
    return (
      <section className="rounded-3xl border border-surface-border bg-surface p-6 sm:p-8">
        <h2 className="mb-4 text-lg font-bold text-white">Upcoming Matches</h2>
        <p className="text-center text-gray-400">No upcoming matches scheduled.</p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-surface-border bg-surface p-5 shadow-2xl shadow-black/20 sm:p-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Match board</p>
          <h2 className="mt-1 text-lg font-bold text-white">Upcoming Matches</h2>
        </div>
        <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-bold text-gold">
          {matches.length} matches
        </span>
      </div>

      <div className="space-y-3">
        {matches.map((match) => {
          const isUserCountry =
            countryCodesMatch(match.home_country_code, userCountryCode) ||
            countryCodesMatch(match.away_country_code, userCountryCode);

          return (
            <article
              key={match.id}
              className={`group relative overflow-hidden rounded-2xl border p-4 transition sm:p-5 ${
                isUserCountry
                  ? "border-gold/60 bg-[linear-gradient(135deg,rgba(212,175,55,0.16),rgba(15,18,22,0.95))] shadow-lg shadow-gold/10"
                  : "border-surface-border bg-background/70 hover:border-gold/40"
              }`}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.12),transparent_35%)] opacity-0 transition group-hover:opacity-100" />
              <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="min-w-16 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-center">
                    <p className="font-mono text-xs font-semibold uppercase tracking-wider text-gray-400">
                      {formatDate(match.kickoff_at)}
                    </p>
                    <p className="mt-1 font-mono text-sm font-bold text-gold">
                      {formatTime(match.kickoff_at)}
                    </p>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 text-sm sm:text-base">
                      <TeamLabel name={match.home_team} code={match.home_country_code} />
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-gold/80">
                        <span className="h-px w-6 bg-gold/40" />
                        vs
                      </div>
                      <TeamLabel name={match.away_team} code={match.away_country_code} />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                      <span>{formatStage(match.stage)}</span>
                      <span className="text-gray-600">•</span>
                      <span>{match.venue?.trim() || "Venue TBA"}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {isUserCountry && (
                    <span className="rounded-full bg-gold px-3 py-1 text-[10px] font-black uppercase tracking-wider text-black">
                      Your Country
                    </span>
                  )}
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-300">
                    {formatStatus(match.status)}
                  </span>
                  <Link
                    href={`/predictions?match=${match.id}`}
                    className="rounded-full border border-gold/50 px-4 py-2 text-xs font-bold text-gold transition hover:bg-gold hover:text-black"
                  >
                    Predict
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
