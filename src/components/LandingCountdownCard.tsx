"use client";

import { useMemo, useSyncExternalStore } from "react";
import MatchCountdown from "@/components/matches/MatchCountdown";
import MatchLocalTime from "@/components/matches/MatchLocalTime";

type LandingMatch = {
  id: string;
  stage: string;
  kickoffAt: string;
  home: string;
  homeFlag: string;
  away: string;
  awayFlag: string;
  venue: string;
  city: string;
};

type TimeLeft = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

type CountdownTarget = {
  title: string;
  eyebrow: string;
  targetAt: string;
  featuredMatch: LandingMatch;
  supportingMatches: LandingMatch[];
};

const WORLD_CUP_OPENER_AT = "2026-06-11T19:00:00.000Z";
const SERVER_FALLBACK_NOW = "2026-06-09T00:00:00.000Z";
const SERVER_FALLBACK_SECONDS = Math.floor(
  new Date(SERVER_FALLBACK_NOW).getTime() / 1000,
);

const landingMatches: LandingMatch[] = [
  {
    id: "wc2026-match-001",
    stage: "Group A · Match 1",
    kickoffAt: WORLD_CUP_OPENER_AT,
    home: "Mexico",
    homeFlag: "🇲🇽",
    away: "South Africa",
    awayFlag: "🇿🇦",
    venue: "Estadio Azteca",
    city: "Mexico City",
  },
  {
    id: "wc2026-match-002",
    stage: "Group A · Match 2",
    kickoffAt: "2026-06-12T02:00:00.000Z",
    home: "South Korea",
    homeFlag: "🇰🇷",
    away: "Czechia",
    awayFlag: "🇨🇿",
    venue: "Estadio Akron",
    city: "Zapopan",
  },
  {
    id: "wc2026-match-003",
    stage: "Group B · Match 3",
    kickoffAt: "2026-06-12T19:00:00.000Z",
    home: "Canada",
    homeFlag: "🇨🇦",
    away: "Bosnia and Herzegovina",
    awayFlag: "🇧🇦",
    venue: "BMO Field",
    city: "Toronto",
  },
];

function subscribe(callback: () => void) {
  const id = setInterval(callback, 1000);
  return () => clearInterval(id);
}

function getSnapshot() {
  return Math.floor(Date.now() / 1000);
}

function getServerSnapshot() {
  return SERVER_FALLBACK_SECONDS;
}

function calculateTimeLeft(targetAt: string, now: number): TimeLeft {
  const difference = new Date(targetAt).getTime() - now;

  if (difference <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  return {
    days: Math.floor(difference / (1000 * 60 * 60 * 24)),
    hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((difference / (1000 * 60)) % 60),
    seconds: Math.floor((difference / 1000) % 60),
  };
}

function TimePill({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-emerald-200 bg-white px-3 py-2 text-center shadow-sm sm:px-4">
      <p className="font-mono text-2xl font-black leading-none text-emerald-900 sm:text-3xl">
        {String(value).padStart(2, "0")}
      </p>
      <p className="mt-1 text-[0.62rem] font-black uppercase tracking-[0.16em] text-emerald-700">
        {label}
      </p>
    </div>
  );
}

function MatchTeams({ match }: { match: LandingMatch }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
      <div className="min-w-0">
        <p className="text-2xl" aria-hidden="true">
          {match.homeFlag}
        </p>
        <p className="truncate text-sm font-black text-gray-950 sm:text-base">
          {match.home}
        </p>
      </div>
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
        vs
      </span>
      <div className="min-w-0 text-right">
        <p className="text-2xl" aria-hidden="true">
          {match.awayFlag}
        </p>
        <p className="truncate text-sm font-black text-gray-950 sm:text-base">
          {match.away}
        </p>
      </div>
    </div>
  );
}

export default function LandingCountdownCard() {
  const seconds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const now = seconds * 1000;

  const countdownTarget = useMemo<CountdownTarget>(() => {
    const opener = landingMatches[0];

    if (now < new Date(WORLD_CUP_OPENER_AT).getTime()) {
      return {
        title: "World Cup 2026 kickoff",
        eyebrow: "Countdown to opening match",
        targetAt: WORLD_CUP_OPENER_AT,
        featuredMatch: opener,
        supportingMatches: landingMatches.slice(1, 3),
      };
    }

    const nextMatchIndex = landingMatches.findIndex(
      (match) => new Date(match.kickoffAt).getTime() > now,
    );
    const featuredMatch = landingMatches[nextMatchIndex] ?? opener;

    return {
      title: "Next match prediction countdown",
      eyebrow: "Opening countdown finished",
      targetAt: featuredMatch.kickoffAt,
      featuredMatch,
      supportingMatches: landingMatches
        .slice(Math.max(nextMatchIndex + 1, 0), Math.max(nextMatchIndex + 3, 2))
        .filter((match) => match.id !== featuredMatch.id),
    };
  }, [now]);

  const timeLeft = calculateTimeLeft(countdownTarget.targetAt, now);

  return (
    <aside className="mb-8 max-w-2xl rounded-[1.75rem] border border-emerald-200 bg-white/92 p-4 shadow-2xl shadow-emerald-900/10 backdrop-blur sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
            {countdownTarget.eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-gray-950 sm:text-3xl">
            {countdownTarget.title}
          </h2>
        </div>
        <span className="rounded-full bg-gold/15 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-gold-dark">
          Win prizes
        </span>
      </div>

      <div
        className="mt-5 grid grid-cols-4 gap-2 sm:gap-3"
        aria-label={`Time remaining until ${countdownTarget.title}`}
        suppressHydrationWarning
      >
        <TimePill value={timeLeft.days} label="Days" />
        <TimePill value={timeLeft.hours} label="Hrs" />
        <TimePill value={timeLeft.minutes} label="Min" />
        <TimePill value={timeLeft.seconds} label="Sec" />
      </div>

      <article className="mt-5 rounded-2xl border border-gray-100 bg-[#f8fbf9] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold uppercase tracking-[0.16em] text-gray-500">
          <span>{countdownTarget.featuredMatch.stage}</span>
          <time dateTime={countdownTarget.featuredMatch.kickoffAt}>
            <MatchLocalTime
              kickoffAt={countdownTarget.featuredMatch.kickoffAt}
              label="Your time"
              compact
              showTimeZone
            />
          </time>
        </div>
        <MatchTeams match={countdownTarget.featuredMatch} />
        <p className="mt-3 font-mono text-sm font-black text-emerald-800">
          <MatchCountdown
            kickoffAt={countdownTarget.featuredMatch.kickoffAt}
            label="Kickoff in"
            updateMode="second"
          />
        </p>
        <p className="mt-3 text-sm font-semibold text-gray-600">
          {countdownTarget.featuredMatch.venue} · {countdownTarget.featuredMatch.city}
        </p>
      </article>

      {countdownTarget.supportingMatches.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {countdownTarget.supportingMatches.map((match) => (
            <div key={match.id} className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
              <p className="text-[0.68rem] font-black uppercase tracking-[0.14em] text-emerald-700">
                Up next · <MatchLocalTime kickoffAt={match.kickoffAt} compact showTimeZone />
              </p>
              <p className="mt-1 truncate text-sm font-black text-emerald-950">
                {match.homeFlag} {match.home} vs {match.awayFlag} {match.away}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <a
        href="/login"
        className="mt-5 inline-flex w-full items-center justify-center rounded-full bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 sm:text-base"
      >
        Join to predict scores & win
      </a>
    </aside>
  );
}
