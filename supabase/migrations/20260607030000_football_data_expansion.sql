-- Football data expansion: stadiums, players, referees, match officials,
-- lineups, events, stats, provider mappings, sync logs.

-- ============================================================
-- STADIUMS
-- ============================================================
create table if not exists public.stadiums (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  country_code text not null references public.countries(code),
  capacity integer,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.stadiums enable row level security;
drop policy if exists stadiums_read_all on public.stadiums;
create policy stadiums_read_all on public.stadiums for select using (true);

drop trigger if exists stadiums_updated_at on public.stadiums;
create trigger stadiums_updated_at
before update on public.stadiums
for each row execute function public.update_updated_at_column();

-- Add stadium_id to matches
alter table public.matches
  add column if not exists stadium_id uuid references public.stadiums(id),
  add column if not exists home_score integer,
  add column if not exists away_score integer;

-- ============================================================
-- PLAYERS
-- ============================================================
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  short_name text,
  nationality text not null references public.countries(code),
  date_of_birth date,
  position text check (position in ('goalkeeper', 'defender', 'midfielder', 'forward')),
  shirt_number integer,
  team text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.players enable row level security;
drop policy if exists players_read_all on public.players;
create policy players_read_all on public.players for select using (true);

drop trigger if exists players_updated_at on public.players;
create trigger players_updated_at
before update on public.players
for each row execute function public.update_updated_at_column();

-- ============================================================
-- REFEREES
-- ============================================================
create table if not exists public.referees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  nationality text not null references public.countries(code),
  role text not null default 'main' check (role in ('main', 'assistant', 'fourth', 'var')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.referees enable row level security;
drop policy if exists referees_read_all on public.referees;
create policy referees_read_all on public.referees for select using (true);

drop trigger if exists referees_updated_at on public.referees;
create trigger referees_updated_at
before update on public.referees
for each row execute function public.update_updated_at_column();

-- ============================================================
-- MATCH OFFICIALS (many-to-many: match <-> referee)
-- ============================================================
create table if not exists public.match_officials (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  referee_id uuid not null references public.referees(id) on delete cascade,
  role text not null check (role in ('main', 'assistant_1', 'assistant_2', 'fourth', 'var')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (match_id, role)
);

alter table public.match_officials enable row level security;
drop policy if exists match_officials_read_all on public.match_officials;
create policy match_officials_read_all on public.match_officials for select using (true);

-- ============================================================
-- MATCH LINEUPS
-- ============================================================
create table if not exists public.match_lineups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team text not null,
  is_starter boolean not null default true,
  position text,
  shirt_number integer,
  created_at timestamptz not null default timezone('utc', now()),
  unique (match_id, player_id)
);

alter table public.match_lineups enable row level security;
drop policy if exists match_lineups_read_all on public.match_lineups;
create policy match_lineups_read_all on public.match_lineups for select using (true);

-- ============================================================
-- MATCH EVENTS (goals, cards, subs, etc.)
-- ============================================================
create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  event_type text not null check (event_type in ('goal', 'own_goal', 'penalty_goal', 'penalty_miss', 'yellow_card', 'red_card', 'substitution', 'var_decision')),
  minute integer not null check (minute >= 0),
  added_time integer,
  player_id uuid references public.players(id),
  secondary_player_id uuid references public.players(id),
  team text not null,
  detail text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.match_events enable row level security;
drop policy if exists match_events_read_all on public.match_events;
create policy match_events_read_all on public.match_events for select using (true);

-- ============================================================
-- MATCH STATS
-- ============================================================
create table if not exists public.match_stats (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team text not null,
  possession numeric(5,2),
  shots integer,
  shots_on_target integer,
  corners integer,
  fouls integer,
  offsides integer,
  passes integer,
  pass_accuracy numeric(5,2),
  created_at timestamptz not null default timezone('utc', now()),
  unique (match_id, team)
);

alter table public.match_stats enable row level security;
drop policy if exists match_stats_read_all on public.match_stats;
create policy match_stats_read_all on public.match_stats for select using (true);

-- ============================================================
-- EXTERNAL PROVIDER MAPPINGS
-- ============================================================
create table if not exists public.external_provider_mappings (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('match', 'player', 'team', 'competition', 'stadium', 'referee')),
  internal_id uuid not null,
  provider text not null,
  external_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (entity_type, provider, external_id)
);

alter table public.external_provider_mappings enable row level security;
drop policy if exists ext_mappings_read_all on public.external_provider_mappings;
create policy ext_mappings_read_all on public.external_provider_mappings for select using (true);

-- ============================================================
-- DATA SYNC LOGS
-- ============================================================
create table if not exists public.data_sync_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  sync_type text not null check (sync_type in ('matches', 'lineups', 'events', 'stats', 'scores')),
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  records_synced integer not null default 0,
  error_message text,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

alter table public.data_sync_logs enable row level security;
drop policy if exists sync_logs_read_all on public.data_sync_logs;
create policy sync_logs_read_all on public.data_sync_logs for select using (true);
