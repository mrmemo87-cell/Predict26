import { createClient } from "@/lib/supabase/server";
import { WORLD_CUP_SLUG } from "@/lib/domain/constants";

export type GroupTeam = {
  country_code: string;
  country_name: string;
  flag_emoji: string | null;
  group_name: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function fetchWorldCupGroups(
  supabase: SupabaseServerClient,
): Promise<Record<string, GroupTeam[]>> {
  // Get competition id
  const { data: competition } = await supabase
    .from("competitions")
    .select("id")
    .eq("slug", WORLD_CUP_SLUG)
    .maybeSingle();

  if (!competition?.id) return {};

  // Fetch competition_teams joined with countries
  const { data, error } = await supabase
    .from("competition_teams")
    .select("country_code, group_name, countries(name, flag_emoji)")
    .eq("competition_id", competition.id)
    .order("group_name", { ascending: true });

  if (error || !data) return {};

  const groups: Record<string, GroupTeam[]> = {};

  for (const row of data) {
    const countryData = Array.isArray(row.countries) ? row.countries[0] : row.countries;

    // Filter out dev teams in production
    if (process.env.NODE_ENV !== "development") {
      const countryName = countryData?.name || "";
      if (/^X/i.test(row.country_code) || /^Dev /i.test(countryName)) {
        continue;
      }
    }

    const groupName = row.group_name || "?";
    const team: GroupTeam = {
      country_code: row.country_code,
      country_name: countryData?.name || row.country_code,
      flag_emoji: countryData?.flag_emoji || null,
      group_name: groupName,
    };

    if (!groups[groupName]) {
      groups[groupName] = [];
    }
    groups[groupName].push(team);
  }

  return groups;
}
