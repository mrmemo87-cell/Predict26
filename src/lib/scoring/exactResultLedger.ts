import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type ExactResultBackfillRow = {
  scoring_run_id: string | null;
  dry_run: boolean;
  scored_predictions_count: number;
  existing_ledger_rows_count: number;
  rows_to_insert_count: number;
  inserted_ledger_rows_count: number;
  predictions_points_sum: number;
  inserted_points_sum: number;
  status: string;
};

export type ExactResultLedgerBackfillResult = {
  scoringRunId: string | null;
  dryRun: boolean;
  scoredPredictionsCount: number;
  existingLedgerRowsCount: number;
  rowsToInsertCount: number;
  insertedLedgerRowsCount: number;
  predictionsPointsSum: number;
  insertedPointsSum: number;
  status: string;
};

type ExactResultReconciliationRow = {
  scored_predictions_count: number;
  exact_result_ledger_rows_count: number;
  predictions_points_sum: number;
  ledger_points_sum: number;
  profiles_points_sum: number;
  users_with_mismatch_count: number;
  users_with_mismatch: unknown;
  missing_ledger_rows_count: number;
  duplicate_active_ledger_rows_count: number;
  unexpected_active_non_exact_ledger_rows_count: number;
  active_ledger_points_sum: number;
  status: string;
};

export type ExactResultLedgerReconciliationResult = {
  scoredPredictionsCount: number;
  exactResultLedgerRowsCount: number;
  predictionsPointsSum: number;
  ledgerPointsSum: number;
  profilesPointsSum: number;
  usersWithMismatchCount: number;
  usersWithMismatch: unknown;
  missingLedgerRowsCount: number;
  duplicateActiveLedgerRowsCount: number;
  unexpectedActiveNonExactLedgerRowsCount: number;
  activeLedgerPointsSum: number;
  status: string;
};

export async function backfillExactResultLedger(
  options: { dryRun?: boolean } = {},
): Promise<ExactResultLedgerBackfillResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(
    "backfill_exact_result_scoring_ledger",
    {
      p_dry_run: options.dryRun ?? true,
    },
  );

  if (error) {
    throw new Error(`Unable to backfill exact-result ledger: ${error.message}`);
  }

  const row = ((data ?? []) as ExactResultBackfillRow[])[0];

  if (!row) {
    return {
      scoringRunId: null,
      dryRun: options.dryRun ?? true,
      scoredPredictionsCount: 0,
      existingLedgerRowsCount: 0,
      rowsToInsertCount: 0,
      insertedLedgerRowsCount: 0,
      predictionsPointsSum: 0,
      insertedPointsSum: 0,
      status: "empty",
    };
  }

  return {
    scoringRunId: row.scoring_run_id,
    dryRun: row.dry_run,
    scoredPredictionsCount: row.scored_predictions_count,
    existingLedgerRowsCount: row.existing_ledger_rows_count,
    rowsToInsertCount: row.rows_to_insert_count,
    insertedLedgerRowsCount: row.inserted_ledger_rows_count,
    predictionsPointsSum: row.predictions_points_sum,
    insertedPointsSum: row.inserted_points_sum,
    status: row.status,
  };
}

export async function reconcileExactResultLedger(): Promise<ExactResultLedgerReconciliationResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(
    "reconcile_exact_result_scoring_ledger",
  );

  if (error) {
    throw new Error(`Unable to reconcile exact-result ledger: ${error.message}`);
  }

  const row = ((data ?? []) as ExactResultReconciliationRow[])[0];

  if (!row) {
    return {
      scoredPredictionsCount: 0,
      exactResultLedgerRowsCount: 0,
      predictionsPointsSum: 0,
      ledgerPointsSum: 0,
      profilesPointsSum: 0,
      usersWithMismatchCount: 0,
      usersWithMismatch: [],
      missingLedgerRowsCount: 0,
      duplicateActiveLedgerRowsCount: 0,
      unexpectedActiveNonExactLedgerRowsCount: 0,
      activeLedgerPointsSum: 0,
      status: "empty",
    };
  }

  return {
    scoredPredictionsCount: row.scored_predictions_count,
    exactResultLedgerRowsCount: row.exact_result_ledger_rows_count,
    predictionsPointsSum: row.predictions_points_sum,
    ledgerPointsSum: row.ledger_points_sum,
    profilesPointsSum: row.profiles_points_sum,
    usersWithMismatchCount: row.users_with_mismatch_count,
    usersWithMismatch: row.users_with_mismatch,
    missingLedgerRowsCount: row.missing_ledger_rows_count,
    duplicateActiveLedgerRowsCount: row.duplicate_active_ledger_rows_count,
    unexpectedActiveNonExactLedgerRowsCount: row.unexpected_active_non_exact_ledger_rows_count ?? 0,
    activeLedgerPointsSum: row.active_ledger_points_sum ?? row.ledger_points_sum ?? 0,
    status: row.status,
  };
}
