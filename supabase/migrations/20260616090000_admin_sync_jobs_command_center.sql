-- Admin command-center async sync jobs and provider event upsert fix.

create table if not exists public.admin_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('sync_match_exact', 'sync_match_bonus', 'sync_match_full', 'sync_finished_batch', 'score_match')),
  match_id uuid references public.matches(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'partial', 'failed', 'cancelled')),
  priority integer not null default 100,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  requested_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  error_message text,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_admin_sync_jobs_status_priority
  on public.admin_sync_jobs(status, priority asc, created_at asc);
create index if not exists idx_admin_sync_jobs_match_created
  on public.admin_sync_jobs(match_id, created_at desc);
create index if not exists idx_admin_sync_jobs_next_retry
  on public.admin_sync_jobs(status, updated_at)
  where status in ('queued', 'failed', 'running');

alter table public.admin_sync_jobs enable row level security;

-- Server/admin-only operational queue. No public policies are added.

do $$
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'update_updated_at_column') then
    drop trigger if exists admin_sync_jobs_updated_at on public.admin_sync_jobs;
    create trigger admin_sync_jobs_updated_at
      before update on public.admin_sync_jobs
      for each row execute function public.update_updated_at_column();
  end if;
end $$;

-- The application upserts match_events with ON CONFLICT (match_id, source, provider_event_id).
-- The previous partial unique index did not satisfy that conflict target, so add the exact full unique index.
create unique index if not exists idx_match_events_provider_event_full
  on public.match_events(match_id, source, provider_event_id);

comment on table public.admin_sync_jobs is 'Async admin post-match sync/scoring queue. Buttons enqueue quickly; worker processes small batches.';
comment on index public.idx_match_events_provider_event_full is 'Matches postMatchSync ON CONFLICT (match_id, source, provider_event_id).';
