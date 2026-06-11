import Link from "next/link";
import { firstPulseMatch, type PulsePost } from "@/lib/data/pulse";
import { buildFlagLookup, formatFlaggedLabel, resolveCountryFlag, type FlagLookupRow } from "@/lib/domain/countries";

const formatPulseDate = (value: string | null) => {
  if (!value) return "Draft date";

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
};

const formatKickoff = (value: string | null) => {
  if (!value) return "Kickoff TBA";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const safeExternalRel = (href: string) => href.startsWith("http") ? "noreferrer" : undefined;
const safeExternalTarget = (href: string) => href.startsWith("http") ? "_blank" : undefined;

export default function PulsePostCard({
  post,
  countries,
  compact = false,
}: {
  post: PulsePost;
  countries: FlagLookupRow[];
  compact?: boolean;
}) {
  const flagLookup = buildFlagLookup(countries);
  const match = firstPulseMatch(post);
  const countryFlag = resolveCountryFlag(post.country_code, flagLookup);
  const homeCode = post.home_team_code ?? match?.home_team_code ?? match?.home_country_code;
  const awayCode = post.away_team_code ?? match?.away_team_code ?? match?.away_country_code;
  const hasTeamCodes = Boolean(homeCode || awayCode);

  return (
    <article className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-md">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.16em]">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
            {post.category}
          </span>
          {post.is_pinned && (
            <span className="rounded-full bg-gold/15 px-3 py-1 text-gold-dark">
              Featured
            </span>
          )}
          <time className="text-gray-500" dateTime={post.published_at ?? post.created_at}>
            {formatPulseDate(post.published_at ?? post.created_at)}
          </time>
        </div>

        <h2 className={`${compact ? "text-lg" : "text-2xl"} mt-4 font-black leading-tight text-gray-950`}>
          {post.title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-gray-600 sm:text-base">
          {post.summary}
        </p>

        {!compact && post.body && (
          <p className="mt-4 whitespace-pre-line text-sm leading-7 text-gray-700">
            {post.body}
          </p>
        )}

        {(countryFlag || hasTeamCodes) && (
          <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-gray-700">
            {countryFlag && (
              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
                {countryFlag} {post.country_code}
              </span>
            )}
            {hasTeamCodes && (
              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
                {formatFlaggedLabel(match?.home_team_name, homeCode, flagLookup)} vs {formatFlaggedLabel(match?.away_team_name, awayCode, flagLookup)}
              </span>
            )}
          </div>
        )}

        {match && !compact && (
          <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">
              Matchday watch
            </p>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
              <p className="truncate text-sm font-black text-gray-950">
                {formatFlaggedLabel(match.home_team_name, homeCode, flagLookup)}
              </p>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-gray-500">vs</span>
              <p className="truncate text-right text-sm font-black text-gray-950">
                {formatFlaggedLabel(match.away_team_name, awayCode, flagLookup)}
              </p>
            </div>
            <p className="mt-3 text-xs font-semibold text-gray-600">
              {formatKickoff(match.kickoff_at)}{match.venue ? ` · ${match.venue}` : ""}
            </p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {post.cta_label && post.cta_href && (
            <Link
              href={post.cta_href}
              prefetch={!post.cta_href.startsWith("http")}
              target={safeExternalTarget(post.cta_href)}
              rel={safeExternalRel(post.cta_href)}
              className="inline-flex items-center justify-center rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            >
              {post.cta_label}
            </Link>
          )}
          {post.source_name && post.source_url && (
            <a
              href={post.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-bold text-emerald-800 underline-offset-4 hover:underline"
            >
              Source: {post.source_name}
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
