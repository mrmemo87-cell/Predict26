"use client";

import MatchCountdown from "./MatchCountdown";
import MatchLocalTime from "./MatchLocalTime";

type MatchTimeBlockProps = {
  kickoffAt: string | null;
  status?: string | null;
  venue?: string | null;
  city?: string | null;
  compact?: boolean;
  countdownLabel?: string;
  className?: string;
};

export default function MatchTimeBlock({
  kickoffAt,
  status = null,
  venue = null,
  city = null,
  compact = false,
  countdownLabel = "Kickoff in",
  className = "space-y-1 text-sm",
}: MatchTimeBlockProps) {
  const venueText = [venue, city].filter(Boolean).join(" · ");

  return (
    <div className={className}>
      <p className="font-semibold text-gray-800">
        <MatchLocalTime
          kickoffAt={kickoffAt}
          label="Your time"
          compact={compact}
          showTimeZone
        />
      </p>
      <p className="font-mono text-xs font-bold text-gold sm:text-sm">
        <MatchCountdown
          kickoffAt={kickoffAt}
          status={status}
          label={countdownLabel}
          className="font-mono"
        />
      </p>
      {venueText && <p className="text-xs text-gray-500">Venue: {venueText}</p>}
    </div>
  );
}
