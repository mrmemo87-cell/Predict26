"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MATCH_STATUSES = ["scheduled", "live", "in_progress", "completed", "postponed", "cancelled"] as const;

type MatchStatus = (typeof MATCH_STATUSES)[number];

const optionalString = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const optionalNumber = (value: FormDataEntryValue | null) => {
  const stringValue = optionalString(value);
  if (!stringValue) return null;
  const parsed = Number(stringValue);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeStatus = (value: FormDataEntryValue | null): MatchStatus => {
  if (typeof value === "string" && MATCH_STATUSES.includes(value as MatchStatus)) {
    return value as MatchStatus;
  }

  return "scheduled";
};

async function requireAdmin() {
  const allowedEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (allowedEmails.length === 0) {
    redirect("/dashboard?error=admin_not_configured");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/admin/matches");
  }

  const email = user.email?.toLowerCase();
  if (!email || !allowedEmails.includes(email)) {
    redirect("/dashboard?error=admin_required");
  }
}

export async function saveMatch(formData: FormData) {
  await requireAdmin();

  const matchId = optionalString(formData.get("match_id"));
  const homeTeamName = optionalString(formData.get("home_team_name"));
  const awayTeamName = optionalString(formData.get("away_team_name"));
  const kickoffAt = optionalString(formData.get("kickoff_at"));

  if (!homeTeamName || !awayTeamName || !kickoffAt) {
    redirect("/admin/matches?error=missing_match_fields");
  }

  const homeScore = optionalNumber(formData.get("home_score"));
  const awayScore = optionalNumber(formData.get("away_score"));
  const status = normalizeStatus(formData.get("status"));
  const stadiumId = optionalString(formData.get("stadium_id"));
  const competitionId = optionalString(formData.get("competition_id"));
  let matchNumber = optionalNumber(formData.get("match_number"));
  const stage = optionalString(formData.get("stage"));

  if (!competitionId) {
    redirect("/admin/matches?error=missing_competition");
  }

  const supabase = createAdminClient();

  if (!matchId && matchNumber === null) {
    const { data: latestMatch } = await supabase
      .from("matches")
      .select("match_number")
      .not("match_number", "is", null)
      .order("match_number", { ascending: false })
      .limit(1)
      .maybeSingle<{ match_number: number | null }>();

    matchNumber = (latestMatch?.match_number ?? 0) + 1;
  }

  const payload = {
    competition_id: competitionId,
    home_team_name: homeTeamName,
    away_team_name: awayTeamName,
    home_team_code: optionalString(formData.get("home_team_code")),
    away_team_code: optionalString(formData.get("away_team_code")),
    home_country_code: optionalString(formData.get("home_team_code")),
    away_country_code: optionalString(formData.get("away_team_code")),
    kickoff_at: new Date(kickoffAt).toISOString(),
    status,
    stadium_id: stadiumId,
    venue: optionalString(formData.get("venue")),
    city: optionalString(formData.get("city")),
    home_score: homeScore,
    away_score: awayScore,
    ...(matchNumber === null ? {} : { match_number: matchNumber }),
    stage: stage ?? "group",
  };

  const query = matchId
    ? supabase.from("matches").update(payload).eq("id", matchId)
    : supabase.from("matches").insert(payload);

  const { error } = await query;

  if (error) {
    redirect(`/admin/matches?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/matches");
  redirect("/admin/matches?saved=1");
}

export async function markReportReviewed(formData: FormData) {
  await requireAdmin();

  const reportId = optionalString(formData.get("report_id"));
  const status = optionalString(formData.get("report_status")) ?? "reviewed";

  if (!reportId || !["reviewed", "dismissed", "resolved"].includes(status)) {
    redirect("/admin/matches?error=invalid_report");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("wrong_match_reports")
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq("id", reportId);

  if (error) {
    redirect(`/admin/matches?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/matches");
  redirect("/admin/matches?report_saved=1");
}
