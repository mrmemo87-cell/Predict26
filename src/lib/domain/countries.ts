const COUNTRY_CODE_ALIASES: Record<string, string> = {
  KG: "KG",
  KGZ: "KG",
  KZ: "KZ",
  KAZ: "KZ",
  UZ: "UZ",
  UZB: "UZ",
  RU: "RU",
  RUS: "RU",
};

const COUNTRY_FLAGS: Record<string, string> = {
  KG: "🇰🇬",
  KZ: "🇰🇿",
  UZ: "🇺🇿",
  RU: "🇷🇺",
  US: "🇺🇸",
  USA: "🇺🇸",
  CA: "🇨🇦",
  CAN: "🇨🇦",
  MX: "🇲🇽",
  MEX: "🇲🇽",
  BR: "🇧🇷",
  BRA: "🇧🇷",
  AR: "🇦🇷",
  ARG: "🇦🇷",
  JP: "🇯🇵",
  JPN: "🇯🇵",
  MA: "🇲🇦",
  MAR: "🇲🇦",
  DE: "🇩🇪",
  GER: "🇩🇪",
  ES: "🇪🇸",
  ESP: "🇪🇸",
};

export function normalizeCountryCode(code: string | null | undefined): string {
  if (!code) {
    return "";
  }

  const normalized = code.trim().toUpperCase();
  return COUNTRY_CODE_ALIASES[normalized] ?? normalized;
}

export function countryCodesMatch(
  firstCode: string | null | undefined,
  secondCode: string | null | undefined,
): boolean {
  const first = normalizeCountryCode(firstCode);
  const second = normalizeCountryCode(secondCode);

  return Boolean(first && second && first === second);
}

export function getCountryFlag(code: string | null | undefined): string | null {
  if (!code) {
    return null;
  }

  const normalized = code.trim().toUpperCase();
  return COUNTRY_FLAGS[normalized] ?? COUNTRY_FLAGS[normalizeCountryCode(normalized)] ?? null;
}
