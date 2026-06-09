"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminUser } from "@/lib/admin/permissions";
import {
  backfillExactResultLedger,
  reconcileExactResultLedger,
} from "@/lib/scoring/exactResultLedger";

const ADMIN_PATH = "/admin";

const redirectWithLedgerParams = (params: Record<string, string | number>): never => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });

  redirect(`${ADMIN_PATH}?${searchParams.toString()}`);
};

export async function runExactResultLedgerReconciliation() {
  await requireAdminUser(ADMIN_PATH);

  const result = await reconcileExactResultLedger().catch((error) => {
    console.error("Exact-result ledger reconciliation failed", error);
    return null;
  });

  if (!result) {
    return redirectWithLedgerParams({ ledger_error: "reconciliation_failed" });
  }

  revalidatePath(ADMIN_PATH);
  return redirectWithLedgerParams({
    ledger_action: "reconciled",
    ledger_status: result.status,
  });
}

export async function dryRunExactResultLedgerBackfill() {
  await requireAdminUser(ADMIN_PATH);

  const result = await backfillExactResultLedger({ dryRun: true }).catch(
    (error) => {
      console.error("Exact-result ledger dry-run backfill failed", error);
      return null;
    },
  );

  if (!result) {
    return redirectWithLedgerParams({ ledger_error: "dry_run_failed" });
  }

  revalidatePath(ADMIN_PATH);
  return redirectWithLedgerParams({
    ledger_action: "dry_run_backfill",
    ledger_status: result.status,
    ledger_rows_to_insert: result.rowsToInsertCount,
    ledger_points_to_insert: result.insertedPointsSum,
  });
}

export async function runExactResultLedgerBackfill() {
  await requireAdminUser(ADMIN_PATH);

  const result = await backfillExactResultLedger({ dryRun: false }).catch(
    (error) => {
      console.error("Exact-result ledger backfill failed", error);
      return null;
    },
  );

  if (!result) {
    return redirectWithLedgerParams({ ledger_error: "backfill_failed" });
  }

  revalidatePath(ADMIN_PATH);
  return redirectWithLedgerParams({
    ledger_action: "backfilled",
    ledger_status: result.status,
    ledger_inserted_rows: result.insertedLedgerRowsCount,
    ledger_inserted_points: result.insertedPointsSum,
  });
}

const RESET_CONFIRMATION = "RESET PREDICT26 TEST DATA";
const DELETE_CONFIRMATION = "DELETE TEST PARTICIPANTS";

const ADMIN_REVALIDATE_PATHS = [
  "/admin",
  "/dashboard",
  "/leaderboard",
  "/predictions",
  "/admin/matches",
  "/admin/champion",
];

const redirectWithCleanupParams = (params: Record<string, string | number>): never => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });

  redirect(`${ADMIN_PATH}?${searchParams.toString()}#testing-cleanup`);
};

const revalidateAdminSurfaces = () => {
  ADMIN_REVALIDATE_PATHS.forEach((path) => revalidatePath(path));
};

export async function resetPredictionsAndScores(formData: FormData) {
  await requireAdminUser(ADMIN_PATH);

  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (confirmation !== RESET_CONFIRMATION) {
    return redirectWithCleanupParams({ cleanup_error: "reset_confirmation" });
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();

  const { data: lineupRows, error: lineupSelectError } = await supabase
    .from("prediction_lineups")
    .select("id");

  if (lineupSelectError) {
    console.error("Testing cleanup lineup fetch failed", lineupSelectError);
    return redirectWithCleanupParams({ cleanup_error: "reset_failed" });
  }

  const lineupIds = (lineupRows ?? [])
    .map((row: { id?: string | null }) => row.id)
    .filter(Boolean) as string[];

  const deletionSteps = [
    async () =>
      lineupIds.length > 0
        ? supabase.from("prediction_lineup_players").delete().in("prediction_lineup_id", lineupIds)
        : Promise.resolve({ error: null }),
    async () => supabase.from("prediction_lineups").delete().not("id", "is", null),
    async () => supabase.from("prediction_scorers").delete().not("id", "is", null),
    async () => supabase.from("prediction_possession").delete().not("id", "is", null),
    async () => supabase.from("tournament_champion_predictions").delete().not("id", "is", null),
    async () => supabase.from("scoring_ledger").delete().not("id", "is", null),
    async () => supabase.from("scoring_runs").delete().not("id", "is", null),
    async () => supabase.from("predictions").delete().not("id", "is", null),
    async () =>
      supabase
        .from("profiles")
        .update({
          points: 0,
          prediction_count: 0,
          correct_prediction_count: 0,
          accuracy: 0,
        })
        .not("id", "is", null),
    async () =>
      supabase
        .from("leaderboards")
        .update({
          global_rank: null,
          country_rank: null,
          referral_rank: null,
          distance_to_top3: null,
          distance_to_prize_zone: null,
        })
        .not("id", "is", null),
  ];

  for (const step of deletionSteps) {
    const { error } = await step();
    if (error) {
      console.error("Testing cleanup reset failed", error);
      return redirectWithCleanupParams({ cleanup_error: "reset_failed" });
    }
  }

  revalidateAdminSurfaces();
  return redirectWithCleanupParams({ cleanup_action: "reset_complete" });
}

export async function deleteTestParticipants(formData: FormData) {
  const adminUser = await requireAdminUser(ADMIN_PATH);

  const confirmation = String(formData.get("confirmation") ?? "").trim();
  const participantIds = formData
    .getAll("participant_ids")
    .map((value) => String(value))
    .filter(Boolean);

  if (confirmation !== DELETE_CONFIRMATION) {
    return redirectWithCleanupParams({ cleanup_error: "delete_confirmation" });
  }

  if (participantIds.length === 0) {
    return redirectWithCleanupParams({ cleanup_error: "delete_none" });
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { getConfiguredAdminEmails } = await import("@/lib/admin/permissions");
  const supabase = createAdminClient();
  const configuredAdminEmails = new Set(getConfiguredAdminEmails());

  const safeIds: string[] = [];
  for (const id of new Set(participantIds)) {
    if (id === adminUser.id) continue;

    const { data, error } = await supabase.auth.admin.getUserById(id);
    if (error) {
      console.error("Participant auth lookup failed", { id, error });
      continue;
    }

    const email = data.user?.email?.trim().toLowerCase();
    if (email && configuredAdminEmails.has(email)) continue;
    safeIds.push(id);
  }

  if (safeIds.length === 0) {
    return redirectWithCleanupParams({ cleanup_error: "delete_protected" });
  }

  const { error } = await supabase.from("profiles").delete().in("id", safeIds);
  if (error) {
    console.error("Participant profile delete failed", error);
    return redirectWithCleanupParams({ cleanup_error: "delete_failed" });
  }

  revalidateAdminSurfaces();
  return redirectWithCleanupParams({
    cleanup_action: "participants_deleted",
    deleted_count: safeIds.length,
  });
}
