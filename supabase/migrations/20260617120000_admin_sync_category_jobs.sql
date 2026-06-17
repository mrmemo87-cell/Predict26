-- Expand async admin sync jobs for category-specific retries and payload metadata.
alter table public.admin_sync_jobs
  add column if not exists payload jsonb not null default '{}'::jsonb;

do $$
begin
  alter table public.admin_sync_jobs drop constraint if exists admin_sync_jobs_job_type_check;
  alter table public.admin_sync_jobs add constraint admin_sync_jobs_job_type_check
    check (job_type in (
      'sync_match_exact',
      'sync_match_bonus',
      'sync_match_possession',
      'sync_match_scorers',
      'sync_match_home_lineup',
      'sync_match_away_lineup',
      'sync_match_full',
      'sync_finished_batch',
      'score_match'
    ));
end $$;

create index if not exists idx_admin_sync_jobs_active_match_type
  on public.admin_sync_jobs(match_id, job_type, status)
  where status in ('queued', 'running');
