import Link from "next/link";

interface MatchRow {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  stage: string | null;
  status: string;
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
    <section className="rounded-3xl border border-surface-border bg-surface p-6 sm:p-8">
      <h2 className="mb-5 text-lg font-bold text-white">⚽ Upcoming Matches</h2>
      <div className="space-y-3">
        {matches.map((match) => {
          const isUserCountry =
            match.home_country_code === userCountryCode ||
            match.away_country_code === userCountryCode;

          return (
            <div
              key={match.id}
              className={`flex flex-col gap-3 rounded-2xl border p-4 transition sm:flex-row sm:items-center sm:justify-between ${
                isUserCountry
                  ? "border-gold/50 bg-gold/5 shadow-lg shadow-gold/10"
                  : "border-surface-border bg-background/60"
              }`}
            >
              <div className="flex flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="font-mono">{formatDate(match.kickoff_at)}</span>
                  <span className="font-mono text-gold">{formatTime(match.kickoff_at)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{match.home_team}</span>
                  <span className="text-xs text-gold">vs</span>
                  <span className="font-semibold text-white">{match.away_team}</span>
                  {isUserCountry && (
                    <span className="ml-2 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
                      Your Country
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {match.stage && (
                  <span className="text-xs text-gray-500">{match.stage}</span>
                )}
                <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-gold">
                  {match.status}
                </span>
                <Link
                  href="/predictions"
                  className="rounded-full border border-gold/40 px-3 py-1 text-xs font-semibold text-gold transition hover:bg-gold/10"
                >
                  Predict
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
