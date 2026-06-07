import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { WORLD_CUP_SLUG } from "@/lib/domain/constants";
import { mockFootballDataProvider } from "./providers/mock";
import type { FootballDataProvider, ProviderMatch, ProviderStadium, SyncMatchesResult } from "./providers/types";

type AdminClient = ReturnType<typeof createAdminClient>;

type CompetitionRow = { id: string; slug: string };
type MappingRow = { internal_id: string | null };
type StadiumRow = { id: string };
type MatchRow = { id: string };
type LatestMatchNumberRow = { match_number: number | null };

const DEFAULT_PROVIDER = mockFootballDataProvider;

async function getCompetitionId(supabase: AdminClient, slug: string): Promise<string> {
  const { data, error } = await supabase
    .from("competitions")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle<CompetitionRow>();

  if (error) {
    throw new Error(`Could not load competition ${slug}: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error(`Competition ${slug} does not exist`);
  }

  return data.id;
}

async function upsertProviderMapping(
  supabase: AdminClient,
  provider: string,
  entityType: string,
  externalId: string,
  internalId: string,
  payload: unknown,
) {
  const { error } = await supabase.from("external_provider_mappings").upsert(
    {
      provider,
      entity_type: entityType,
      external_id: externalId,
      internal_id: internalId,
      external_payload: payload,
    },
    { onConflict: "provider,entity_type,external_id" },
  );

  if (error) {
    throw new Error(`Could not save ${entityType} provider mapping: ${error.message}`);
  }
}

async function findMappedInternalId(
  supabase: AdminClient,
  provider: string,
  entityType: string,
  externalId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("external_provider_mappings")
    .select("internal_id")
    .eq("provider", provider)
    .eq("entity_type", entityType)
    .eq("external_id", externalId)
    .maybeSingle<MappingRow>();

  if (error) {
    throw new Error(`Could not load ${entityType} provider mapping: ${error.message}`);
  }

  return data?.internal_id ?? null;
}

async function upsertStadium(
  supabase: AdminClient,
  provider: string,
  stadium?: ProviderStadium | null,
): Promise<string | null> {
  if (!stadium) return null;

  const mappedId = await findMappedInternalId(supabase, provider, "stadium", stadium.externalId);

  if (mappedId) {
    const { data, error } = await supabase
      .from("stadiums")
      .update({
        name: stadium.name,
        city: stadium.city,
        country_code: stadium.countryCode ?? null,
        capacity: stadium.capacity ?? null,
        timezone: stadium.timezone ?? null,
      })
      .eq("id", mappedId)
      .select("id")
      .single<StadiumRow>();

    if (error) throw new Error(`Could not update stadium ${stadium.name}: ${error.message}`);
    await upsertProviderMapping(supabase, provider, "stadium", stadium.externalId, data.id, stadium);
    return data.id;
  }

  const { data, error } = await supabase
    .from("stadiums")
    .upsert(
      {
        name: stadium.name,
        city: stadium.city,
        country_code: stadium.countryCode ?? null,
        capacity: stadium.capacity ?? null,
        timezone: stadium.timezone ?? null,
      },
      { onConflict: "name,city" },
    )
    .select("id")
    .single<StadiumRow>();

  if (error) throw new Error(`Could not upsert stadium ${stadium.name}: ${error.message}`);

  await upsertProviderMapping(supabase, provider, "stadium", stadium.externalId, data.id, stadium);
  return data.id;
}

async function getNextMatchNumber(supabase: AdminClient): Promise<number> {
  const { data } = await supabase
    .from("matches")
    .select("match_number")
    .not("match_number", "is", null)
    .order("match_number", { ascending: false })
    .limit(1)
    .maybeSingle<LatestMatchNumberRow>();

  return (data?.match_number ?? 0) + 1;
}

const externalMatchNumber = (externalId: string): number | null => {
  const suffix = externalId.match(/(\d+)$/)?.[1];
  if (!suffix) return null;

  const parsed = Number(suffix);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

async function upsertMatch(
  supabase: AdminClient,
  provider: string,
  competitionId: string,
  match: ProviderMatch,
): Promise<"inserted" | "updated"> {
  const stadiumId = await upsertStadium(supabase, provider, match.stadium);
  const mappedId = await findMappedInternalId(supabase, provider, "match", match.externalId);
  const matchNumber = externalMatchNumber(match.externalId) ?? (await getNextMatchNumber(supabase));
  const payload = {
    competition_id: competitionId,
    home_team_name: match.homeTeam.name,
    away_team_name: match.awayTeam.name,
    home_team_code: match.homeTeam.code ?? null,
    away_team_code: match.awayTeam.code ?? null,
    home_country_code: match.homeTeam.code ?? null,
    away_country_code: match.awayTeam.code ?? null,
    kickoff_at: match.kickoffAt,
    status: match.status,
    stadium_id: stadiumId,
    venue: match.stadium?.name ?? null,
    city: match.stadium?.city ?? null,
    home_score: match.homeScore ?? null,
    away_score: match.awayScore ?? null,
    match_number: matchNumber,
    stage: "group",
  };

  if (mappedId) {
    const { data, error } = await supabase
      .from("matches")
      .update(payload)
      .eq("id", mappedId)
      .select("id")
      .single<MatchRow>();

    if (error) throw new Error(`Could not update match ${match.externalId}: ${error.message}`);
    await upsertProviderMapping(supabase, provider, "match", match.externalId, data.id, match);
    return "updated";
  }

  const { data, error } = await supabase
    .from("matches")
    .insert(payload)
    .select("id")
    .single<MatchRow>();

  if (error) throw new Error(`Could not insert match ${match.externalId}: ${error.message}`);

  await upsertProviderMapping(supabase, provider, "match", match.externalId, data.id, match);
  return "inserted";
}

export async function syncMatches(provider: FootballDataProvider = DEFAULT_PROVIDER): Promise<SyncMatchesResult> {
  const supabase = createAdminClient();
  let logId: string | null = null;

  const { data: log } = await supabase
    .from("data_sync_logs")
    .insert({ provider: provider.name, sync_type: "matches", status: "started" })
    .select("id")
    .single<{ id: string }>();
  logId = log?.id ?? null;

  try {
    const matches = await provider.fetchMatches();
    const competitionIds = new Map<string, string>();
    let inserted = 0;
    let updated = 0;

    for (const match of matches) {
      const slug = match.competitionSlug || WORLD_CUP_SLUG;
      let competitionId = competitionIds.get(slug);

      if (!competitionId) {
        competitionId = await getCompetitionId(supabase, slug);
        competitionIds.set(slug, competitionId);
      }

      const result = await upsertMatch(supabase, provider.name, competitionId, match);
      if (result === "inserted") inserted += 1;
      if (result === "updated") updated += 1;
    }

    if (logId) {
      await supabase
        .from("data_sync_logs")
        .update({
          status: "success",
          finished_at: new Date().toISOString(),
          records_processed: matches.length,
          records_inserted: inserted,
          records_updated: updated,
        })
        .eq("id", logId);
    }

    return { provider: provider.name, processed: matches.length, inserted, updated };
  } catch (error) {
    if (logId) {
      await supabase
        .from("data_sync_logs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message: error instanceof Error ? error.message : "Unknown sync error",
        })
        .eq("id", logId);
    }

    throw error;
  }
}
