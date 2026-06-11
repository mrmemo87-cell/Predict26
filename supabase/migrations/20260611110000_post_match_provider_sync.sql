-- Post-match provider sync architecture for Predict26.
-- Additive-only: keeps raw/staged provider data, validates readiness, and preserves manual score/rescore paths.

create table if not exists public.provider_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  sync_type text not null check (sync_type in ('post_match', 'post_match_batch')),
  status text not null default 'started' check (status in ('started', 'success', 'partial', 'needs_review', 'failed')),
  match_id uuid references public.matches(id) on delete cascade,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  records_processed integer not null default 0,
  records_inserted integer not null default 0,
  records_updated integer not null default 0,
  error_message text,
  confidence numeric(5,2) check (confidence is null or confidence between 0 and 100),
  categories_ready text[] not null default '{}'::text[],
  categories_needing_review text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_provider_sync_runs_match_started
  on public.provider_sync_runs(match_id, started_at desc);
create index if not exists idx_provider_sync_runs_status_started
  on public.provider_sync_runs(status, started_at desc);

create table if not exists public.provider_match_mappings (
  provider text not null,
  provider_match_id text not null,
  match_id uuid not null references public.matches(id) on delete cascade,
  confidence numeric(5,2) not null default 100 check (confidence between 0 and 100),
  mapping_status text not null default 'active' check (mapping_status in ('active', 'needs_review', 'ignored')),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (provider, provider_match_id),
  unique (provider, match_id)
);

create table if not exists public.provider_team_mappings (
  provider text not null,
  provider_team_id text not null,
  competition_code text not null default 'WC2026',
  team_code text not null,
  confidence numeric(5,2) not null default 100 check (confidence between 0 and 100),
  mapping_status text not null default 'active' check (mapping_status in ('active', 'needs_review', 'ignored')),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (provider, provider_team_id),
  unique (provider, competition_code, team_code)
);

create table if not exists public.provider_player_mappings (
  provider text not null,
  provider_player_id text not null,
  competition_code text not null default 'WC2026',
  team_code text,
  player_id uuid references public.players(id) on delete set null,
  competition_team_player_id uuid references public.competition_team_players(id) on delete set null,
  confidence numeric(5,2) not null default 100 check (confidence between 0 and 100),
  mapping_status text not null default 'active' check (mapping_status in ('active', 'needs_review', 'ignored')),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (provider, provider_player_id)
);

create table if not exists public.match_provider_sync_state (
  match_id uuid primary key references public.matches(id) on delete cascade,
  provider text,
  status text not null default 'not_started' check (status in ('not_started', 'awaiting_final_data', 'final_score_scored', 'bonus_pending', 'needs_review', 'fully_scored', 'corrected_rescored')),
  exact_result_status text not null default 'unreviewed' check (exact_result_status in ('unreviewed', 'ready', 'missing', 'ambiguous', 'untrusted', 'incomplete')),
  possession_status text not null default 'unreviewed' check (possession_status in ('unreviewed', 'ready', 'missing', 'ambiguous', 'untrusted', 'incomplete')),
  goal_events_status text not null default 'unreviewed' check (goal_events_status in ('unreviewed', 'ready', 'missing', 'ambiguous', 'untrusted', 'incomplete')),
  lineup_home_status text not null default 'unreviewed' check (lineup_home_status in ('unreviewed', 'ready', 'missing', 'ambiguous', 'untrusted', 'incomplete')),
  lineup_away_status text not null default 'unreviewed' check (lineup_away_status in ('unreviewed', 'ready', 'missing', 'ambiguous', 'untrusted', 'incomplete')),
  latest_sync_run_id uuid references public.provider_sync_runs(id) on delete set null,
  latest_scoring_run_id uuid references public.scoring_runs(id) on delete set null,
  last_synced_at timestamptz,
  next_sync_after timestamptz,
  retry_count integer not null default 0,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_match_provider_sync_state_status_next
  on public.match_provider_sync_state(status, next_sync_after);

create table if not exists public.match_result_staging (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null references public.provider_sync_runs(id) on delete cascade,
  provider text not null,
  provider_match_id text not null,
  match_id uuid references public.matches(id) on delete cascade,
  status text,
  home_score integer,
  away_score integer,
  is_final boolean not null default false,
  confidence numeric(5,2) check (confidence is null or confidence between 0 and 100),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.match_event_staging (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null references public.provider_sync_runs(id) on delete cascade,
  provider text not null,
  provider_match_id text not null,
  provider_event_id text,
  provider_player_id text,
  match_id uuid references public.matches(id) on delete cascade,
  team_side text check (team_side in ('home', 'away')),
  player_id uuid references public.players(id) on delete set null,
  event_type text not null,
  minute integer,
  stoppage_minute integer,
  include_for_scorer_scoring boolean not null default false,
  mapping_status text not null default 'unreviewed',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.match_stats_staging (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null references public.provider_sync_runs(id) on delete cascade,
  provider text not null,
  provider_match_id text not null,
  match_id uuid references public.matches(id) on delete cascade,
  team_side text not null check (team_side in ('home', 'away')),
  possession_percent numeric(5,2),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.match_lineup_staging (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null references public.provider_sync_runs(id) on delete cascade,
  provider text not null,
  provider_match_id text not null,
  provider_lineup_id text,
  provider_player_id text,
  match_id uuid references public.matches(id) on delete cascade,
  team_side text not null check (team_side in ('home', 'away')),
  team_code text,
  player_id uuid references public.players(id) on delete set null,
  player_name text not null,
  shirt_number integer,
  position text,
  is_starter boolean not null default false,
  lineup_slot integer,
  mapping_status text not null default 'unreviewed',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.match_events add column if not exists source text not null default 'manual';
alter table public.match_events add column if not exists provider_event_id text;
alter table public.match_events add column if not exists raw_payload jsonb not null default '{}'::jsonb;
create unique index if not exists idx_match_events_provider_event
  on public.match_events(match_id, source, provider_event_id)
  where provider_event_id is not null;

alter table public.match_lineups add column if not exists source text not null default 'manual';
alter table public.match_lineups add column if not exists provider_lineup_id text;
alter table public.match_lineups add column if not exists raw_payload jsonb not null default '{}'::jsonb;
create unique index if not exists idx_match_lineups_provider_lineup
  on public.match_lineups(match_id, team_side, source, provider_lineup_id)
  where provider_lineup_id is not null;

alter table public.match_stats add column if not exists raw_payload jsonb not null default '{}'::jsonb;

create or replace function public.is_match_open_for_lineup_prediction(p_match_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.matches m
    where m.id = p_match_id
      and m.status::text = 'scheduled'
      and m.kickoff_at > now() + interval '120 minutes'
  );
$$;

-- Keep score/scorer/possession locks as-is, but close Starting XI picks before official lineups are public.
drop policy if exists prediction_lineups_insert_own_open_match_valid_side on public.prediction_lineups;
create policy prediction_lineups_insert_own_open_match_valid_side on public.prediction_lineups
for insert to authenticated
with check (
  auth.uid() = user_id
  and public.is_match_open_for_lineup_prediction(match_id)
  and public.is_team_code_for_match_side(match_id, team_side, team_code)
);

drop policy if exists prediction_lineups_update_own_open_match_valid_side on public.prediction_lineups;
create policy prediction_lineups_update_own_open_match_valid_side on public.prediction_lineups
for update to authenticated
using (auth.uid() = user_id and public.is_match_open_for_lineup_prediction(match_id))
with check (
  auth.uid() = user_id
  and public.is_match_open_for_lineup_prediction(match_id)
  and public.is_team_code_for_match_side(match_id, team_side, team_code)
);

drop policy if exists prediction_lineups_delete_own_open_match on public.prediction_lineups;
create policy prediction_lineups_delete_own_open_match on public.prediction_lineups
for delete to authenticated
using (auth.uid() = user_id and public.is_match_open_for_lineup_prediction(match_id));

drop policy if exists prediction_lineup_players_insert_own_open_match_valid_player on public.prediction_lineup_players;
create policy prediction_lineup_players_insert_own_open_match_valid_player on public.prediction_lineup_players
for insert to authenticated
with check (
  exists (
    select 1
    from public.prediction_lineups pl
    where pl.id = prediction_lineup_id
      and pl.user_id = auth.uid()
      and not pl.is_submitted
      and public.is_match_open_for_lineup_prediction(pl.match_id)
      and public.is_player_in_match_squad(pl.match_id, player_id, pl.team_side)
  )
);

drop policy if exists prediction_lineup_players_update_own_open_match_valid_player on public.prediction_lineup_players;
create policy prediction_lineup_players_update_own_open_match_valid_player on public.prediction_lineup_players
for update to authenticated
using (
  exists (
    select 1
    from public.prediction_lineups pl
    where pl.id = prediction_lineup_id
      and pl.user_id = auth.uid()
      and not pl.is_submitted
      and public.is_match_open_for_lineup_prediction(pl.match_id)
  )
)
with check (
  exists (
    select 1
    from public.prediction_lineups pl
    where pl.id = prediction_lineup_id
      and pl.user_id = auth.uid()
      and not pl.is_submitted
      and public.is_match_open_for_lineup_prediction(pl.match_id)
      and public.is_player_in_match_squad(pl.match_id, player_id, pl.team_side)
  )
);

drop policy if exists prediction_lineup_players_delete_own_open_match on public.prediction_lineup_players;
create policy prediction_lineup_players_delete_own_open_match on public.prediction_lineup_players
for delete to authenticated
using (
  exists (
    select 1
    from public.prediction_lineups pl
    where pl.id = prediction_lineup_id
      and pl.user_id = auth.uid()
      and not pl.is_submitted
      and public.is_match_open_for_lineup_prediction(pl.match_id)
  )
);

do $$
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'update_updated_at_column') then
    drop trigger if exists provider_match_mappings_updated_at on public.provider_match_mappings;
    create trigger provider_match_mappings_updated_at before update on public.provider_match_mappings
      for each row execute function public.update_updated_at_column();
    drop trigger if exists provider_team_mappings_updated_at on public.provider_team_mappings;
    create trigger provider_team_mappings_updated_at before update on public.provider_team_mappings
      for each row execute function public.update_updated_at_column();
    drop trigger if exists provider_player_mappings_updated_at on public.provider_player_mappings;
    create trigger provider_player_mappings_updated_at before update on public.provider_player_mappings
      for each row execute function public.update_updated_at_column();
    drop trigger if exists match_provider_sync_state_updated_at on public.match_provider_sync_state;
    create trigger match_provider_sync_state_updated_at before update on public.match_provider_sync_state
      for each row execute function public.update_updated_at_column();
  end if;
end $$;

alter table public.provider_sync_runs enable row level security;
alter table public.provider_match_mappings enable row level security;
alter table public.provider_team_mappings enable row level security;
alter table public.provider_player_mappings enable row level security;
alter table public.match_provider_sync_state enable row level security;
alter table public.match_result_staging enable row level security;
alter table public.match_event_staging enable row level security;
alter table public.match_stats_staging enable row level security;
alter table public.match_lineup_staging enable row level security;

-- No public policies: provider sync/staging rows are server-side admin audit data.

grant execute on function public.is_match_open_for_lineup_prediction(uuid) to anon, authenticated;

comment on table public.provider_sync_runs is 'Audit log for post-match provider imports; no live polling required.';
comment on table public.match_provider_sync_state is 'Per-match post-match sync/readiness status used by admin match control.';
comment on function public.is_match_open_for_lineup_prediction(uuid) is 'Starting XI predictions lock 120 minutes before kickoff by default.';
