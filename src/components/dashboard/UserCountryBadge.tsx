import Link from "next/link";

interface UserCountryBadgeProps {
  flagEmoji: string | null;
  countryName: string | null;
  countryCode: string | null;
}

export default function UserCountryBadge({ flagEmoji, countryName, countryCode }: UserCountryBadgeProps) {
  if (!countryCode) {
    return (
      <Link
        href="/onboarding/country"
        className="inline-flex max-w-full items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-4 py-2 text-sm font-medium text-gold transition hover:bg-gold/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      >
        🌍 Choose your country
      </Link>
    );
  }

  return (
    <div
      className="inline-flex max-w-[11rem] items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800 sm:max-w-xs"
      title={countryName ?? countryCode}
    >
      <span className="shrink-0 text-lg">{flagEmoji ?? "🌍"}</span>
      <span className="truncate">{countryName ?? countryCode}</span>
    </div>
  );
}
