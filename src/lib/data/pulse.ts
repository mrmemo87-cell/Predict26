import { createClient } from "@/lib/supabase/server";

export const PULSE_CATEGORIES = [
  "Matchday",
  "Team News",
  "Injuries",
  "Lineups",
  "Prediction Trends",
  "Leaderboard",
  "Prizes",
  "Official Update",
] as const;

export type PulseCategory = (typeof PULSE_CATEGORIES)[number];

export type PulseMatch = {
  id: string;
  home_team_name: string | null;
  away_team_name: string | null;
  home_team_code: string | null;
  away_team_code: string | null;
  home_country_code: string | null;
  away_country_code: string | null;
  kickoff_at: string | null;
  stage: string | null;
  venue: string | null;
};

export type PulsePost = {
  id: string;
  title: string;
  summary: string;
  body: string | null;
  category: PulseCategory;
  country_code: string | null;
  home_team_code: string | null;
  away_team_code: string | null;
  match_id: string | null;
  source_name: string | null;
  source_url: string | null;
  cta_label: string | null;
  cta_href: string | null;
  is_published: boolean;
  is_pinned: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  matches: PulseMatch | PulseMatch[] | null;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const PULSE_SELECT = `
  id,
  title,
  summary,
  body,
  category,
  country_code,
  home_team_code,
  away_team_code,
  match_id,
  source_name,
  source_url,
  cta_label,
  cta_href,
  is_published,
  is_pinned,
  published_at,
  created_at,
  updated_at,
  matches (
    id,
    home_team_name,
    away_team_name,
    home_team_code,
    away_team_code,
    home_country_code,
    away_country_code,
    kickoff_at,
    stage,
    venue
  )
`;

export async function fetchPublishedPulsePosts(
  supabase: SupabaseServerClient,
  limit = 20,
): Promise<PulsePost[]> {
  const { data, error } = await supabase
    .from("pulse_posts")
    .select(PULSE_SELECT)
    .eq("is_published", true)
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Pulse feed fetch failed", {
      message: error.message,
      code: error.code,
    });
    return [];
  }

  return (data ?? []) as PulsePost[];
}

export async function fetchDashboardPulsePosts(
  supabase: SupabaseServerClient,
): Promise<PulsePost[]> {
  return fetchPublishedPulsePosts(supabase, 3);
}

export function firstPulseMatch(post: PulsePost): PulseMatch | null {
  if (Array.isArray(post.matches)) return post.matches[0] ?? null;
  return post.matches ?? null;
}
