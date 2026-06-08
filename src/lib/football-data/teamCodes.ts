export type TeamCodeAliasRow = {
  alias_code: string | null;
  canonical_team_code: string | null;
};

export const normalizeTeamCode = (code: string | null | undefined) => {
  const normalized = code?.trim().toUpperCase();
  return normalized || null;
};

export const buildTeamCodeAliasMap = (rows: TeamCodeAliasRow[] | null | undefined) => new Map(
  (rows ?? [])
    .map((row) => {
      const aliasCode = normalizeTeamCode(row.alias_code);
      const canonicalTeamCode = normalizeTeamCode(row.canonical_team_code);
      return aliasCode && canonicalTeamCode ? ([aliasCode, canonicalTeamCode] as const) : null;
    })
    .filter((entry): entry is readonly [string, string] => entry !== null),
);

export const resolveTeamCode = (code: string | null | undefined, aliases: Map<string, string>) => {
  const normalized = normalizeTeamCode(code);
  if (!normalized) return null;
  return aliases.get(normalized) ?? normalized;
};

export const resolveMatchSideTeamCode = (
  teamCode: string | null | undefined,
  countryCode: string | null | undefined,
  aliases: Map<string, string>,
) => resolveTeamCode(teamCode, aliases) ?? resolveTeamCode(countryCode, aliases);
