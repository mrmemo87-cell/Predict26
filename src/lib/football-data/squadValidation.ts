import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { createAdminClient } from "@/lib/supabase/admin";

type SquadValidationRpcRow = {
  check_name: string;
  passed: boolean;
  details: Record<string, unknown> | null;
};

export type SquadValidationCheck = {
  checkName: string;
  passed: boolean;
  details: Record<string, unknown>;
};

export type SquadSeedFileValidation = {
  filePath: string;
  nulByteCount: number;
  replacementCharacterCount: number;
  isTextSafe: boolean;
};

export type SquadImportResult = {
  importVersionId: string;
  playersUpserted: number;
  squadRowsUpserted: number;
  activated: boolean;
};

const SQUAD_SEED_FILE = path.join(process.cwd(), "src/lib/football-data/wc2026_squad_seed_staging.sql");

const normalizeDetails = (details: Record<string, unknown> | null): Record<string, unknown> => details ?? {};

export async function validateSquadSeedFile(filePath = SQUAD_SEED_FILE): Promise<SquadSeedFileValidation> {
  const contents = await readFile(filePath);
  const text = contents.toString("utf8");
  const nulByteCount = contents.filter((byte) => byte === 0).length;
  const replacementCharacterCount = [...text].filter((character) => character === "�").length;

  return {
    filePath,
    nulByteCount,
    replacementCharacterCount,
    isTextSafe: nulByteCount === 0 && replacementCharacterCount === 0,
  };
}

export async function validateWc2026SquadStaging(): Promise<SquadValidationCheck[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("validate_wc2026_squad_staging");

  if (error) {
    throw new Error(`Unable to validate WC2026 squad staging data: ${error.message}`);
  }

  return ((data ?? []) as SquadValidationRpcRow[]).map((row) => ({
    checkName: row.check_name,
    passed: row.passed,
    details: normalizeDetails(row.details),
  }));
}

export async function importWc2026SquadFromStaging(options: {
  sourceImportId?: string;
  activate?: boolean;
} = {}): Promise<SquadImportResult | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("import_wc2026_squad_from_staging", {
    p_source_import_id: options.sourceImportId ?? null,
    p_activate: options.activate ?? false,
  });

  if (error) {
    throw new Error(`Unable to import WC2026 squad staging data: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;

  return {
    importVersionId: row.import_version_id,
    playersUpserted: row.players_upserted,
    squadRowsUpserted: row.squad_rows_upserted,
    activated: row.activated,
  };
}
