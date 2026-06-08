/**
 * Country code utilities.
 * No hardcoded country lists — flags come from the database (countries.flag_emoji).
 */

export function normalizeCountryCode(code: string | null | undefined): string {
  if (!code) {
    return "";
  }

  return code.trim().toUpperCase();
}

export function countryCodesMatch(
  firstCode: string | null | undefined,
  secondCode: string | null | undefined,
): boolean {
  const first = normalizeCountryCode(firstCode);
  const second = normalizeCountryCode(secondCode);

  return Boolean(first && second && first === second);
}

/**
 * Generate a flag emoji from an ISO country code using regional indicator symbols.
 * Falls back to null if code is missing or too short.
 */
export function getCountryFlag(code: string | null | undefined): string | null {
  if (!code) {
    return null;
  }

  const normalized = code.trim().toUpperCase();
  // Only works for 2-letter ISO codes with A-Z characters
  if (normalized.length !== 2) {
    return null;
  }

  // Validate both characters are A-Z
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return null;
  }

  // Convert 2-letter ISO code to flag emoji using regional indicator symbols
  const codePoints = [...normalized].map(
    (char) => 0x1f1e6 + char.charCodeAt(0) - 65,
  );
  return String.fromCodePoint(...codePoints);
}

export type FlagLookupRow = {
  code: string | null;
  flag_emoji?: string | null;
};

export function buildFlagLookup(
  rows: FlagLookupRow[] | null | undefined,
): Map<string, string> {
  return new Map(
    (rows ?? [])
      .map((row) => {
        const code = normalizeCountryCode(row.code);
        const flag = row.flag_emoji?.trim();
        return code && flag ? ([code, flag] as const) : null;
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  );
}

export function resolveCountryFlag(
  code: string | null | undefined,
  flagLookup?: Map<string, string>,
): string | null {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return null;

  return flagLookup?.get(normalized) ?? getCountryFlag(normalized);
}

export function formatFlaggedLabel(
  label: string | null | undefined,
  code: string | null | undefined,
  flagLookup?: Map<string, string>,
): string {
  const name = label?.trim() || code?.trim().toUpperCase() || "Team TBA";
  const flag = resolveCountryFlag(code, flagLookup);
  return flag ? `${flag} ${name}` : name;
}
