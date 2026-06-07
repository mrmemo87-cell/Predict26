-- Football data expansion for stadiums, squads, officials, match details, and sync observability.
-- This migration is additive and keeps all provider/API integration server-side.

create extension if not exists pgcrypto;

-- Keep both historical status naming schemes usable while existing pages migrate.
do $$
begin
  if exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'match_status') then
    alter type public.match_status add value if not exists 'in_progress';
    alter type public.match_status add value if not exists 'postponed';
  end if;
end $$;


-- If matches.status is text in a fresh Predict26 schema, allow all supported admin/provider statuses.
do $$
declare
  constraint_name text;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matches'
      and column_name = 'status'
      and data_type = 'text'
  ) then
    for constraint_name in
      select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'matches'
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%status%'
    loop
      execute format('alter table public.matches drop constraint if exists %I', constraint_name);
    end loop;

    alter table public.matches
      add constraint matches_status_allowed
      check (status::text in ('scheduled', 'upcoming', 'live', 'in_progress', 'completed', 'postponed', 'cancelled'));
  end if;
end $$;

alter table public.matches
  add column if not exists home_country_code text,
  add column if not exists away_country_code text;

-- Keep existing score constraints compatible with added in-progress/postponed statuses.
do $$
declare
  constraint_name text;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matches'
      and column_name = 'home_score'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matches'
      and column_name = 'away_score'
  ) then
    for constraint_name in
      select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'matches'
        and c.contype = 'c'
        and (
          pg_get_constraintdef(c.oid) ilike '%home_score%'
          or pg_get_constraintdef(c.oid) ilike '%away_score%'
        )
    loop
      execute format('alter table public.matches drop constraint if exists %I', constraint_name);
    end loop;

    alter table public.matches
      add constraint matches_score_status_check
      check (
        (status::text in ('scheduled', 'cancelled', 'postponed') and home_score is null and away_score is null)
        or (status::text in ('live', 'in_progress', 'completed') and home_score is not null and away_score is not null)
      );
  end if;
end $$;

create table if not exists public.stadiums (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  country_code text,
  capacity integer check (capacity is null or capacity > 0),
  latitude numeric(9,6),
  longitude numeric(9,6),
  timezone text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (name, city)
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  first_name text,
  last_name text,
  country_code text,
  team_name text,
  position text,
  shirt_number integer check (shirt_number is null or shirt_number between 1 and 99),
  date_of_birth date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.referees (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  country_code text,
  role text not null default 'referee',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (display_name, country_code, role)
);

alter table public.matches
  add column if not exists stadium_id uuid references public.stadiums(id) on delete set null;

create table if not exists public.match_officials (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  referee_id uuid not null references public.referees(id) on delete restrict,
  role text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (match_id, role, referee_id)
);

create table if not exists public.match_lineups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  team_side text not null check (team_side in ('home', 'away')),
  team_code text,
  player_name text not null,
  shirt_number integer check (shirt_number is null or shirt_number between 1 and 99),
  position text,
  is_starter boolean not null default false,
  is_captain boolean not null default false,
  lineup_slot integer check (lineup_slot is null or lineup_slot > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (match_id, team_side, player_id),
  unique (match_id, team_side, shirt_number)
);

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_side text check (team_side in ('home', 'away')),
  player_id uuid references public.players(id) on delete set null,
  related_player_id uuid references public.players(id) on delete set null,
  event_type text not null,
  minute integer check (minute is null or minute >= 0),
  stoppage_minute integer check (stoppage_minute is null or stoppage_minute >= 0),
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.match_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_side text not null check (team_side in ('home', 'away')),
  possession_percent numeric(5,2) check (possession_percent is null or possession_percent between 0 and 100),
  shots integer check (shots is null or shots >= 0),
  shots_on_target integer check (shots_on_target is null or shots_on_target >= 0),
  corners integer check (corners is null or corners >= 0),
  fouls integer check (fouls is null or fouls >= 0),
  yellow_cards integer check (yellow_cards is null or yellow_cards >= 0),
  red_cards integer check (red_cards is null or red_cards >= 0),
  offsides integer check (offsides is null or offsides >= 0),
  passes integer check (passes is null or passes >= 0),
  pass_accuracy_percent numeric(5,2) check (pass_accuracy_percent is null or pass_accuracy_percent between 0 and 100),
  source text not null default 'manual',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (match_id, team_side, source)
);

create table if not exists public.external_provider_mappings (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  entity_type text not null check (entity_type in ('competition', 'match', 'stadium', 'team', 'player', 'referee')),
  internal_id uuid,
  internal_key text,
  external_id text not null,
  external_payload jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (provider, entity_type, external_id),
  unique (provider, entity_type, internal_id)
);

create table if not exists public.data_sync_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  sync_type text not null,
  status text not null check (status in ('started', 'success', 'failed', 'skipped')),
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  records_processed integer not null default 0 check (records_processed >= 0),
  records_inserted integer not null default 0 check (records_inserted >= 0),
  records_updated integer not null default 0 check (records_updated >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.wrong_match_reports (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'resolved')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_matches_stadium_id on public.matches(stadium_id);
create index if not exists idx_players_country_code on public.players(country_code);
create index if not exists idx_players_team_name on public.players(team_name);
create index if not exists idx_referees_country_code on public.referees(country_code);
create index if not exists idx_match_officials_match_id on public.match_officials(match_id);
create index if not exists idx_match_lineups_match_id on public.match_lineups(match_id);
create index if not exists idx_match_events_match_id_minute on public.match_events(match_id, minute, stoppage_minute);
create index if not exists idx_match_stats_match_id on public.match_stats(match_id);
create index if not exists idx_external_provider_mappings_lookup on public.external_provider_mappings(provider, entity_type, internal_id);
create index if not exists idx_data_sync_logs_provider_started on public.data_sync_logs(provider, started_at desc);
create index if not exists idx_wrong_match_reports_status on public.wrong_match_reports(status, created_at desc);

-- Wire new tables into the shared updated_at trigger when available.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'update_updated_at_column') then
    foreach table_name in array array[
      'stadiums', 'players', 'referees', 'match_officials', 'match_lineups',
      'match_events', 'match_stats', 'external_provider_mappings', 'wrong_match_reports'
    ] loop
      execute format('drop trigger if exists %I on public.%I', table_name || '_updated_at', table_name);
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.update_updated_at_column()',
        table_name || '_updated_at',
        table_name
      );
    end loop;
  end if;
end $$;

alter table public.stadiums enable row level security;
alter table public.players enable row level security;
alter table public.referees enable row level security;
alter table public.match_officials enable row level security;
alter table public.match_lineups enable row level security;
alter table public.match_events enable row level security;
alter table public.match_stats enable row level security;
alter table public.external_provider_mappings enable row level security;
alter table public.data_sync_logs enable row level security;
alter table public.wrong_match_reports enable row level security;

drop policy if exists stadiums_read_all on public.stadiums;
create policy stadiums_read_all on public.stadiums for select using (true);

drop policy if exists players_read_all on public.players;
create policy players_read_all on public.players for select using (true);

drop policy if exists referees_read_all on public.referees;
create policy referees_read_all on public.referees for select using (true);

drop policy if exists match_officials_read_all on public.match_officials;
create policy match_officials_read_all on public.match_officials for select using (true);

drop policy if exists match_lineups_read_all on public.match_lineups;
create policy match_lineups_read_all on public.match_lineups for select using (true);

drop policy if exists match_events_read_all on public.match_events;
create policy match_events_read_all on public.match_events for select using (true);

drop policy if exists match_stats_read_all on public.match_stats;
create policy match_stats_read_all on public.match_stats for select using (true);

drop policy if exists wrong_match_reports_insert_authenticated on public.wrong_match_reports;
create policy wrong_match_reports_insert_authenticated on public.wrong_match_reports
for insert with check (auth.uid() = reporter_id);

drop policy if exists wrong_match_reports_read_own on public.wrong_match_reports;
create policy wrong_match_reports_read_own on public.wrong_match_reports
for select using (auth.uid() = reporter_id);

comment on table public.external_provider_mappings is 'Server-side mapping table for future Sportmonks/API-Football IDs; API keys are never stored here.';
comment on table public.data_sync_logs is 'Server-side sync observability for mock and future paid football providers.';
