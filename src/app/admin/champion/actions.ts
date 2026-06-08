"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/admin/permissions";
import { scoreTournamentChampion } from "@/lib/scoring/championScoring";
import { createAdminClient } from "@/lib/supabase/admin";

const ADMIN_CHAMPION_PATH = "/admin/champion";
const DEFAULT_COMPETITION_CODE = "WC2026";

const optionalString = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeCompetitionCode = (value: FormDataEntryValue | null) =>
  (optionalString(value) ?? DEFAULT_COMPETITION_CODE).toUpperCase();

const revalidateChampionPaths = () => {
  revalidatePath("/admin");
  revalidatePath(ADMIN_CHAMPION_PATH);
  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
  revalidatePath("/predictions");
};

const redirectWithStatus = (params: Record<string, string | number>): never => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });

  redirect(`${ADMIN_CHAMPION_PATH}?${searchParams.toString()}`);
};

async function getCompetitionId(competitionCode: string) {
  const supabase = createAdminClient();
  const { data: config } = await supabase
    .from("tournament_prediction_config")
    .select("competition_id")
    .eq("competition_code", competitionCode)
    .maybeSingle<{ competition_id: string | null }>();

  if (config?.competition_id) return config.competition_id;

  if (competitionCode === DEFAULT_COMPETITION_CODE) {
    const { data: competition } = await supabase
      .from("competitions")
      .select("id")
      .eq("slug", "world-cup-2026")
      .maybeSingle<{ id: string }>();

    return competition?.id ?? null;
  }

  return null;
}

export async function saveChampionResultDraft(formData: FormData) {
  await requireAdminUser(ADMIN_CHAMPION_PATH);

  const competitionCode = normalizeCompetitionCode(
    formData.get("competition_code"),
  );
  const championTeamCode = optionalString(formData.get("champion_team_code"));
  const championSource = optionalString(formData.get("champion_source"));
  const championNotes = optionalString(formData.get("champion_notes"));
  const competitionId = await getCompetitionId(competitionCode);
  const supabase = createAdminClient();

  const { error } = await supabase.from("tournament_results").upsert(
    {
      competition_code: competitionCode,
      competition_id: competitionId,
      champion_team_code: championTeamCode,
      champion_confirmed: false,
      champion_confirmed_at: null,
      champion_confirmed_by: null,
      champion_source: championSource,
      champion_notes: championNotes,
    },
    { onConflict: "competition_code" },
  );

  if (error) {
    console.error("Failed to save draft Champion result", error);
    redirectWithStatus({ error: "save_failed" });
  }

  revalidateChampionPaths();
  redirectWithStatus({ saved: "draft" });
}

export async function confirmChampionResult(formData: FormData) {
  const admin = await requireAdminUser(ADMIN_CHAMPION_PATH);

  const competitionCode = normalizeCompetitionCode(
    formData.get("competition_code"),
  );
  const championTeamCode = optionalString(formData.get("champion_team_code"));
  const championSource = optionalString(formData.get("champion_source"));
  const championNotes = optionalString(formData.get("champion_notes"));

  if (!championTeamCode) {
    redirectWithStatus({ error: "missing_champion" });
  }

  const competitionId = await getCompetitionId(competitionCode);
  const supabase = createAdminClient();
  const { error } = await supabase.from("tournament_results").upsert(
    {
      competition_code: competitionCode,
      competition_id: competitionId,
      champion_team_code: championTeamCode,
      champion_confirmed: true,
      champion_confirmed_at: new Date().toISOString(),
      champion_confirmed_by: admin.id,
      champion_source: championSource,
      champion_notes: championNotes,
    },
    { onConflict: "competition_code" },
  );

  if (error) {
    console.error("Failed to confirm Champion result", error);
    redirectWithStatus({ error: "confirm_failed" });
  }

  revalidateChampionPaths();
  redirectWithStatus({ saved: "confirmed" });
}

export async function withdrawChampionResult(formData: FormData) {
  await requireAdminUser(ADMIN_CHAMPION_PATH);

  const competitionCode = normalizeCompetitionCode(
    formData.get("competition_code"),
  );
  const championTeamCode = optionalString(formData.get("champion_team_code"));
  const championSource = optionalString(formData.get("champion_source"));
  const championNotes = optionalString(formData.get("champion_notes"));
  const competitionId = await getCompetitionId(competitionCode);
  const supabase = createAdminClient();

  const { error } = await supabase.from("tournament_results").upsert(
    {
      competition_code: competitionCode,
      competition_id: competitionId,
      champion_team_code: championTeamCode,
      champion_confirmed: false,
      champion_confirmed_at: null,
      champion_confirmed_by: null,
      champion_source: championSource,
      champion_notes: championNotes,
    },
    { onConflict: "competition_code" },
  );

  if (error) {
    console.error("Failed to withdraw Champion result confirmation", error);
    redirectWithStatus({ error: "withdraw_failed" });
  }

  revalidateChampionPaths();
  redirectWithStatus({ saved: "withdrawn" });
}

export async function scoreChampionPicks(formData: FormData) {
  const admin = await requireAdminUser(ADMIN_CHAMPION_PATH);
  const competitionCode = normalizeCompetitionCode(
    formData.get("competition_code"),
  );

  const result = await scoreTournamentChampion({
    competitionCode,
    triggeredBy: admin.id,
  }).catch((error) => {
    console.error("Failed to score Champion picks", error);
    return null;
  });

  if (!result) {
    return redirectWithStatus({ error: "scoring_failed" });
  }

  revalidateChampionPaths();
  return redirectWithStatus({
    scored: "1",
    picks: result.picksEvaluated,
    rows: result.ledgerRowsUpserted,
    voided: result.staleLedgerRowsVoided,
    points: result.totalPointsAwarded,
  });
}
