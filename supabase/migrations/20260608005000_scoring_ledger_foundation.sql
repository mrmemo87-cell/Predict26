-- Predict26 scoring ledger foundation.
-- Additive-only: not connected to match scoring, profile points, or leaderboards yet.

create table if not exists public.scoring_runs (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('match', 'competition')),
  match_id uuid references public.matches(id) on delete set null,
  competition_id uuid references public.competitions(id) on delete set null,
  categories_requested text[] not null default array[]::text[],
  categories_completed text[] not null default array[]::text[],
  categories_skipped jsonb not null default '{}'::jsonb,
  status text not null check (status in ('started', 'completed', 'failed', 'partial', 'skipped')),
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  triggered_by uuid references public.profiles(id) on delete set null,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  check (
    (scope_type = 'match' and match_id is not null)
    or (scope_type = 'competition' and competition_id is not null)
  ),
  check (finished_at is null or finished_at >= started_at)
);

create table if not exists public.scoring_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  competition_id uuid references public.competitions(id) on delete set null,
  match_id uuid references public.matches(id) on delete set null,
  prediction_id uuid references public.predictions(id) on delete set null,
  category text not null check (category in (
    'match_exact_result',
    'match_possession',
    'match_scorer',
    'match_lineup',
    'champion_pick_a',
    'champion_pick_b'
  )),
  entity_key text not null,
  points integer not null,
  source_table text,
  source_id uuid,
  scoring_run_id uuid references public.scoring_runs(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  check (length(trim(entity_key)) > 0),
  check ((voided_at is null and void_reason is null) or (voided_at is not null))
);

create index if not exists idx_scoring_runs_scope on public.scoring_runs(scope_type, match_id, competition_id);
create index if not exists idx_scoring_runs_status on public.scoring_runs(status, started_at desc);
create index if not exists idx_scoring_ledger_user_created on public.scoring_ledger(user_id, created_at desc);
create index if not exists idx_scoring_ledger_match_category on public.scoring_ledger(match_id, category) where match_id is not null;
create index if not exists idx_scoring_ledger_competition_category on public.scoring_ledger(competition_id, category) where competition_id is not null;
create index if not exists idx_scoring_ledger_run on public.scoring_ledger(scoring_run_id) where scoring_run_id is not null;

create unique index if not exists scoring_ledger_active_entity_unique
  on public.scoring_ledger(user_id, category, entity_key)
  where voided_at is null;

alter table public.scoring_runs enable row level security;
alter table public.scoring_ledger enable row level security;

-- No public/authenticated policies are created yet: normal users cannot insert, update,
-- delete, or read ledger internals until server/admin scoring tools are introduced.

comment on table public.scoring_runs is 'Future scoring execution audit records. Foundation only; not connected to scoring yet.';
comment on table public.scoring_ledger is 'Future idempotent points ledger. Foundation only; not connected to profile points or leaderboards yet.';
comment on index public.scoring_ledger_active_entity_unique is 'Idempotency guard for active ledger rows keyed by user, category, and entity key.';

notify pgrst, 'reload schema';
