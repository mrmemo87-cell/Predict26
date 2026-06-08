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
