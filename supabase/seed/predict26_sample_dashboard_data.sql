-- DEV ONLY. Do not use for production official schedule.
-- Predict26 sample dashboard data for manual Supabase use only.
-- Run manually in the Supabase SQL editor or psql after migrations are applied.
-- This file intentionally does not run as part of application startup.
--
-- Manual cleanup for production databases that accidentally received this DEV seed:
--   do $$
--   begin
--     if to_regclass('public.matches') is not null then
--       delete from public.matches
--       where home_team in ('Dev Alpha FC', 'Dev Gamma FC', 'Dev Echo FC', 'Dev Stadium Testers')
--          or away_team in ('Dev Beta FC', 'Dev Delta FC', 'Dev Foxtrot FC', 'Dev Bracket Bots');
--     end if;
--   end $$;
-- The cleanup is intentionally narrow and does not touch public.predictions. Delete only after
-- confirming these dev matches are not referenced by real user predictions in your environment.

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
        ('XA', 'Dev Alpha FC', '🧪'),
        ('XB', 'Dev Beta FC', '🧪'),
        ('XC', 'Dev Gamma FC', '🧪'),
        ('XD', 'Dev Delta FC', '🧪'),
        ('XE', 'Dev Echo FC', '🧪'),
        ('XF', 'Dev Foxtrot FC', '🧪'),
        ('XS', 'Dev Stadium Testers', '🧪'),
        ('XG', 'Dev Bracket Bots', '🧪')
      on conflict (code) do update
        set name = excluded.name,
            flag_emoji = excluded.flag_emoji;
    else
      insert into public.countries (code, name, flag_emoji)
      values
        ('XAA', 'Dev Alpha FC', '🧪'),
        ('XBB', 'Dev Beta FC', '🧪'),
        ('XCC', 'Dev Gamma FC', '🧪'),
        ('XDD', 'Dev Delta FC', '🧪'),
        ('XEE', 'Dev Echo FC', '🧪'),
        ('XFF', 'Dev Foxtrot FC', '🧪'),
        ('XST', 'Dev Stadium Testers', '🧪'),
        ('XGG', 'Dev Bracket Bots', '🧪')
      on conflict (code) do update
        set name = excluded.name,
            flag_emoji = excluded.flag_emoji;
    end if;
  end if;
end $$;

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
  legacy_team_code_max_length integer;
  modern_country_code_max_length integer;
  home_match_code text;
  away_match_code text;
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

  select character_maximum_length into legacy_team_code_max_length
  from information_schema.columns
  where table_schema = 'public' and table_name = 'matches' and column_name = 'home_team_code';

  select character_maximum_length into modern_country_code_max_length
  from information_schema.columns
  where table_schema = 'public' and table_name = 'matches' and column_name = 'home_country_code';

  if has_competition_id then
    insert into public.competitions (slug, name, is_active)
    values ('predict26-dev-schedule', 'Predict26 Dev Test Schedule', true)
    on conflict (slug) do update
      set name = excluded.name,
          is_active = true;

    select id into competition_id
    from public.competitions
    where slug = 'predict26-dev-schedule';
  end if;

  for match_record in
    select *
    from (
      values
        (926001, 'XA', 'XAA', 'Dev Alpha FC', 'XB', 'XBB', 'Dev Beta FC', (now() + interval '2 days')::timestamptz, 'group', 'A', 'Dev Venue Alpha', 'Dev City Alpha'),
        (926002, 'XC', 'XCC', 'Dev Gamma FC', 'XD', 'XDD', 'Dev Delta FC', (now() + interval '4 days')::timestamptz, 'group', 'B', 'Dev Venue Beta', 'Dev City Beta'),
        (926003, 'XE', 'XEE', 'Dev Echo FC', 'XF', 'XFF', 'Dev Foxtrot FC', (now() + interval '6 days')::timestamptz, 'group', 'C', 'Dev Venue Gamma', 'Dev City Gamma'),
        (926004, 'XA', 'XAA', 'Dev Alpha FC', 'XD', 'XDD', 'Dev Delta FC', (now() + interval '8 days')::timestamptz, 'group', 'D', 'Dev Venue Delta', 'Dev City Delta'),
        (926005, 'XS', 'XST', 'Dev Stadium Testers', 'XG', 'XGG', 'Dev Bracket Bots', (now() + interval '10 days')::timestamptz, 'round_of_32', null, 'Dev Venue Knockout', 'Dev City Knockout')
    ) as seed_matches(
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
    order by match_number
  loop
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
      -- Legacy match schemas use char(2) team codes, while countries may store ISO-3 codes.
      -- Insert alpha-2 codes here to avoid value-too-long errors.
      home_match_code := case
        when coalesce(legacy_team_code_max_length, 2) <= 2 then match_record.home_alpha2
        else coalesce(resolved_home_code, match_record.home_alpha3, match_record.home_alpha2)
      end;
      away_match_code := case
        when coalesce(legacy_team_code_max_length, 2) <= 2 then match_record.away_alpha2
        else coalesce(resolved_away_code, match_record.away_alpha3, match_record.away_alpha2)
      end;
      execute format(
        'insert into public.matches (%s home_team_code, away_team_code, home_team_name, away_team_name, kickoff_at, status, points_multiplier %s %s %s %s)
         select %s $1, $2, $3, $4, $5, %s, 1.0 %s %s %s %s
         where not exists (select 1 from public.matches where %s)',
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
        case when has_city then ', $9' else '' end,
        case
          when has_match_number then 'match_number = $10'
          else 'home_team_name = $3 and away_team_name = $4 and kickoff_at = $5'
        end
      ) using home_match_code, away_match_code, match_record.home_team, match_record.away_team,
              match_record.kickoff_at, match_record.stage, match_record.group_name, match_record.venue,
              match_record.city, match_record.match_number;
    elsif has_modern_country_codes then
      home_match_code := case
        when coalesce(modern_country_code_max_length, 3) <= 2 then match_record.home_alpha2
        else coalesce(resolved_home_code, match_record.home_alpha3, match_record.home_alpha2)
      end;
      away_match_code := case
        when coalesce(modern_country_code_max_length, 3) <= 2 then match_record.away_alpha2
        else coalesce(resolved_away_code, match_record.away_alpha3, match_record.away_alpha2)
      end;

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
      ) using match_record.home_team, match_record.away_team, home_match_code, away_match_code,
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
      ('DEV: sample news item for dashboard rendering', now()),
      ('DEV: prediction deadlines lock at kickoff in test data', now() + interval '1 hour'),
      ('DEV: command center cards support empty and populated states', now() + interval '2 hours'),
      ('DEV: leaderboard summaries refresh after test results', now() + interval '3 hours'),
      ('DEV: remove this seed before production schedule import', now() + interval '4 hours')
  ) as sample_news(title, created_at)
  where not exists (
    select 1 from public.world_cup_news
    where world_cup_news.title = sample_news.title
  );
end $$;

commit;
