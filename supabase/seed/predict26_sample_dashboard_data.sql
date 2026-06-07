-- Predict26 sample dashboard data for manual Supabase use only.
-- Run manually in the Supabase SQL editor or psql after migrations are applied.
-- This file intentionally does not run as part of application startup.

begin;

-- Optional opponent countries for schemas that maintain public.countries.
do $$
declare
  country_code_max_length integer;
begin
  if to_regclass('public.countries') is not null then
    select character_maximum_length into country_code_max_length
    from information_schema.columns
    where table_schema = 'public' and table_name = 'countries' and column_name = 'code';

    if coalesce(country_code_max_length, 3) <= 2 then
      insert into public.countries (code, name, flag_emoji)
      values
        ('US', 'United States', '🇺🇸'),
        ('CA', 'Canada', '🇨🇦'),
        ('MX', 'Mexico', '🇲🇽'),
        ('BR', 'Brazil', '🇧🇷'),
        ('JP', 'Japan', '🇯🇵')
      on conflict (code) do update
        set name = excluded.name,
            flag_emoji = excluded.flag_emoji;
    else
      insert into public.countries (code, name, flag_emoji)
      values
        ('USA', 'United States', '🇺🇸'),
        ('CAN', 'Canada', '🇨🇦'),
        ('MEX', 'Mexico', '🇲🇽'),
        ('BRA', 'Brazil', '🇧🇷'),
        ('JPN', 'Japan', '🇯🇵')
      on conflict (code) do update
        set name = excluded.name,
            flag_emoji = excluded.flag_emoji;
    end if;
  end if;
end $$;

create temp table if not exists pg_temp.predict26_seed_matches (
  match_number integer,
  home_alpha2 text,
  home_alpha3 text,
  home_team text,
  away_alpha2 text,
  away_alpha3 text,
  away_team text,
  kickoff_at timestamptz,
  stage text,
  group_name text,
  venue text,
  city text
) on commit drop;

truncate pg_temp.predict26_seed_matches;

insert into pg_temp.predict26_seed_matches (
  match_number,
  home_alpha2,
  home_alpha3,
  home_team,
  away_alpha2,
  away_alpha3,
  away_team,
  kickoff_at,
  stage,
  group_name,
  venue,
  city
)
values
  (2601, 'KG', 'KGZ', 'Kyrgyzstan', 'US', 'USA', 'United States', '2026-06-14 22:00:00+00', 'group', 'A', 'SoFi Stadium', 'Los Angeles'),
  (2602, 'KZ', 'KAZ', 'Kazakhstan', 'CA', 'CAN', 'Canada', '2026-06-16 01:00:00+00', 'group', 'B', 'BC Place', 'Vancouver'),
  (2603, 'UZ', 'UZB', 'Uzbekistan', 'MX', 'MEX', 'Mexico', '2026-06-18 19:00:00+00', 'group', 'C', 'Estadio Akron', 'Guadalajara'),
  (2604, 'RU', 'RUS', 'Russia', 'BR', 'BRA', 'Brazil', '2026-06-21 00:00:00+00', 'group', 'D', 'AT&T Stadium', 'Dallas'),
  (2605, 'KG', 'KGZ', 'Kyrgyzstan', 'JP', 'JPN', 'Japan', '2026-06-24 20:00:00+00', 'round_of_32', null, 'MetLife Stadium', 'New York/New Jersey');

do $$
declare
  has_competition_id boolean;
  has_modern_country_codes boolean;
  has_legacy_team_codes boolean;
  has_stage boolean;
  has_venue boolean;
  has_city boolean;
  has_group_name boolean;
  has_match_number boolean;
  competition_id uuid;
  match_record record;
  resolved_home_code text;
  resolved_away_code text;
begin
  if to_regclass('public.matches') is null then
    raise notice 'Skipping sample matches because public.matches does not exist.';
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matches' and column_name = 'competition_id'
  ) into has_competition_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matches' and column_name = 'home_country_code'
  ) into has_modern_country_codes;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matches' and column_name = 'home_team_code'
  ) into has_legacy_team_codes;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matches' and column_name = 'stage'
  ) into has_stage;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matches' and column_name = 'venue'
  ) into has_venue;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matches' and column_name = 'city'
  ) into has_city;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matches' and column_name = 'group_name'
  ) into has_group_name;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'matches' and column_name = 'match_number'
  ) into has_match_number;

  if has_competition_id then
    insert into public.competitions (slug, name, is_active)
    values ('world-cup-2026', 'FIFA World Cup 2026', true)
    on conflict (slug) do update
      set name = excluded.name,
          is_active = true;

    select id into competition_id
    from public.competitions
    where slug = 'world-cup-2026';
  end if;

  for match_record in select * from pg_temp.predict26_seed_matches order by match_number loop
    if to_regclass('public.countries') is not null then
      select code into resolved_home_code
      from public.countries
      where upper(code) in (match_record.home_alpha2, match_record.home_alpha3)
      order by case when upper(code) = match_record.home_alpha2 then 0 else 1 end
      limit 1;

      select code into resolved_away_code
      from public.countries
      where upper(code) in (match_record.away_alpha2, match_record.away_alpha3)
      order by case when upper(code) = match_record.away_alpha2 then 0 else 1 end
      limit 1;
    else
      resolved_home_code := match_record.home_alpha2;
      resolved_away_code := match_record.away_alpha2;
    end if;

    -- Skip rows whose highlighted country is absent from the countries table.
    if to_regclass('public.countries') is not null and resolved_home_code is null then
      raise notice 'Skipping % because %/% is not present in public.countries.', match_record.home_team, match_record.home_alpha2, match_record.home_alpha3;
      continue;
    end if;

    resolved_away_code := coalesce(resolved_away_code, match_record.away_alpha3, match_record.away_alpha2);

    if has_legacy_team_codes then
      execute format(
        'insert into public.matches (%s home_team_code, away_team_code, home_team_name, away_team_name, kickoff_at, status, points_multiplier %s %s %s %s)
         select %s $1, $2, $3, $4, $5, %s, 1.0 %s %s %s %s
         where not exists (select 1 from public.matches where match_number = $10)',
        case when has_match_number then 'match_number,' else '' end,
        case when has_stage then ', stage' else '' end,
        case when has_group_name then ', group_name' else '' end,
        case when has_venue then ', venue' else '' end,
        case when has_city then ', city' else '' end,
        case when has_match_number then '$10,' else '' end,
        '''scheduled''::public.match_status',
        case when has_stage then ', $6::public.match_stage' else '' end,
        case when has_group_name then ', $7' else '' end,
        case when has_venue then ', $8' else '' end,
        case when has_city then ', $9' else '' end
      ) using resolved_home_code, resolved_away_code, match_record.home_team, match_record.away_team,
              match_record.kickoff_at, match_record.stage, match_record.group_name, match_record.venue,
              match_record.city, match_record.match_number;
    elsif has_modern_country_codes then
      execute format(
        'insert into public.matches (%s home_team, away_team, home_country_code, away_country_code, kickoff_at, status %s %s %s)
         select %s $1, $2, $3, $4, $5, ''scheduled'' %s %s %s
         where not exists (
           select 1 from public.matches
           where home_team = $1 and away_team = $2 and kickoff_at = $5
         )',
        case when has_competition_id then 'competition_id,' else '' end,
        case when has_stage then ', stage' else '' end,
        case when has_venue then ', venue' else '' end,
        case when has_city then ', city' else '' end,
        case when has_competition_id then '$9,' else '' end,
        case when has_stage then ', $6' else '' end,
        case when has_venue then ', $7' else '' end,
        case when has_city then ', $8' else '' end
      ) using match_record.home_team, match_record.away_team, resolved_home_code, resolved_away_code,
              match_record.kickoff_at, match_record.stage, match_record.venue, match_record.city,
              competition_id;
    else
      execute format(
        'insert into public.matches (%s home_team, away_team, kickoff_at, status)
         select %s $1, $2, $3, ''scheduled''
         where not exists (
           select 1 from public.matches
           where home_team = $1 and away_team = $2 and kickoff_at = $3
         )',
        case when has_competition_id then 'competition_id,' else '' end,
        case when has_competition_id then '$4,' else '' end
      ) using match_record.home_team, match_record.away_team, match_record.kickoff_at, competition_id;
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('public.world_cup_news') is null then
    raise notice 'Skipping sample news because public.world_cup_news does not exist.';
    return;
  end if;

  insert into public.world_cup_news (title, created_at)
  select title, created_at::timestamptz
  from (
    values
      ('FIFA confirms expanded 2026 match windows across North America', '2026-06-07 12:00:00+00'),
      ('Central Asia supporters prepare for a historic World Cup summer', '2026-06-08 09:30:00+00'),
      ('Prediction deadlines will lock at kickoff for every scheduled match', '2026-06-09 15:00:00+00'),
      ('Golden boot contenders headline the opening week fixtures', '2026-06-10 18:45:00+00'),
      ('Command Center standings will refresh after completed results', '2026-06-11 11:15:00+00')
  ) as sample_news(title, created_at)
  where not exists (
    select 1 from public.world_cup_news
    where world_cup_news.title = sample_news.title
  );
end $$;

commit;
