-- Predict26 squad import foundation.
-- Additive-only: keep staging data, add normalized squad version/team-player tables,
-- validation/import RPCs, and safe public-read RLS for normalized squad data.

create table if not exists public.wc2026_squad_imports (
  id text primary key,
  competition_code text not null,
  source_name text not null,
  source_url text not null,
  source_version text not null,
  source_pdf_sha256 text not null,
  source_status text not null,
  generated_at timestamptz not null,
  validation_status text not null
);

create table if not exists public.wc2026_squad_players_seed (
  competition_code text not null,
  team_code text not null,
  team_name text not null,
  squad_number integer not null,
  position text not null,
  player_name text not null,
  first_names text,
  last_names text,
  name_on_shirt text,
  date_of_birth date,
  date_of_birth_raw text,
  club_name text,
  club_country_code text,
  club_raw text,
  height_cm integer,
  source_name text not null,
  source_url text not null,
  source_version text not null,
  source_pdf_page integer not null,
  source_status text not null,
  last_verified_at timestamptz not null,
  primary key (competition_code, team_code, squad_number)
);

create table if not exists public.team_code_aliases (
  competition_code text not null,
  alias_code text not null,
  canonical_team_code text not null,
  source text not null default 'manual',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (competition_code, alias_code),
  check (alias_code = upper(alias_code)),
  check (canonical_team_code = upper(canonical_team_code))
);

insert into public.team_code_aliases (competition_code, alias_code, canonical_team_code, source, notes)
values
  ('WC2026', 'ALG', 'ALG', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'AR', 'ARG', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'ARG', 'ARG', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'AT', 'AUT', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'AU', 'AUS', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'AUS', 'AUS', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'AUT', 'AUT', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'BA', 'BIH', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'BE', 'BEL', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'BEL', 'BEL', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'BIH', 'BIH', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'BR', 'BRA', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'BRA', 'BRA', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'CA', 'CAN', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'CAN', 'CAN', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'CD', 'COD', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'CH', 'SUI', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'CI', 'CIV', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'CIV', 'CIV', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'CO', 'COL', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'COD', 'COD', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'COL', 'COL', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'CPV', 'CPV', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'CRO', 'CRO', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'CUW', 'CUW', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'CV', 'CPV', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'CW', 'CUW', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'CZ', 'CZE', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'CZE', 'CZE', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'DE', 'GER', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'DZ', 'ALG', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'EC', 'ECU', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'ECU', 'ECU', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'EG', 'EGY', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'EGY', 'EGY', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'EN', 'ENG', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'ENG', 'ENG', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'ES', 'ESP', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'ESP', 'ESP', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'FR', 'FRA', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'FRA', 'FRA', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'GER', 'GER', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'GH', 'GHA', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'GHA', 'GHA', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'HAI', 'HAI', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'HR', 'CRO', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'HT', 'HAI', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'IQ', 'IRQ', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'IR', 'IRN', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'IRN', 'IRN', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'IRQ', 'IRQ', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'JO', 'JOR', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'JOR', 'JOR', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'JP', 'JPN', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'JPN', 'JPN', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'KOR', 'KOR', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'KR', 'KOR', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'KSA', 'KSA', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'MA', 'MAR', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'MAR', 'MAR', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'MEX', 'MEX', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'MX', 'MEX', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'NED', 'NED', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'NL', 'NED', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'NO', 'NOR', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'NOR', 'NOR', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'NZ', 'NZL', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'NZL', 'NZL', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'PA', 'PAN', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'PAN', 'PAN', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'PAR', 'PAR', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'POR', 'POR', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'PT', 'POR', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'PY', 'PAR', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'QA', 'QAT', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'QAT', 'QAT', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'RSA', 'RSA', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'SA', 'KSA', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'SC', 'SCO', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'SCO', 'SCO', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'SE', 'SWE', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'SEN', 'SEN', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'SN', 'SEN', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'SUI', 'SUI', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'SWE', 'SWE', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'TN', 'TUN', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'TR', 'TUR', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'TUN', 'TUN', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'TUR', 'TUR', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'URU', 'URU', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'US', 'USA', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'USA', 'USA', 'official_match_seed_identity', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'UY', 'URU', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.'),
  ('WC2026', 'UZ', 'UZB', 'official_match_seed_alias', 'Official match seed uses UZ for Uzbekistan; squad staging uses UZB.'),
  ('WC2026', 'ZA', 'RSA', 'official_match_seed_alias', 'Official match seed and squad staging team-code compatibility.')
on conflict (competition_code, alias_code) do update
set
  canonical_team_code = excluded.canonical_team_code,
  source = excluded.source,
  notes = excluded.notes,
  updated_at = timezone('utc', now());

create table if not exists public.squad_import_versions (
  id uuid primary key default gen_random_uuid(),
  competition_code text not null,
  source_import_id text not null references public.wc2026_squad_imports(id) on delete restrict,
  source_name text not null,
  source_url text,
  source_version text not null,
  source_pdf_sha256 text,
  source_status text,
  status text not null default 'validated' check (status in ('staged', 'validated', 'active', 'superseded', 'rejected')),
  validation_summary jsonb not null default '{}'::jsonb,
  activated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (source_import_id)
);

alter table public.players
  add column if not exists normalized_name text,
  add column if not exists source_player_key text,
  add column if not exists active boolean not null default true;

create unique index if not exists players_source_player_key_unique
  on public.players(source_player_key)
  where source_player_key is not null;

create table if not exists public.competition_team_players (
  id uuid primary key default gen_random_uuid(),
  competition_code text not null,
  competition_id uuid references public.competitions(id) on delete set null,
  team_code text not null,
  team_code_aliases text[] not null default '{}'::text[],
  team_name text not null,
  player_id uuid not null references public.players(id) on delete restrict,
  squad_number integer not null check (squad_number between 1 and 99),
  position text not null check (position in ('GK', 'DF', 'MF', 'FW')),
  name_on_shirt text,
  club_name text,
  club_country_code text,
  height_cm integer check (height_cm is null or height_cm > 0),
  squad_import_version_id uuid not null references public.squad_import_versions(id) on delete restrict,
  valid_from timestamptz not null default timezone('utc', now()),
  valid_to timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (squad_import_version_id, team_code, squad_number),
  unique (squad_import_version_id, team_code, player_id)
);

create unique index if not exists competition_team_players_active_number_unique
  on public.competition_team_players(competition_code, team_code, squad_number)
  where is_active;

create unique index if not exists competition_team_players_active_player_unique
  on public.competition_team_players(competition_code, team_code, player_id)
  where is_active;

create index if not exists idx_competition_team_players_team_active
  on public.competition_team_players(competition_code, team_code, is_active, squad_number);

create index if not exists idx_competition_team_players_player
  on public.competition_team_players(player_id);

create or replace function public.resolve_team_code(p_competition_code text, p_team_code text)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (
      select canonical_team_code
      from public.team_code_aliases
      where competition_code = upper(trim(p_competition_code))
        and alias_code = upper(trim(p_team_code))
      limit 1
    ),
    upper(trim(p_team_code))
  );
$$;

create or replace function public.validate_wc2026_squad_staging()
returns table (check_name text, passed boolean, details jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_players integer;
  v_team_count integer;
  v_bad_team_sizes jsonb;
  v_bad_gk_counts jsonb;
  v_duplicate_numbers jsonb;
  v_bad_positions jsonb;
  v_replacement_count integer;
  v_blank_required_count integer;
  v_match_team_count integer;
  v_missing_match_squads jsonb;
  v_import_count integer;
begin
  select count(*) into v_import_count from public.wc2026_squad_imports where competition_code = 'WC2026';
  select count(*) into v_total_players from public.wc2026_squad_players_seed where competition_code = 'WC2026';
  select count(distinct team_code) into v_team_count from public.wc2026_squad_players_seed where competition_code = 'WC2026';

  return query select
    'import_metadata_present'::text,
    v_import_count > 0,
    jsonb_build_object('wc2026_import_rows', v_import_count);

  return query select
    'player_count_1248'::text,
    v_total_players = 1248,
    jsonb_build_object('actual', v_total_players, 'expected', 1248);

  return query select
    'team_count_48'::text,
    v_team_count = 48,
    jsonb_build_object('actual', v_team_count, 'expected', 48);

  select coalesce(jsonb_agg(jsonb_build_object('team_code', team_code, 'player_count', player_count) order by team_code), '[]'::jsonb)
  into v_bad_team_sizes
  from (
    select team_code, count(*)::integer as player_count
    from public.wc2026_squad_players_seed
    where competition_code = 'WC2026'
    group by team_code
    having count(*) <> 26
  ) bad_sizes;

  return query select
    'twenty_six_players_per_team'::text,
    v_bad_team_sizes = '[]'::jsonb,
    jsonb_build_object('bad_teams', v_bad_team_sizes);

  select coalesce(jsonb_agg(jsonb_build_object('team_code', team_code, 'gk_count', gk_count) order by team_code), '[]'::jsonb)
  into v_bad_gk_counts
  from (
    select team_code, count(*) filter (where position = 'GK')::integer as gk_count
    from public.wc2026_squad_players_seed
    where competition_code = 'WC2026'
    group by team_code
    having count(*) filter (where position = 'GK') < 3
  ) bad_gks;

  return query select
    'at_least_three_goalkeepers_per_team'::text,
    v_bad_gk_counts = '[]'::jsonb,
    jsonb_build_object('bad_teams', v_bad_gk_counts);

  select coalesce(jsonb_agg(jsonb_build_object('team_code', team_code, 'squad_number', squad_number, 'duplicate_count', duplicate_count) order by team_code, squad_number), '[]'::jsonb)
  into v_duplicate_numbers
  from (
    select team_code, squad_number, count(*)::integer as duplicate_count
    from public.wc2026_squad_players_seed
    where competition_code = 'WC2026'
    group by team_code, squad_number
    having count(*) > 1
  ) duplicates;

  return query select
    'no_duplicate_squad_numbers_per_team'::text,
    v_duplicate_numbers = '[]'::jsonb,
    jsonb_build_object('duplicates', v_duplicate_numbers);

  select coalesce(jsonb_agg(jsonb_build_object('team_code', team_code, 'squad_number', squad_number, 'position', position) order by team_code, squad_number), '[]'::jsonb)
  into v_bad_positions
  from public.wc2026_squad_players_seed
  where competition_code = 'WC2026'
    and position not in ('GK', 'DF', 'MF', 'FW');

  return query select
    'positions_are_supported'::text,
    v_bad_positions = '[]'::jsonb,
    jsonb_build_object('bad_positions', v_bad_positions);

  select count(*)::integer
  into v_replacement_count
  from public.wc2026_squad_players_seed
  where competition_code = 'WC2026'
    and (
      player_name like '%' || U&'\FFFD' || '%'
      or first_names like '%' || U&'\FFFD' || '%'
      or last_names like '%' || U&'\FFFD' || '%'
      or name_on_shirt like '%' || U&'\FFFD' || '%'
      or club_name like '%' || U&'\FFFD' || '%'
      or club_raw like '%' || U&'\FFFD' || '%'
    );

  return query select
    'no_unicode_replacement_characters'::text,
    v_replacement_count = 0,
    jsonb_build_object('replacement_character_rows', v_replacement_count);

  select count(*)::integer
  into v_blank_required_count
  from public.wc2026_squad_players_seed
  where competition_code = 'WC2026'
    and (
      nullif(trim(team_code), '') is null
      or nullif(trim(team_name), '') is null
      or nullif(trim(player_name), '') is null
      or squad_number is null
      or nullif(trim(position), '') is null
    );

  return query select
    'required_fields_present'::text,
    v_blank_required_count = 0,
    jsonb_build_object('blank_required_rows', v_blank_required_count);

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matches'
      and column_name in ('home_country_code', 'away_country_code', 'home_team_code', 'away_team_code')
  ) then
    with match_codes as (
      select distinct public.resolve_team_code('WC2026', code) as team_code
      from (
        select home_country_code as code from public.matches where home_country_code is not null
        union all select away_country_code from public.matches where away_country_code is not null
        union all select home_team_code from public.matches where home_team_code is not null
        union all select away_team_code from public.matches where away_team_code is not null
      ) codes
      where nullif(trim(code), '') is not null
        and upper(trim(code)) !~ '^(X|TST)'
    ), squad_codes as (
      select distinct public.resolve_team_code('WC2026', team_code) as team_code
      from public.wc2026_squad_players_seed
      where competition_code = 'WC2026'
    ), missing as (
      select m.team_code
      from match_codes m
      left join squad_codes s on s.team_code = m.team_code
      where s.team_code is null
    )
    select count(*)::integer, coalesce(jsonb_agg(team_code order by team_code), '[]'::jsonb)
    into v_match_team_count, v_missing_match_squads
    from missing;

    return query select
      'match_team_codes_have_squads'::text,
      v_match_team_count = 0,
      jsonb_build_object('missing_canonical_team_codes', v_missing_match_squads, 'aliases_applied', jsonb_build_array(jsonb_build_object('alias', 'UZ', 'canonical', 'UZB')));
  else
    return query select
      'match_team_codes_have_squads'::text,
      true,
      jsonb_build_object('skipped', 'matches team-code columns are not present in this schema');
  end if;
end;
$$;

create or replace function public.import_wc2026_squad_from_staging(
  p_source_import_id text default null,
  p_activate boolean default false
)
returns table (import_version_id uuid, players_upserted integer, squad_rows_upserted integer, activated boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.wc2026_squad_imports%rowtype;
  v_version_id uuid;
  v_validation_summary jsonb;
  v_validation_passed boolean;
  v_competition_id uuid;
  v_players_upserted integer := 0;
  v_squad_rows_upserted integer := 0;
begin
  select coalesce(bool_and(passed), false), coalesce(jsonb_object_agg(check_name, details), '{}'::jsonb)
  into v_validation_passed, v_validation_summary
  from public.validate_wc2026_squad_staging();

  if not v_validation_passed then
    raise exception 'WC2026 squad staging validation failed: %', v_validation_summary;
  end if;

  if p_source_import_id is null then
    select *
    into v_source
    from public.wc2026_squad_imports
    where competition_code = 'WC2026'
    order by generated_at desc
    limit 1;
  else
    select *
    into v_source
    from public.wc2026_squad_imports
    where id = p_source_import_id
      and competition_code = 'WC2026';
  end if;

  if not found then
    raise exception 'WC2026 squad import metadata not found for %', coalesce(p_source_import_id, '<latest>');
  end if;

  select id into v_competition_id
  from public.competitions
  where slug in ('world-cup-2026', 'wc2026', 'fifa-world-cup-2026')
     or name ilike '%World Cup%2026%'
  order by created_at asc nulls last
  limit 1;

  insert into public.squad_import_versions (
    competition_code,
    source_import_id,
    source_name,
    source_url,
    source_version,
    source_pdf_sha256,
    source_status,
    status,
    validation_summary,
    activated_at
  ) values (
    v_source.competition_code,
    v_source.id,
    v_source.source_name,
    v_source.source_url,
    v_source.source_version,
    v_source.source_pdf_sha256,
    v_source.source_status,
    case when p_activate then 'active' else 'validated' end,
    v_validation_summary,
    case when p_activate then timezone('utc', now()) else null end
  )
  on conflict (source_import_id) do update
  set
    source_name = excluded.source_name,
    source_url = excluded.source_url,
    source_version = excluded.source_version,
    source_pdf_sha256 = excluded.source_pdf_sha256,
    source_status = excluded.source_status,
    status = case when p_activate then 'active' else public.squad_import_versions.status end,
    validation_summary = excluded.validation_summary,
    activated_at = case when p_activate then timezone('utc', now()) else public.squad_import_versions.activated_at end,
    updated_at = timezone('utc', now())
  returning id into v_version_id;

  if p_activate then
    update public.squad_import_versions
    set status = 'superseded', updated_at = timezone('utc', now())
    where competition_code = 'WC2026'
      and id <> v_version_id
      and status = 'active';

    update public.competition_team_players
    set is_active = false,
        valid_to = coalesce(valid_to, timezone('utc', now())),
        updated_at = timezone('utc', now())
    where competition_code = 'WC2026'
      and squad_import_version_id <> v_version_id
      and is_active;
  end if;

  with seed as (
    select
      s.*,
      public.resolve_team_code('WC2026', s.team_code) as canonical_team_code,
      concat_ws(':', s.competition_code, s.team_code, s.squad_number::text, v_source.id) as source_player_key,
      lower(regexp_replace(trim(s.player_name), '\s+', ' ', 'g')) as normalized_player_name
    from public.wc2026_squad_players_seed s
    where s.competition_code = 'WC2026'
  ), upserted as (
    insert into public.players (
      display_name,
      first_name,
      last_name,
      country_code,
      team_name,
      position,
      shirt_number,
      date_of_birth,
      normalized_name,
      source_player_key,
      active
    )
    select
      player_name,
      first_names,
      last_names,
      canonical_team_code,
      team_name,
      position,
      squad_number,
      date_of_birth,
      normalized_player_name,
      source_player_key,
      true
    from seed
    on conflict (source_player_key) where source_player_key is not null do update
    set
      display_name = excluded.display_name,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      country_code = excluded.country_code,
      team_name = excluded.team_name,
      position = excluded.position,
      shirt_number = excluded.shirt_number,
      date_of_birth = excluded.date_of_birth,
      normalized_name = excluded.normalized_name,
      active = true,
      updated_at = timezone('utc', now())
    returning id
  )
  select count(*)::integer into v_players_upserted from upserted;

  with seed as (
    select
      s.*,
      public.resolve_team_code('WC2026', s.team_code) as canonical_team_code,
      concat_ws(':', s.competition_code, s.team_code, s.squad_number::text, v_source.id) as source_player_key,
      array_remove(array_agg(a.alias_code order by a.alias_code), null) as aliases
    from public.wc2026_squad_players_seed s
    left join public.team_code_aliases a
      on a.competition_code = s.competition_code
     and a.canonical_team_code = public.resolve_team_code('WC2026', s.team_code)
    where s.competition_code = 'WC2026'
    group by s.competition_code, s.team_code, s.team_name, s.squad_number, s.position, s.player_name,
      s.first_names, s.last_names, s.name_on_shirt, s.date_of_birth, s.date_of_birth_raw,
      s.club_name, s.club_country_code, s.club_raw, s.height_cm, s.source_name, s.source_url,
      s.source_version, s.source_pdf_page, s.source_status, s.last_verified_at
  ), upserted as (
    insert into public.competition_team_players (
      competition_code,
      competition_id,
      team_code,
      team_code_aliases,
      team_name,
      player_id,
      squad_number,
      position,
      name_on_shirt,
      club_name,
      club_country_code,
      height_cm,
      squad_import_version_id,
      valid_from,
      valid_to,
      is_active
    )
    select
      s.competition_code,
      v_competition_id,
      s.canonical_team_code,
      coalesce(s.aliases, '{}'::text[]),
      s.team_name,
      p.id,
      s.squad_number,
      s.position,
      s.name_on_shirt,
      s.club_name,
      s.club_country_code,
      s.height_cm,
      v_version_id,
      timezone('utc', now()),
      null,
      p_activate
    from seed s
    join public.players p on p.source_player_key = s.source_player_key
    on conflict (squad_import_version_id, team_code, squad_number) do update
    set
      competition_id = excluded.competition_id,
      team_code_aliases = excluded.team_code_aliases,
      team_name = excluded.team_name,
      player_id = excluded.player_id,
      position = excluded.position,
      name_on_shirt = excluded.name_on_shirt,
      club_name = excluded.club_name,
      club_country_code = excluded.club_country_code,
      height_cm = excluded.height_cm,
      valid_to = excluded.valid_to,
      is_active = excluded.is_active,
      updated_at = timezone('utc', now())
    returning id
  )
  select count(*)::integer into v_squad_rows_upserted from upserted;

  return query select v_version_id, v_players_upserted, v_squad_rows_upserted, p_activate;
end;
$$;

revoke all on function public.validate_wc2026_squad_staging() from public;
revoke all on function public.validate_wc2026_squad_staging() from anon;
revoke all on function public.validate_wc2026_squad_staging() from authenticated;
grant execute on function public.validate_wc2026_squad_staging() to service_role;

revoke all on function public.import_wc2026_squad_from_staging(text, boolean) from public;
revoke all on function public.import_wc2026_squad_from_staging(text, boolean) from anon;
revoke all on function public.import_wc2026_squad_from_staging(text, boolean) from authenticated;
grant execute on function public.import_wc2026_squad_from_staging(text, boolean) to service_role;

-- Reference resolution is safe for public reads and contains no secrets.
grant execute on function public.resolve_team_code(text, text) to anon, authenticated;

alter table public.wc2026_squad_imports enable row level security;
alter table public.wc2026_squad_players_seed enable row level security;
alter table public.team_code_aliases enable row level security;
alter table public.squad_import_versions enable row level security;
alter table public.competition_team_players enable row level security;

-- Keep raw staging protected from normal clients. Normal app reads should use normalized tables.
drop policy if exists team_code_aliases_read_all on public.team_code_aliases;
create policy team_code_aliases_read_all on public.team_code_aliases for select using (true);

drop policy if exists squad_import_versions_read_safe on public.squad_import_versions;
create policy squad_import_versions_read_safe on public.squad_import_versions
for select using (status in ('validated', 'active', 'superseded'));

drop policy if exists competition_team_players_read_all on public.competition_team_players;
create policy competition_team_players_read_all on public.competition_team_players for select using (true);

-- Preserve existing public player reads while relying on no user write policies for official data.
drop policy if exists players_read_all on public.players;
create policy players_read_all on public.players for select using (true);

-- Wire updated_at triggers when the shared trigger function exists.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'update_updated_at_column') then
    foreach table_name in array array['team_code_aliases', 'squad_import_versions', 'competition_team_players'] loop
      execute format('drop trigger if exists %I on public.%I', table_name || '_updated_at', table_name);
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.update_updated_at_column()',
        table_name || '_updated_at',
        table_name
      );
    end loop;
  end if;
end $$;

comment on table public.squad_import_versions is 'Versioned normalized squad imports derived from trusted WC2026 staging data.';
comment on table public.competition_team_players is 'Normalized competition squad membership used by app UI; historical versions remain for safe re-imports.';
comment on table public.team_code_aliases is 'Safe team-code aliases for reconciling official match seeds and squad imports, e.g. UZ to UZB.';
comment on function public.validate_wc2026_squad_staging() is 'Server-only validation report for trusted WC2026 squad staging data.';
comment on function public.import_wc2026_squad_from_staging(text, boolean) is 'Server-only import from WC2026 staging rows into normalized players and competition_team_players.';

notify pgrst, 'reload schema';
