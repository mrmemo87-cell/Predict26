"use client";

import Link from "next/link";
import { isUserCountryMatch as checkUserCountry } from "@/lib/domain/match-helpers";
import { getCountryFlag } from "@/lib/domain/countries";

interface MatchRow {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string | null;
  stage: string | null;
  status: string;
  venue: string | null;
  home_country_code: string | null;
  away_country_code: string | null;
  home_score?: number | null;
  away_score?: number | null;
}

interface UpcomingMatchesProps {
  matches: MatchRow[];
  userCountryCode: string;
}

function formatDate(kickoffAt: string | null): string {
  if (!kickoffAt) return "TBA";
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
    }).format(new Date(kickoffAt));
  } catch {
    return "TBA";
  }
}

function formatTime(kickoffAt: string | null): string {
  if (!kickoffAt) return "TBA";
  try {
    return new Intl.DateTimeFormat("en", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(kickoffAt));
  } catch {
    return "TBA";
  }
}

function formatStage(stage: string | null): string {
  if (!stage) return "World Cup 2026";
  if (stage.toLowerCase() === "group") return "Group Stage";
  return stage.replace(/[_-]/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatStatus(status: string): string {
  return status.replace(/[_-]/g, " ").toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
}

function StatusBadge({ status, homeScore, awayScore }: { status: string; homeScore?: number | null; awayScore?: number | null }) {
  const s = status.toLowerCase();

  if (s === "live" || s === "in_progress") {
    return (
      <span className="rounded-full bg-red-500 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white animate-pulse">
        LIVE
      </span>
    );
  }

  if (s === "finished" || s === "completed") {
    const score = homeScore != null && awayScore != null ? `${homeScore} - ${awayScore}` : "-";
    return (
      <span className="rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-600">
        {score}
      </span>
    );
  }

  return (
    <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
      {formatStatus(status)}
    </span>
  );
}

function TeamLabel({ name, code }: { name: string; code: string | null }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="text-lg" aria-hidden="true">{getCountryFlag(code) ?? "🌍"}</span>
      <span className="truncate font-semibold text-gray-900">{name || "Team TBA"}</span>
      {code && (
        <span className="rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
          {code}
        </span>
      )}
    </span>
  );
}

function isPredictable(status: string, kickoffAt: string | null): boolean {
  const s = status.toLowerCase();
  if (s !== "scheduled" && s !== "upcoming") return false;
  if (!kickoffAt) return true;
  return new Date(kickoffAt).getTime() > Date.now();
}

export default function UpcomingMatches({ matches, userCountryCode }: UpcomingMatchesProps) {
  // Separate user-country matches and others
  const userMatches: MatchRow[] = [];
  const otherMatches: MatchRow[] = [];

  for (const match of matches) {
    if (
      userCountryCode &&
      checkUserCountry(
        {
          id: match.id,
          home_country_code: match.home_country_code,
          away_country_code: match.away_country_code,
        },
        userCountryCode,
      )
    ) {
      userMatches.push(match);
    } else {
      otherMatches.push(match);
    }
  }

  const sortedMatches = [...userMatches, ...otherMatches];

  if (sortedMatches.length === 0) {
    return (
      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="mb-4 text-lg font-bold text-gray-900">Upcoming Matches</h2>
        <p className="text-center text-gray-500">No upcoming matches scheduled.</p>
      </section>
    );
  }

  const hasUserMatches = userMatches.length > 0;

  return (
    <section className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm sm:p-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">Match board</p>
          <h2 className="mt-1 text-lg font-bold text-gray-900">Upcoming Matches</h2>
        </div>
        <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-bold text-gold">
          {sortedMatches.length} matches
        </span>
      </div>

      {userCountryCode && !hasUserMatches && (
        <div className="mb-4 rounded-xl border border-gold/30 bg-gold/5 p-3 text-sm text-gray-600">
          No matches for your country yet. Follow the full World Cup schedule below.
        </div>
      )}

      <div className="space-y-3">
        {sortedMatches.map((match) => {
          const isUserMatch = userMatches.includes(match);

          return (
            <article
              key={match.id}
              className={`group relative overflow-hidden rounded-2xl border p-4 transition sm:p-5 ${
                isUserMatch
                  ? "border-gold/60 bg-gold/5 shadow-md shadow-gold/10"
                  : "border-gray-200 bg-gray-50 hover:border-gold/40"
              }`}
            >
              <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                  <div className="min-w-16 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-center">
                    <p className="font-mono text-xs font-semibold uppercase tracking-wider text-gray-500">
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

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span>{formatStage(match.stage)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {isUserMatch && (
                    <span className="rounded-full bg-gold px-3 py-1 text-[10px] font-black uppercase tracking-wider text-black">
                      Your country match
                    </span>
                  )}
                  <StatusBadge status={match.status} homeScore={match.home_score} awayScore={match.away_score} />
                  {isPredictable(match.status, match.kickoff_at) && (
                    <Link
                      href={`/predictions?match=${match.id}`}
                      className="rounded-full border border-emerald-700 bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                    >
                      Predict
                    </Link>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
