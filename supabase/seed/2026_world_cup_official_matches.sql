-- 2026_world_cup_official_matches.sql
-- Predict26: official FIFA World Cup 2026 group-stage match seed.
--
-- Primary source: FIFA, "World Cup 2026 | Match schedule, fixtures & stadiums"
--   https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/match-schedule-fixtures-results-teams-stadiums
-- Cross-check sources used while preparing this seed:
--   FourFourTwo, "World Cup 2026 fixtures in full: The complete schedule" (updated 2026-06-05)
--   https://www.fourfourtwo.com/competition/world-cup-2026-fixtures-and-results
--   Sports Mole, fixture list marked as sourced from FIFA.com, for BST/UTC cross-checks.
--   FOX Sports team schedule pages (May 2026) for venue/time spot checks, e.g. Morocco schedule.
--   FIFA Collect / reputable ticket schedule pages were used only to confirm official match-number ordering.
--
-- Import scope: 72 group-stage matches only.
-- Knockout fixtures (matches 73-104) are intentionally not inserted here because the
-- current schema has no public.teams table, stores team/country codes directly on
-- public.matches, and public.countries represents real countries used by user profiles.
-- Adding placeholder teams such as "Winner Group A" would either pollute countries
-- or break schemas with country-code foreign keys / short legacy code columns.
--
-- Kickoff handling: local kickoff times from FIFA were converted to UTC timestamptz
-- with IANA time zones for the host city (Mexico City/Monterrey, America/* US zones,
-- Toronto, Vancouver). All values below are stored as explicit +00 timestamps.
--
-- Safety / idempotency:
-- - Upserts by official match_number when that column exists; otherwise by exact
--   teams + kickoff as a fallback for older/simple schemas.
-- - Does not delete matches or predictions.
-- - Does not overwrite finished/scored/live matches.
-- - Does not change an existing match row if it already has predictions.
-- - Adds external_provider_mappings rows with stable IDs wc2026_match_001..072
--   when the mapping table exists.
--
-- Rollback instructions (never deletes predictions):
--   begin;
--   delete from public.external_provider_mappings
--   where provider = 'fifa' and entity_type = 'match' and external_id like 'wc2026_match_%';
--   delete from public.matches m
--   where m.match_number between 1 and 72
--     and not exists (select 1 from public.predictions p where p.match_id = m.id);
--   commit;

begin;

-- Ensure the competition exists for schemas with public.competitions.
do $$
declare
  has_year boolean;
  has_hosts boolean;
  has_dates boolean;
begin
  if to_regclass('public.competitions') is null then
    return;
  end if;

  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'competitions' and column_name = 'year') into has_year;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'competitions' and column_name = 'host_country_codes') into has_hosts;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'competitions' and column_name = 'starts_at') into has_dates;

  execute format(
    'insert into public.competitions (slug, name, is_active%s%s%s)
     values ($1, $2, true%s%s%s)
     on conflict (slug) do update set name = excluded.name, is_active = true%s%s%s',
    case when has_year then ', year' else '' end,
    case when has_hosts then ', host_country_codes' else '' end,
    case when has_dates then ', starts_at, ends_at' else '' end,
    case when has_year then ', 2026' else '' end,
    case when has_hosts then ', ARRAY[''USA'', ''CAN'', ''MEX'']' else '' end,
    case when has_dates then ', ''2026-06-11''::date, ''2026-07-19''::date' else '' end,
    case when has_year then ', year = excluded.year' else '' end,
    case when has_hosts then ', host_country_codes = excluded.host_country_codes' else '' end,
    case when has_dates then ', starts_at = excluded.starts_at, ends_at = excluded.ends_at' else '' end
  ) using 'world-cup-2026', 'FIFA World Cup 2026';
end $$;

-- Ensure real group-stage countries exist when public.countries exists.
do $$
declare
  country_code_max_length integer;
  has_confederation boolean;
  has_is_active boolean;
begin
  if to_regclass('public.countries') is null then
    return;
  end if;

  select character_maximum_length into country_code_max_length
  from information_schema.columns
  where table_schema = 'public' and table_name = 'countries' and column_name = 'code';

  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'countries' and column_name = 'confederation') into has_confederation;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'countries' and column_name = 'is_active') into has_is_active;

  create temp table if not exists tmp_wc2026_countries (
    code text,
    alpha2 text,
    name text,
    flag_emoji text,
    confederation text
  ) on commit drop;
  truncate tmp_wc2026_countries;

  insert into tmp_wc2026_countries (code, alpha2, name, flag_emoji, confederation) values
    ('MEX', 'MX', 'Mexico', '🇲🇽', 'CONCACAF'),
    ('RSA', 'ZA', 'South Africa', '🇿🇦', 'CAF'),
    ('KOR', 'KR', 'South Korea', '🇰🇷', 'AFC'),
    ('CZE', 'CZ', 'Czechia', '🇨🇿', 'UEFA'),
    ('CAN', 'CA', 'Canada', '🇨🇦', 'CONCACAF'),
    ('BIH', 'BA', 'Bosnia and Herzegovina', '🇧🇦', 'UEFA'),
    ('QAT', 'QA', 'Qatar', '🇶🇦', 'AFC'),
    ('SUI', 'CH', 'Switzerland', '🇨🇭', 'UEFA'),
    ('BRA', 'BR', 'Brazil', '🇧🇷', 'CONMEBOL'),
    ('MAR', 'MA', 'Morocco', '🇲🇦', 'CAF'),
    ('HAI', 'HT', 'Haiti', '🇭🇹', 'CONCACAF'),
    ('SCO', 'SC', 'Scotland', '🏴', 'UEFA'),
    ('USA', 'US', 'United States', '🇺🇸', 'CONCACAF'),
    ('PAR', 'PY', 'Paraguay', '🇵🇾', 'CONMEBOL'),
    ('AUS', 'AU', 'Australia', '🇦🇺', 'AFC'),
    ('TUR', 'TR', 'Türkiye', '🇹🇷', 'UEFA'),
    ('GER', 'DE', 'Germany', '🇩🇪', 'UEFA'),
    ('CUW', 'CW', 'Curaçao', '🇨🇼', 'CONCACAF'),
    ('CIV', 'CI', 'Côte d''Ivoire', '🇨🇮', 'CAF'),
    ('ECU', 'EC', 'Ecuador', '🇪🇨', 'CONMEBOL'),
    ('NED', 'NL', 'Netherlands', '🇳🇱', 'UEFA'),
    ('JPN', 'JP', 'Japan', '🇯🇵', 'AFC'),
    ('SWE', 'SE', 'Sweden', '🇸🇪', 'UEFA'),
    ('TUN', 'TN', 'Tunisia', '🇹🇳', 'CAF'),
    ('BEL', 'BE', 'Belgium', '🇧🇪', 'UEFA'),
    ('IRN', 'IR', 'Iran', '🇮🇷', 'AFC'),
    ('NZL', 'NZ', 'New Zealand', '🇳🇿', 'OFC'),
    ('EGY', 'EG', 'Egypt', '🇪🇬', 'CAF'),
    ('ESP', 'ES', 'Spain', '🇪🇸', 'UEFA'),
    ('CPV', 'CV', 'Cabo Verde', '🇨🇻', 'CAF'),
    ('KSA', 'SA', 'Saudi Arabia', '🇸🇦', 'AFC'),
    ('URU', 'UY', 'Uruguay', '🇺🇾', 'CONMEBOL'),
    ('FRA', 'FR', 'France', '🇫🇷', 'UEFA'),
    ('SEN', 'SN', 'Senegal', '🇸🇳', 'CAF'),
    ('IRQ', 'IQ', 'Iraq', '🇮🇶', 'AFC'),
    ('NOR', 'NO', 'Norway', '🇳🇴', 'UEFA'),
    ('ARG', 'AR', 'Argentina', '🇦🇷', 'CONMEBOL'),
    ('ALG', 'DZ', 'Algeria', '🇩🇿', 'CAF'),
    ('AUT', 'AT', 'Austria', '🇦🇹', 'UEFA'),
    ('JOR', 'JO', 'Jordan', '🇯🇴', 'AFC'),
    ('POR', 'PT', 'Portugal', '🇵🇹', 'UEFA'),
    ('UZ', 'UZ', 'Uzbekistan', '🇺🇿', 'AFC'),
    ('COL', 'CO', 'Colombia', '🇨🇴', 'CONMEBOL'),
    ('COD', 'CD', 'DR Congo', '🇨🇩', 'CAF'),
    ('ENG', 'EN', 'England', '🏴', 'UEFA'),
    ('CRO', 'HR', 'Croatia', '🇭🇷', 'UEFA'),
    ('GHA', 'GH', 'Ghana', '🇬🇭', 'CAF'),
    ('PAN', 'PA', 'Panama', '🇵🇦', 'CONCACAF');

  if coalesce(country_code_max_length, 3) <= 2 then
    if has_confederation and has_is_active then
      insert into public.countries (code, name, flag_emoji, confederation, is_active)
      select alpha2, name, flag_emoji, confederation, true from tmp_wc2026_countries t
      where not exists (select 1 from public.countries c where c.name = t.name and c.code <> t.alpha2)
      on conflict (code) do update set name = excluded.name, flag_emoji = excluded.flag_emoji, confederation = excluded.confederation, is_active = true;
    elsif has_confederation then
      insert into public.countries (code, name, flag_emoji, confederation)
      select alpha2, name, flag_emoji, confederation from tmp_wc2026_countries t
      where not exists (select 1 from public.countries c where c.name = t.name and c.code <> t.alpha2)
      on conflict (code) do update set name = excluded.name, flag_emoji = excluded.flag_emoji, confederation = excluded.confederation;
    elsif has_is_active then
      insert into public.countries (code, name, flag_emoji, is_active)
      select alpha2, name, flag_emoji, true from tmp_wc2026_countries t
      where not exists (select 1 from public.countries c where c.name = t.name and c.code <> t.alpha2)
      on conflict (code) do update set name = excluded.name, flag_emoji = excluded.flag_emoji, is_active = true;
    else
      insert into public.countries (code, name, flag_emoji)
      select alpha2, name, flag_emoji from tmp_wc2026_countries t
      where not exists (select 1 from public.countries c where c.name = t.name and c.code <> t.alpha2)
      on conflict (code) do update set name = excluded.name, flag_emoji = excluded.flag_emoji;
    end if;
  else
    if has_confederation and has_is_active then
      insert into public.countries (code, name, flag_emoji, confederation, is_active)
      select code, name, flag_emoji, confederation, true from tmp_wc2026_countries t
      where not exists (select 1 from public.countries c where c.name = t.name and c.code <> t.code)
      on conflict (code) do update set name = excluded.name, flag_emoji = excluded.flag_emoji, confederation = excluded.confederation, is_active = true;
    elsif has_confederation then
      insert into public.countries (code, name, flag_emoji, confederation)
      select code, name, flag_emoji, confederation from tmp_wc2026_countries t
      where not exists (select 1 from public.countries c where c.name = t.name and c.code <> t.code)
      on conflict (code) do update set name = excluded.name, flag_emoji = excluded.flag_emoji, confederation = excluded.confederation;
    elsif has_is_active then
      insert into public.countries (code, name, flag_emoji, is_active)
      select code, name, flag_emoji, true from tmp_wc2026_countries t
      where not exists (select 1 from public.countries c where c.name = t.name and c.code <> t.code)
      on conflict (code) do update set name = excluded.name, flag_emoji = excluded.flag_emoji, is_active = true;
    else
      insert into public.countries (code, name, flag_emoji)
      select code, name, flag_emoji from tmp_wc2026_countries t
      where not exists (select 1 from public.countries c where c.name = t.name and c.code <> t.code)
      on conflict (code) do update set name = excluded.name, flag_emoji = excluded.flag_emoji;
    end if;
  end if;
end $$;

do $$
declare
  has_competition_id boolean;
  has_match_number boolean;
  has_legacy_team_codes boolean;
  has_home_team_names boolean;
  has_modern_country_codes boolean;
  has_stage boolean;
  has_group_name boolean;
  has_venue boolean;
  has_city boolean;
  has_points_multiplier boolean;
  has_scores boolean;
  has_external_mappings boolean;
  legacy_team_code_max_length integer;
  modern_country_code_max_length integer;
  v_competition_id uuid;
  v_match_id uuid;
  v_prediction_count integer;
  v_status text;
  match_record record;
  home_match_code text;
  away_match_code text;
  home_country_code text;
  away_country_code text;
  status_literal text;
begin
  if to_regclass('public.matches') is null then
    raise notice 'Skipping World Cup 2026 seed because public.matches does not exist.';
    return;
  end if;

  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'matches' and column_name = 'competition_id') into has_competition_id;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'matches' and column_name = 'match_number') into has_match_number;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'matches' and column_name = 'home_team_code') into has_legacy_team_codes;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'matches' and column_name = 'home_team_name') into has_home_team_names;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'matches' and column_name = 'home_country_code') into has_modern_country_codes;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'matches' and column_name = 'stage') into has_stage;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'matches' and column_name = 'group_name') into has_group_name;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'matches' and column_name = 'venue') into has_venue;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'matches' and column_name = 'city') into has_city;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'matches' and column_name = 'points_multiplier') into has_points_multiplier;
  select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'matches' and column_name = 'home_score') into has_scores;
  select to_regclass('public.external_provider_mappings') is not null into has_external_mappings;

  select character_maximum_length into legacy_team_code_max_length
  from information_schema.columns
  where table_schema = 'public' and table_name = 'matches' and column_name = 'home_team_code';

  select character_maximum_length into modern_country_code_max_length
  from information_schema.columns
  where table_schema = 'public' and table_name = 'matches' and column_name = 'home_country_code';

  if has_competition_id then
    select id into v_competition_id from public.competitions where slug = 'world-cup-2026';
  end if;

  create temp table if not exists tmp_wc2026_matches (
    match_number integer,
    external_key text,
    home_alpha2 text,
    home_code text,
    home_name text,
    away_alpha2 text,
    away_code text,
    away_name text,
    kickoff_at timestamptz,
    stage text,
    group_name text,
    venue text,
    city text
  ) on commit drop;
  truncate tmp_wc2026_matches;

  insert into tmp_wc2026_matches (
    match_number, external_key, home_alpha2, home_code, home_name,
    away_alpha2, away_code, away_name, kickoff_at, stage, group_name, venue, city
  ) values
    (1, 'wc2026_match_001', 'MX', 'MEX', 'Mexico', 'ZA', 'RSA', 'South Africa', '2026-06-11 19:00:00+00'::timestamptz, 'group', 'A', 'Estadio Azteca', 'Mexico City'),
    (2, 'wc2026_match_002', 'KR', 'KOR', 'South Korea', 'CZ', 'CZE', 'Czechia', '2026-06-12 02:00:00+00'::timestamptz, 'group', 'A', 'Estadio Akron', 'Zapopan'),
    (3, 'wc2026_match_003', 'CA', 'CAN', 'Canada', 'BA', 'BIH', 'Bosnia and Herzegovina', '2026-06-12 19:00:00+00'::timestamptz, 'group', 'B', 'BMO Field', 'Toronto'),
    (4, 'wc2026_match_004', 'US', 'USA', 'United States', 'PY', 'PAR', 'Paraguay', '2026-06-13 01:00:00+00'::timestamptz, 'group', 'D', 'SoFi Stadium', 'Inglewood'),
    (8, 'wc2026_match_008', 'QA', 'QAT', 'Qatar', 'CH', 'SUI', 'Switzerland', '2026-06-13 19:00:00+00'::timestamptz, 'group', 'B', 'Levi''s Stadium', 'Santa Clara'),
    (7, 'wc2026_match_007', 'BR', 'BRA', 'Brazil', 'MA', 'MAR', 'Morocco', '2026-06-13 22:00:00+00'::timestamptz, 'group', 'C', 'MetLife Stadium', 'East Rutherford'),
    (5, 'wc2026_match_005', 'HT', 'HAI', 'Haiti', 'SC', 'SCO', 'Scotland', '2026-06-14 01:00:00+00'::timestamptz, 'group', 'C', 'Gillette Stadium', 'Foxborough'),
    (6, 'wc2026_match_006', 'AU', 'AUS', 'Australia', 'TR', 'TUR', 'Türkiye', '2026-06-14 04:00:00+00'::timestamptz, 'group', 'D', 'BC Place', 'Vancouver'),
    (10, 'wc2026_match_010', 'DE', 'GER', 'Germany', 'CW', 'CUW', 'Curaçao', '2026-06-14 17:00:00+00'::timestamptz, 'group', 'E', 'NRG Stadium', 'Houston'),
    (11, 'wc2026_match_011', 'NL', 'NED', 'Netherlands', 'JP', 'JPN', 'Japan', '2026-06-14 20:00:00+00'::timestamptz, 'group', 'F', 'AT&T Stadium', 'Arlington'),
    (9, 'wc2026_match_009', 'CI', 'CIV', 'Côte d''Ivoire', 'EC', 'ECU', 'Ecuador', '2026-06-14 23:00:00+00'::timestamptz, 'group', 'E', 'Lincoln Financial Field', 'Philadelphia'),
    (12, 'wc2026_match_012', 'SE', 'SWE', 'Sweden', 'TN', 'TUN', 'Tunisia', '2026-06-15 02:00:00+00'::timestamptz, 'group', 'F', 'Estadio BBVA', 'Guadalupe'),
    (14, 'wc2026_match_014', 'ES', 'ESP', 'Spain', 'CV', 'CPV', 'Cabo Verde', '2026-06-15 16:00:00+00'::timestamptz, 'group', 'H', 'Mercedes-Benz Stadium', 'Atlanta'),
    (16, 'wc2026_match_016', 'BE', 'BEL', 'Belgium', 'EG', 'EGY', 'Egypt', '2026-06-15 19:00:00+00'::timestamptz, 'group', 'G', 'Lumen Field', 'Seattle'),
    (13, 'wc2026_match_013', 'SA', 'KSA', 'Saudi Arabia', 'UY', 'URU', 'Uruguay', '2026-06-15 22:00:00+00'::timestamptz, 'group', 'H', 'Hard Rock Stadium', 'Miami Gardens'),
    (15, 'wc2026_match_015', 'IR', 'IRN', 'Iran', 'NZ', 'NZL', 'New Zealand', '2026-06-16 01:00:00+00'::timestamptz, 'group', 'G', 'SoFi Stadium', 'Inglewood'),
    (17, 'wc2026_match_017', 'FR', 'FRA', 'France', 'SN', 'SEN', 'Senegal', '2026-06-16 19:00:00+00'::timestamptz, 'group', 'I', 'MetLife Stadium', 'East Rutherford'),
    (18, 'wc2026_match_018', 'IQ', 'IRQ', 'Iraq', 'NO', 'NOR', 'Norway', '2026-06-16 22:00:00+00'::timestamptz, 'group', 'I', 'Gillette Stadium', 'Foxborough'),
    (19, 'wc2026_match_019', 'AR', 'ARG', 'Argentina', 'DZ', 'ALG', 'Algeria', '2026-06-17 01:00:00+00'::timestamptz, 'group', 'J', 'Arrowhead Stadium', 'Kansas City'),
    (20, 'wc2026_match_020', 'AT', 'AUT', 'Austria', 'JO', 'JOR', 'Jordan', '2026-06-17 04:00:00+00'::timestamptz, 'group', 'J', 'Levi''s Stadium', 'Santa Clara'),
    (21, 'wc2026_match_021', 'PT', 'POR', 'Portugal', 'CD', 'COD', 'DR Congo', '2026-06-17 17:00:00+00'::timestamptz, 'group', 'K', 'NRG Stadium', 'Houston'),
    (22, 'wc2026_match_022', 'EN', 'ENG', 'England', 'HR', 'CRO', 'Croatia', '2026-06-17 20:00:00+00'::timestamptz, 'group', 'L', 'AT&T Stadium', 'Arlington'),
    (23, 'wc2026_match_023', 'GH', 'GHA', 'Ghana', 'PA', 'PAN', 'Panama', '2026-06-17 23:00:00+00'::timestamptz, 'group', 'L', 'BMO Field', 'Toronto'),
    (24, 'wc2026_match_024', 'UZ', 'UZ', 'Uzbekistan', 'CO', 'COL', 'Colombia', '2026-06-18 02:00:00+00'::timestamptz, 'group', 'K', 'Estadio Azteca', 'Mexico City'),
    (25, 'wc2026_match_025', 'CZ', 'CZE', 'Czechia', 'ZA', 'RSA', 'South Africa', '2026-06-18 16:00:00+00'::timestamptz, 'group', 'A', 'Mercedes-Benz Stadium', 'Atlanta'),
    (26, 'wc2026_match_026', 'CH', 'SUI', 'Switzerland', 'BA', 'BIH', 'Bosnia and Herzegovina', '2026-06-18 19:00:00+00'::timestamptz, 'group', 'B', 'SoFi Stadium', 'Inglewood'),
    (27, 'wc2026_match_027', 'CA', 'CAN', 'Canada', 'QA', 'QAT', 'Qatar', '2026-06-18 22:00:00+00'::timestamptz, 'group', 'B', 'BC Place', 'Vancouver'),
    (28, 'wc2026_match_028', 'MX', 'MEX', 'Mexico', 'KR', 'KOR', 'South Korea', '2026-06-19 01:00:00+00'::timestamptz, 'group', 'A', 'Estadio Akron', 'Zapopan'),
    (29, 'wc2026_match_029', 'US', 'USA', 'United States', 'AU', 'AUS', 'Australia', '2026-06-19 19:00:00+00'::timestamptz, 'group', 'D', 'Lumen Field', 'Seattle'),
    (30, 'wc2026_match_030', 'SC', 'SCO', 'Scotland', 'MA', 'MAR', 'Morocco', '2026-06-19 22:00:00+00'::timestamptz, 'group', 'C', 'Gillette Stadium', 'Foxborough'),
    (31, 'wc2026_match_031', 'BR', 'BRA', 'Brazil', 'HT', 'HAI', 'Haiti', '2026-06-20 01:00:00+00'::timestamptz, 'group', 'C', 'Lincoln Financial Field', 'Philadelphia'),
    (32, 'wc2026_match_032', 'TR', 'TUR', 'Türkiye', 'PY', 'PAR', 'Paraguay', '2026-06-20 04:00:00+00'::timestamptz, 'group', 'D', 'Levi''s Stadium', 'Santa Clara'),
    (35, 'wc2026_match_035', 'NL', 'NED', 'Netherlands', 'SE', 'SWE', 'Sweden', '2026-06-20 17:00:00+00'::timestamptz, 'group', 'F', 'NRG Stadium', 'Houston'),
    (33, 'wc2026_match_033', 'DE', 'GER', 'Germany', 'CI', 'CIV', 'Côte d''Ivoire', '2026-06-20 20:00:00+00'::timestamptz, 'group', 'E', 'BMO Field', 'Toronto'),
    (34, 'wc2026_match_034', 'EC', 'ECU', 'Ecuador', 'CW', 'CUW', 'Curaçao', '2026-06-21 00:00:00+00'::timestamptz, 'group', 'E', 'Arrowhead Stadium', 'Kansas City'),
    (36, 'wc2026_match_036', 'TN', 'TUN', 'Tunisia', 'JP', 'JPN', 'Japan', '2026-06-21 04:00:00+00'::timestamptz, 'group', 'F', 'Estadio BBVA', 'Guadalupe'),
    (37, 'wc2026_match_037', 'ES', 'ESP', 'Spain', 'SA', 'KSA', 'Saudi Arabia', '2026-06-21 16:00:00+00'::timestamptz, 'group', 'H', 'Mercedes-Benz Stadium', 'Atlanta'),
    (38, 'wc2026_match_038', 'BE', 'BEL', 'Belgium', 'IR', 'IRN', 'Iran', '2026-06-21 19:00:00+00'::timestamptz, 'group', 'G', 'SoFi Stadium', 'Inglewood'),
    (39, 'wc2026_match_039', 'UY', 'URU', 'Uruguay', 'CV', 'CPV', 'Cabo Verde', '2026-06-21 22:00:00+00'::timestamptz, 'group', 'H', 'Hard Rock Stadium', 'Miami Gardens'),
    (40, 'wc2026_match_040', 'NZ', 'NZL', 'New Zealand', 'EG', 'EGY', 'Egypt', '2026-06-22 01:00:00+00'::timestamptz, 'group', 'G', 'BC Place', 'Vancouver'),
    (41, 'wc2026_match_041', 'AR', 'ARG', 'Argentina', 'AT', 'AUT', 'Austria', '2026-06-22 17:00:00+00'::timestamptz, 'group', 'J', 'AT&T Stadium', 'Arlington'),
    (42, 'wc2026_match_042', 'FR', 'FRA', 'France', 'IQ', 'IRQ', 'Iraq', '2026-06-22 21:00:00+00'::timestamptz, 'group', 'I', 'Lincoln Financial Field', 'Philadelphia'),
    (43, 'wc2026_match_043', 'NO', 'NOR', 'Norway', 'SN', 'SEN', 'Senegal', '2026-06-23 00:00:00+00'::timestamptz, 'group', 'I', 'MetLife Stadium', 'East Rutherford'),
    (44, 'wc2026_match_044', 'JO', 'JOR', 'Jordan', 'DZ', 'ALG', 'Algeria', '2026-06-23 03:00:00+00'::timestamptz, 'group', 'J', 'Levi''s Stadium', 'Santa Clara'),
    (45, 'wc2026_match_045', 'PT', 'POR', 'Portugal', 'UZ', 'UZ', 'Uzbekistan', '2026-06-23 17:00:00+00'::timestamptz, 'group', 'K', 'NRG Stadium', 'Houston'),
    (46, 'wc2026_match_046', 'EN', 'ENG', 'England', 'GH', 'GHA', 'Ghana', '2026-06-23 20:00:00+00'::timestamptz, 'group', 'L', 'Gillette Stadium', 'Foxborough'),
    (47, 'wc2026_match_047', 'PA', 'PAN', 'Panama', 'HR', 'CRO', 'Croatia', '2026-06-23 23:00:00+00'::timestamptz, 'group', 'L', 'BMO Field', 'Toronto'),
    (48, 'wc2026_match_048', 'CO', 'COL', 'Colombia', 'CD', 'COD', 'DR Congo', '2026-06-24 02:00:00+00'::timestamptz, 'group', 'K', 'Estadio Akron', 'Zapopan'),
    (52, 'wc2026_match_052', 'BA', 'BIH', 'Bosnia and Herzegovina', 'QA', 'QAT', 'Qatar', '2026-06-24 19:00:00+00'::timestamptz, 'group', 'B', 'Lumen Field', 'Seattle'),
    (51, 'wc2026_match_051', 'CH', 'SUI', 'Switzerland', 'CA', 'CAN', 'Canada', '2026-06-24 19:00:00+00'::timestamptz, 'group', 'B', 'BC Place', 'Vancouver'),
    (50, 'wc2026_match_050', 'MA', 'MAR', 'Morocco', 'HT', 'HAI', 'Haiti', '2026-06-24 22:00:00+00'::timestamptz, 'group', 'C', 'Mercedes-Benz Stadium', 'Atlanta'),
    (49, 'wc2026_match_049', 'SC', 'SCO', 'Scotland', 'BR', 'BRA', 'Brazil', '2026-06-24 22:00:00+00'::timestamptz, 'group', 'C', 'Hard Rock Stadium', 'Miami Gardens'),
    (54, 'wc2026_match_054', 'ZA', 'RSA', 'South Africa', 'KR', 'KOR', 'South Korea', '2026-06-25 01:00:00+00'::timestamptz, 'group', 'A', 'Estadio BBVA', 'Guadalupe'),
    (53, 'wc2026_match_053', 'CZ', 'CZE', 'Czechia', 'MX', 'MEX', 'Mexico', '2026-06-25 01:00:00+00'::timestamptz, 'group', 'A', 'Estadio Azteca', 'Mexico City'),
    (55, 'wc2026_match_055', 'CW', 'CUW', 'Curaçao', 'CI', 'CIV', 'Côte d''Ivoire', '2026-06-25 20:00:00+00'::timestamptz, 'group', 'E', 'Lincoln Financial Field', 'Philadelphia'),
    (56, 'wc2026_match_056', 'EC', 'ECU', 'Ecuador', 'DE', 'GER', 'Germany', '2026-06-25 20:00:00+00'::timestamptz, 'group', 'E', 'MetLife Stadium', 'East Rutherford'),
    (58, 'wc2026_match_058', 'TN', 'TUN', 'Tunisia', 'NL', 'NED', 'Netherlands', '2026-06-25 23:00:00+00'::timestamptz, 'group', 'F', 'Arrowhead Stadium', 'Kansas City'),
    (57, 'wc2026_match_057', 'JP', 'JPN', 'Japan', 'SE', 'SWE', 'Sweden', '2026-06-25 23:00:00+00'::timestamptz, 'group', 'F', 'AT&T Stadium', 'Arlington'),
    (59, 'wc2026_match_059', 'TR', 'TUR', 'Türkiye', 'US', 'USA', 'United States', '2026-06-26 02:00:00+00'::timestamptz, 'group', 'D', 'SoFi Stadium', 'Inglewood'),
    (60, 'wc2026_match_060', 'PY', 'PAR', 'Paraguay', 'AU', 'AUS', 'Australia', '2026-06-26 02:00:00+00'::timestamptz, 'group', 'D', 'Levi''s Stadium', 'Santa Clara'),
    (61, 'wc2026_match_061', 'NO', 'NOR', 'Norway', 'FR', 'FRA', 'France', '2026-06-26 19:00:00+00'::timestamptz, 'group', 'I', 'Gillette Stadium', 'Foxborough'),
    (62, 'wc2026_match_062', 'SN', 'SEN', 'Senegal', 'IQ', 'IRQ', 'Iraq', '2026-06-26 19:00:00+00'::timestamptz, 'group', 'I', 'BMO Field', 'Toronto'),
    (65, 'wc2026_match_065', 'CV', 'CPV', 'Cabo Verde', 'SA', 'KSA', 'Saudi Arabia', '2026-06-27 00:00:00+00'::timestamptz, 'group', 'H', 'NRG Stadium', 'Houston'),
    (66, 'wc2026_match_066', 'UY', 'URU', 'Uruguay', 'ES', 'ESP', 'Spain', '2026-06-27 00:00:00+00'::timestamptz, 'group', 'H', 'Estadio Akron', 'Zapopan'),
    (64, 'wc2026_match_064', 'NZ', 'NZL', 'New Zealand', 'BE', 'BEL', 'Belgium', '2026-06-27 03:00:00+00'::timestamptz, 'group', 'G', 'BC Place', 'Vancouver'),
    (63, 'wc2026_match_063', 'EG', 'EGY', 'Egypt', 'IR', 'IRN', 'Iran', '2026-06-27 03:00:00+00'::timestamptz, 'group', 'G', 'Lumen Field', 'Seattle'),
    (67, 'wc2026_match_067', 'PA', 'PAN', 'Panama', 'EN', 'ENG', 'England', '2026-06-27 21:00:00+00'::timestamptz, 'group', 'L', 'MetLife Stadium', 'East Rutherford'),
    (68, 'wc2026_match_068', 'HR', 'CRO', 'Croatia', 'GH', 'GHA', 'Ghana', '2026-06-27 21:00:00+00'::timestamptz, 'group', 'L', 'Lincoln Financial Field', 'Philadelphia'),
    (71, 'wc2026_match_071', 'CO', 'COL', 'Colombia', 'PT', 'POR', 'Portugal', '2026-06-27 23:30:00+00'::timestamptz, 'group', 'K', 'Hard Rock Stadium', 'Miami Gardens'),
    (72, 'wc2026_match_072', 'CD', 'COD', 'DR Congo', 'UZ', 'UZ', 'Uzbekistan', '2026-06-27 23:30:00+00'::timestamptz, 'group', 'K', 'Mercedes-Benz Stadium', 'Atlanta'),
    (69, 'wc2026_match_069', 'DZ', 'ALG', 'Algeria', 'AT', 'AUT', 'Austria', '2026-06-28 02:00:00+00'::timestamptz, 'group', 'J', 'Arrowhead Stadium', 'Kansas City'),
    (70, 'wc2026_match_070', 'JO', 'JOR', 'Jordan', 'AR', 'ARG', 'Argentina', '2026-06-28 02:00:00+00'::timestamptz, 'group', 'J', 'AT&T Stadium', 'Arlington');

  for match_record in select * from tmp_wc2026_matches order by match_number loop
    home_country_code := match_record.home_code;
    away_country_code := match_record.away_code;

    if to_regclass('public.countries') is not null then
      select code into home_country_code
      from public.countries
      where upper(code) in (match_record.home_code, match_record.home_alpha2)
         or name = match_record.home_name
      order by case
        when upper(code) = match_record.home_code then 0
        when upper(code) = match_record.home_alpha2 then 1
        else 2
      end
      limit 1;

      select code into away_country_code
      from public.countries
      where upper(code) in (match_record.away_code, match_record.away_alpha2)
         or name = match_record.away_name
      order by case
        when upper(code) = match_record.away_code then 0
        when upper(code) = match_record.away_alpha2 then 1
        else 2
      end
      limit 1;
    end if;

    home_country_code := coalesce(home_country_code, match_record.home_code);
    away_country_code := coalesce(away_country_code, match_record.away_code);
    home_match_code := case when coalesce(legacy_team_code_max_length, 3) <= 2 then match_record.home_alpha2 else home_country_code end;
    away_match_code := case when coalesce(legacy_team_code_max_length, 3) <= 2 then match_record.away_alpha2 else away_country_code end;

    -- Find existing row by official match number where possible, otherwise by exact fixture.
    if has_match_number then
      execute 'select id, status::text from public.matches where match_number = $1 limit 1'
      into v_match_id, v_status
      using match_record.match_number;
    elsif has_home_team_names then
      execute 'select id, status::text from public.matches where home_team_name = $1 and away_team_name = $2 and kickoff_at = $3 limit 1'
      into v_match_id, v_status
      using match_record.home_name, match_record.away_name, match_record.kickoff_at;
    else
      execute 'select id, status::text from public.matches where home_team = $1 and away_team = $2 and kickoff_at = $3 limit 1'
      into v_match_id, v_status
      using match_record.home_name, match_record.away_name, match_record.kickoff_at;
    end if;

    if v_match_id is not null then
      execute 'select count(*) from public.predictions where match_id = $1'
      into v_prediction_count
      using v_match_id;
    else
      v_prediction_count := 0;
    end if;

    if v_match_id is null then
      if has_legacy_team_codes then
        status_literal := case when exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'match_status') then '$6::public.match_status' else '$6' end;
        execute format(
          'insert into public.matches (%s %s home_team_code, away_team_code, home_team_name, away_team_name, kickoff_at, status %s %s %s %s %s %s)
           values (%s %s $1, $2, $3, $4, $5, %s %s %s %s %s %s %s)
           returning id',
          case when has_match_number then 'match_number,' else '' end,
          case when has_competition_id then 'competition_id,' else '' end,
          case when has_modern_country_codes then ', home_country_code, away_country_code' else '' end,
          case when has_stage then ', stage' else '' end,
          case when has_group_name then ', group_name' else '' end,
          case when has_venue then ', venue' else '' end,
          case when has_city then ', city' else '' end,
          case when has_points_multiplier then ', points_multiplier' else '' end,
          case when has_match_number then '$12,' else '' end,
          case when has_competition_id then '$13,' else '' end,
          status_literal,
          case when has_modern_country_codes then ', $7, $8' else '' end,
          case when has_stage then ', $9' || case when exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'match_stage') then '::public.match_stage' else '' end else '' end,
          case when has_group_name then ', $10' else '' end,
          case when has_venue then ', $11' else '' end,
          case when has_city then ', $14' else '' end,
          case when has_points_multiplier then ', 1.0' else '' end
        ) into v_match_id using home_match_code, away_match_code, match_record.home_name, match_record.away_name,
          match_record.kickoff_at, 'scheduled',
          case when coalesce(modern_country_code_max_length, 3) <= 2 then match_record.home_alpha2 else home_country_code end,
          case when coalesce(modern_country_code_max_length, 3) <= 2 then match_record.away_alpha2 else away_country_code end,
          match_record.stage, match_record.group_name, match_record.venue, match_record.match_number,
          v_competition_id, match_record.city;
      elsif has_modern_country_codes then
        execute format(
          'insert into public.matches (%s %s home_team, away_team, home_country_code, away_country_code, kickoff_at, status %s %s %s %s)
           values (%s %s $1, $2, $3, $4, $5, $6 %s %s %s %s)
           returning id',
          case when has_match_number then 'match_number,' else '' end,
          case when has_competition_id then 'competition_id,' else '' end,
          case when has_stage then ', stage' else '' end,
          case when has_group_name then ', group_name' else '' end,
          case when has_venue then ', venue' else '' end,
          case when has_city then ', city' else '' end,
          case when has_match_number then '$11,' else '' end,
          case when has_competition_id then '$12,' else '' end,
          case when has_stage then ', $7' || case when exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'match_stage') then '::public.match_stage' else '' end else '' end,
          case when has_group_name then ', $8' else '' end,
          case when has_venue then ', $9' else '' end,
          case when has_city then ', $10' else '' end
        ) into v_match_id using match_record.home_name, match_record.away_name,
          case when coalesce(modern_country_code_max_length, 3) <= 2 then match_record.home_alpha2 else home_country_code end,
          case when coalesce(modern_country_code_max_length, 3) <= 2 then match_record.away_alpha2 else away_country_code end,
          match_record.kickoff_at, 'scheduled', match_record.stage, match_record.group_name, match_record.venue, match_record.city,
          match_record.match_number, v_competition_id;
      else
        raise exception 'Unsupported public.matches schema: no legacy team-code columns or modern country-code columns found.';
      end if;
    elsif v_prediction_count = 0 and v_status not in ('live', 'in_progress', 'completed', 'finished') then
      -- Safe refresh: no predictions and not played/scored. Never touches scores.
      if has_legacy_team_codes then
        execute format(
          'update public.matches set home_team_code = $1, away_team_code = $2, home_team_name = $3, away_team_name = $4, kickoff_at = $5, status = ''scheduled'' %s %s %s %s %s where id = $12 %s',
          case when has_modern_country_codes then ', home_country_code = $7, away_country_code = $8' else '' end,
          case when has_stage then ', stage = $9' || case when exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'match_stage') then '::public.match_stage' else '' end else '' end,
          case when has_group_name then ', group_name = $10' else '' end,
          case when has_venue then ', venue = $11' else '' end,
          case when has_city then ', city = $13' else '' end,
          case when has_scores then 'and home_score is null and away_score is null' else '' end
        ) using home_match_code, away_match_code, match_record.home_name, match_record.away_name, match_record.kickoff_at, 'scheduled',
          case when coalesce(modern_country_code_max_length, 3) <= 2 then match_record.home_alpha2 else home_country_code end,
          case when coalesce(modern_country_code_max_length, 3) <= 2 then match_record.away_alpha2 else away_country_code end,
          match_record.stage, match_record.group_name, match_record.venue, v_match_id, match_record.city;
      end if;
    else
      raise notice 'Skipping update for match % (% vs %) because it has % predictions or protected status %.',
        match_record.match_number, match_record.home_name, match_record.away_name, v_prediction_count, v_status;
    end if;

    if has_external_mappings and v_match_id is not null then
      insert into public.external_provider_mappings (provider, entity_type, internal_id, external_id, external_payload)
      values (
        'fifa',
        'match',
        v_match_id,
        match_record.external_key,
        jsonb_build_object('match_number', match_record.match_number, 'source', 'FIFA World Cup 2026 official schedule')
      )
      on conflict (provider, entity_type, external_id) do update set
        internal_id = excluded.internal_id,
        external_payload = excluded.external_payload,
        updated_at = timezone('utc', now());
    end if;
  end loop;
end $$;

commit;

-- Validation queries (run after import):
-- 1) total imported matches
select count(*) as total_imported_matches
from public.matches
where match_number between 1 and 72;

-- 2) scheduled match count
select count(*) as scheduled_match_count
from public.matches
where match_number between 1 and 72
  and status::text = 'scheduled';

-- 3) missing kickoff count
select count(*) as missing_kickoff_count
from public.matches
where match_number between 1 and 72
  and kickoff_at is null;

-- 4) missing venue/city count
select
  count(*) filter (where venue is null or btrim(venue) = '') as missing_venue_count,
  count(*) filter (where city is null or btrim(city) = '') as missing_city_count
from public.matches
where match_number between 1 and 72;

-- 5) duplicate match_number check
select match_number, count(*) as duplicate_count
from public.matches
where match_number between 1 and 72
group by match_number
having count(*) > 1;

-- 6) dev/test teams detected
select match_number, home_team_name, away_team_name, venue, city
from public.matches
where match_number between 1 and 72
  and (
    home_team_name ilike any (array['%dev%', '%sample%', '%test%'])
    or away_team_name ilike any (array['%dev%', '%sample%', '%test%'])
    or venue ilike any (array['%dev%', '%sample%', '%test%'])
    or city ilike any (array['%dev%', '%sample%', '%test%'])
  )
order by match_number;

-- 7) matches with existing predictions affected (should be reviewed before allowing team changes)
select m.match_number, m.home_team_name, m.away_team_name, count(p.id) as prediction_count
from public.matches m
join public.predictions p on p.match_id = m.id
where m.match_number between 1 and 72
group by m.match_number, m.home_team_name, m.away_team_name
order by m.match_number;
