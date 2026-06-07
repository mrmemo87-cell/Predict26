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
        className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-4 py-2 text-sm font-medium text-gold transition hover:bg-gold/10"
      >
        🌍 Choose your country
      </Link>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800">
      <span className="text-lg">{flagEmoji ?? "🌍"}</span>
      <span>{countryName ?? countryCode}</span>
    </div>
  );
}
