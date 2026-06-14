-- Allow post-match sync attempts to finish with explicit terminal states.
alter table public.provider_sync_runs
  drop constraint if exists provider_sync_runs_status_check;

alter table public.provider_sync_runs
  add constraint provider_sync_runs_status_check
  check (status in ('started', 'completed', 'success', 'partial', 'needs_review', 'failed', 'skipped_not_ready_yet'));

alter table public.match_provider_sync_state
  drop constraint if exists match_provider_sync_state_status_check;

alter table public.match_provider_sync_state
  add constraint match_provider_sync_state_status_check
  check (status in ('not_started', 'awaiting_final_data', 'final_score_scored', 'bonus_pending', 'needs_review', 'fully_scored', 'corrected_rescored', 'failed', 'skipped_not_ready_yet'));
