import { revalidatePath } from "next/cache";

import { syncFinishedMatches } from "@/lib/football-data/postMatchSync";
import { scoreFinishedMatch } from "@/lib/scoring/matchScoring";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export type AdminSyncJobType =
  | "sync_match_exact"
  | "sync_match_bonus"
  | "sync_match_full"
  | "sync_finished_batch"
  | "score_match";

const STALE_RUNNING_MINUTES = 15;
const DEFAULT_LIMIT = 2;

export async function queueAdminSyncJob({
  jobType,
  matchId,
  requestedBy,
  priority = 100,
}: {
  jobType: AdminSyncJobType;
  matchId?: string | null;
  requestedBy?: string | null;
  priority?: number;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("admin_sync_jobs")
    .insert({ job_type: jobType, match_id: matchId ?? null, requested_by: requestedBy ?? null, priority })
    .select("id")
    .single<{ id: string }>();

  if (error) throw new Error(`Could not queue admin sync job: ${error.message}`);
  return data.id;
}

export async function queueEligibleFinishedBatch(requestedBy?: string | null, limit = 8) {
  const supabase = createAdminClient();
  const readyBefore = new Date(Date.now() - 120 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("matches")
    .select("id, sync_state:match_provider_sync_state(status,next_sync_after,retry_count)")
    .in("status", ["scheduled", "live", "in_progress", "completed", "finished"])
    .not("kickoff_at", "is", null)
    .lte("kickoff_at", readyBefore)
    .order("kickoff_at", { ascending: true })
    .limit(limit * 2);

  if (error) throw new Error(`Could not find eligible matches: ${error.message}`);

  const now = Date.now();
  const eligible = ((data ?? []) as Array<{ id: string; sync_state?: Array<{ status?: string | null; next_sync_after?: string | null; retry_count?: number | null }> | null }>)
    .filter((match) => {
      const state = Array.isArray(match.sync_state) ? match.sync_state[0] : null;
      if (state?.status === "fully_scored") return false;
      if ((state?.retry_count ?? 0) >= 3) return false;
      if (state?.next_sync_after && new Date(state.next_sync_after).getTime() > now) return false;
      return true;
    })
    .slice(0, limit);

  if (eligible.length === 0) return { queued: 0, remainingEligible: 0 };

  const { error: insertError } = await supabase.from("admin_sync_jobs").insert(
    eligible.map((match, index) => ({
      job_type: "sync_match_full",
      match_id: match.id,
      requested_by: requestedBy ?? null,
      priority: 50 + index,
    })),
  );
  if (insertError) throw new Error(`Could not queue eligible matches: ${insertError.message}`);

  return { queued: eligible.length, remainingEligible: Math.max(((data ?? []).length) - eligible.length, 0) };
}

async function recoverStaleJobs(supabase: AdminClient) {
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MINUTES * 60_000).toISOString();
  await supabase
    .from("admin_sync_jobs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_code: "stale_running_job",
      error_message: "Job was running too long and was marked retryable.",
    })
    .eq("status", "running")
    .lt("started_at", staleBefore);
}

async function processJob(supabase: AdminClient, job: { id: string; job_type: AdminSyncJobType; match_id: string | null; attempts: number }) {
  const startedAt = new Date().toISOString();
  await supabase
    .from("admin_sync_jobs")
    .update({ status: "running", started_at: startedAt, finished_at: null, attempts: job.attempts + 1, error_code: null, error_message: null })
    .eq("id", job.id);

  try {
    let result: unknown;
    if (job.job_type === "score_match") {
      if (!job.match_id) throw new Error("score_match requires match_id");
      result = await scoreFinishedMatch(job.match_id);
    } else if (job.job_type === "sync_finished_batch") {
      result = await syncFinishedMatches();
    } else {
      if (!job.match_id) throw new Error(`${job.job_type} requires match_id`);
      result = await syncFinishedMatches(undefined, job.match_id);
    }

    const resultSummary = result as { failed?: number; needsReview?: number } | null;
    const status = typeof result === "object" && result && (
      Number(resultSummary?.failed ?? 0) > 0 || Number(resultSummary?.needsReview ?? 0) > 0
    ) ? "partial" : "completed";
    await supabase
      .from("admin_sync_jobs")
      .update({ status, finished_at: new Date().toISOString(), result: result as Record<string, unknown> })
      .eq("id", job.id);
    return { id: job.id, status, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync job failure";
    await supabase
      .from("admin_sync_jobs")
      .update({ status: "failed", finished_at: new Date().toISOString(), error_code: "job_failed", error_message: message, result: { message } })
      .eq("id", job.id);
    return { id: job.id, status: "failed", error: message };
  }
}

export async function processAdminSyncJobs(limit = DEFAULT_LIMIT) {
  const supabase = createAdminClient();
  await recoverStaleJobs(supabase);

  const { data, error } = await supabase
    .from("admin_sync_jobs")
    .select("id, job_type, match_id, attempts")
    .eq("status", "queued")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 3)));

  if (error) throw new Error(`Could not load queued sync jobs: ${error.message}`);
  const processed = [];
  for (const job of (data ?? []) as Array<{ id: string; job_type: AdminSyncJobType; match_id: string | null; attempts: number }>) {
    processed.push(await processJob(supabase, job));
  }

  revalidatePath("/admin/matches");
  revalidatePath("/admin/command-center");
  revalidatePath("/leaderboard");
  revalidatePath("/dashboard");
  return { picked: data?.length ?? 0, processed };
}
