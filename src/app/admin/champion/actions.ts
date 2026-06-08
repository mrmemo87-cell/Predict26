"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/admin/permissions";
import { scoreTournamentChampion } from "@/lib/scoring/championScoring";
import { createAdminClient } from "@/lib/supabase/admin";

const ADMIN_CHAMPION_PATH = "/admin/champion";
const DEFAULT_COMPETITION_CODE = "WC2026";
const DEFAULT_KNOCKOUT_STARTS_AT = "2026-06-28T00:00:00.000Z";
const DEFAULT_ROUND_OF_16_STARTS_AT = "2026-07-04T00:00:00.000Z";
const DEFAULT_CHAMPION_PICK_A_DEADLINE = "2026-06-28T00:00:00.000Z";
const DEFAULT_CHAMPION_PICK_B_DEADLINE = "2026-07-04T00:00:00.000Z";

const optionalString = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeCompetitionCode = (value: FormDataEntryValue | null) =>
  (optionalString(value) ?? DEFAULT_COMPETITION_CODE).toUpperCase();

const parseDateTimeInput = (value: FormDataEntryValue | null) => {
  const raw = optionalString(value);
  if (!raw) return null;

  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const timePart = raw.split("T")[1] ?? "";
  const hasSeconds = timePart.split(":").length > 2;
  const normalized = hasTimezone ? raw : `${raw}${hasSeconds ? "" : ":00"}Z`;
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

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

export async function setupChampionPickConfig(formData: FormData) {
  await requireAdminUser(ADMIN_CHAMPION_PATH);

  const competitionCode = normalizeCompetitionCode(
    formData.get("competition_code"),
  );
  const competitionId = await getCompetitionId(competitionCode);
  const supabase = createAdminClient();

  const { data: existing, error: readError } = await supabase
    .from("tournament_prediction_config")
    .select(
      "knockout_starts_at, round_of_16_starts_at, champion_pick_a_deadline, champion_pick_b_deadline",
    )
    .eq("competition_code", competitionCode)
    .maybeSingle<{
      knockout_starts_at: string | null;
      round_of_16_starts_at: string | null;
      champion_pick_a_deadline: string | null;
      champion_pick_b_deadline: string | null;
    }>();

  if (readError) {
    console.error("Failed to read Champion Pick configuration", readError);
    redirectWithStatus({ error: "config_save_failed" });
  }

  const { error } = await supabase.from("tournament_prediction_config").upsert(
    {
      competition_code: competitionCode,
      competition_id: competitionId,
      knockout_starts_at:
        existing?.knockout_starts_at ?? DEFAULT_KNOCKOUT_STARTS_AT,
      round_of_16_starts_at:
        existing?.round_of_16_starts_at ?? DEFAULT_ROUND_OF_16_STARTS_AT,
      champion_pick_a_deadline:
        existing?.champion_pick_a_deadline ?? DEFAULT_CHAMPION_PICK_A_DEADLINE,
      champion_pick_b_deadline:
        existing?.champion_pick_b_deadline ?? DEFAULT_CHAMPION_PICK_B_DEADLINE,
      champion_picks_enabled: true,
    },
    { onConflict: "competition_code" },
  );

  if (error) {
    console.error("Failed to set up Champion Pick configuration", error);
    redirectWithStatus({ error: "config_save_failed" });
  }

  revalidateChampionPaths();
  redirectWithStatus({ saved: "config_setup" });
}

export async function saveChampionPickConfig(formData: FormData) {
  await requireAdminUser(ADMIN_CHAMPION_PATH);

  const competitionCode = normalizeCompetitionCode(
    formData.get("competition_code"),
  );
  const competitionId = await getCompetitionId(competitionCode);
  const knockoutStartsAt = parseDateTimeInput(
    formData.get("knockout_starts_at"),
  );
  const roundOf16StartsAt = parseDateTimeInput(
    formData.get("round_of_16_starts_at"),
  );
  const championPickADeadline = parseDateTimeInput(
    formData.get("champion_pick_a_deadline"),
  );
  const championPickBDeadline = parseDateTimeInput(
    formData.get("champion_pick_b_deadline"),
  );
  const championPicksEnabled = formData.get("champion_picks_enabled") === "on";

  const supabase = createAdminClient();
  const { error } = await supabase.from("tournament_prediction_config").upsert(
    {
      competition_code: competitionCode,
      competition_id: competitionId,
      knockout_starts_at: knockoutStartsAt,
      round_of_16_starts_at: roundOf16StartsAt,
      champion_pick_a_deadline: championPickADeadline,
      champion_pick_b_deadline: championPickBDeadline,
      champion_picks_enabled: championPicksEnabled,
    },
    { onConflict: "competition_code" },
  );

  if (error) {
    console.error("Failed to save Champion Pick configuration", error);
    redirectWithStatus({ error: "config_save_failed" });
  }

  revalidateChampionPaths();
  redirectWithStatus({ saved: "config" });
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
