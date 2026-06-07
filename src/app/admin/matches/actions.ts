"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/admin/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

const MATCH_STATUSES = ["scheduled", "live", "in_progress", "completed", "postponed", "cancelled"] as const;
const REPORT_STATUSES = ["reviewed", "dismissed", "resolved"] as const;

type MatchStatus = (typeof MATCH_STATUSES)[number];
type ReportStatus = (typeof REPORT_STATUSES)[number];

const optionalString = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const optionalNonNegativeInteger = (value: FormDataEntryValue | null) => {
  const stringValue = optionalString(value);
  if (!stringValue) return null;

  const parsed = Number(stringValue);
  if (!Number.isInteger(parsed) || parsed < 0) {
    redirect("/admin/matches?error=invalid_non_negative_number");
  }

  return parsed;
};

const normalizeStatus = (value: FormDataEntryValue | null): MatchStatus => {
  if (typeof value === "string" && MATCH_STATUSES.includes(value as MatchStatus)) {
    return value as MatchStatus;
  }

  redirect("/admin/matches?error=invalid_match_status");
};

const normalizeReportStatus = (value: FormDataEntryValue | null): ReportStatus => {
  if (typeof value === "string" && REPORT_STATUSES.includes(value as ReportStatus)) {
    return value as ReportStatus;
  }

  redirect("/admin/matches?error=invalid_report");
};

export async function saveMatch(formData: FormData) {
  await requireAdminUser();

  const matchId = optionalString(formData.get("match_id"));
  const homeTeamName = optionalString(formData.get("home_team_name"));
  const awayTeamName = optionalString(formData.get("away_team_name"));
  const kickoffAt = optionalString(formData.get("kickoff_at"));

  if (!homeTeamName || !awayTeamName || !kickoffAt) {
    redirect("/admin/matches?error=missing_match_fields");
  }

  const kickoffDate = new Date(kickoffAt);
  if (Number.isNaN(kickoffDate.getTime())) {
    redirect("/admin/matches?error=invalid_kickoff_time");
  }

  const homeScore = optionalNonNegativeInteger(formData.get("home_score"));
  const awayScore = optionalNonNegativeInteger(formData.get("away_score"));
  const status = normalizeStatus(formData.get("status"));
  const stadiumId = optionalString(formData.get("stadium_id"));
  const competitionId = optionalString(formData.get("competition_id"));
  let matchNumber = optionalNonNegativeInteger(formData.get("match_number"));
  const stage = optionalString(formData.get("stage"));

  if (!competitionId) {
    redirect("/admin/matches?error=missing_competition");
  }

  if ((homeScore === null) !== (awayScore === null)) {
    redirect("/admin/matches?error=incomplete_score");
  }

  if ((status === "live" || status === "in_progress" || status === "completed") && homeScore === null) {
    redirect("/admin/matches?error=score_required_for_status");
  }

  if ((status === "scheduled" || status === "postponed" || status === "cancelled") && homeScore !== null) {
    redirect("/admin/matches?error=score_not_allowed_for_status");
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
    kickoff_at: kickoffDate.toISOString(),
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
  const admin = await requireAdminUser();

  const reportId = optionalString(formData.get("report_id"));
  const status = normalizeReportStatus(formData.get("report_status"));

  if (!reportId) {
    redirect("/admin/matches?error=invalid_report");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("wrong_match_reports")
    .update({ status, reviewed_by: admin.id, reviewed_at: new Date().toISOString() })
    .eq("id", reportId);

  if (error) {
    redirect(`/admin/matches?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/matches");
  redirect("/admin/matches?report_saved=1");
}
