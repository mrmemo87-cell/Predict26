-- Predict26 bonus prediction foundation.
-- Additive-only: creates storage, validation helpers, triggers, and RLS for bonus picks.
-- Does not alter exact-score predictions, scoring, profile points, or leaderboards.

create table if not exists public.prediction_possession (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  choice text not null check (choice in ('home_more', 'away_more', 'equal_50_50')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, match_id)
);

create table if not exists public.prediction_scorers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  team_code text not null,
  slot integer not null check (slot between 1 and 4),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, match_id, player_id),
  unique (user_id, match_id, slot)
);

create table if not exists public.prediction_lineups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  team_side text not null check (team_side in ('home', 'away')),
  team_code text not null,
  is_submitted boolean not null default false,
  submitted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, match_id, team_side),
  check ((is_submitted = false and submitted_at is null) or (is_submitted = true and submitted_at is not null))
);

create table if not exists public.prediction_lineup_players (
  id uuid primary key default gen_random_uuid(),
  prediction_lineup_id uuid not null references public.prediction_lineups(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (prediction_lineup_id, player_id)
);

create table if not exists public.tournament_prediction_config (
  competition_code text primary key,
  competition_id uuid references public.competitions(id) on delete set null,
  knockout_starts_at timestamptz,
  round_of_16_starts_at timestamptz,
  champion_pick_a_deadline timestamptz,
  champion_pick_b_deadline timestamptz,
  champion_picks_enabled boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tournament_champion_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  competition_code text not null default 'WC2026',
  competition_id uuid references public.competitions(id) on delete set null,
  pick_type text not null check (pick_type in ('A', 'B')),
  team_code text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, competition_code, pick_type)
);

create index if not exists idx_prediction_possession_match on public.prediction_possession(match_id);
create index if not exists idx_prediction_scorers_match on public.prediction_scorers(match_id);
create index if not exists idx_prediction_scorers_player on public.prediction_scorers(player_id);
create index if not exists idx_prediction_lineups_match on public.prediction_lineups(match_id);
create index if not exists idx_prediction_lineup_players_player on public.prediction_lineup_players(player_id);
create index if not exists idx_tournament_champion_predictions_competition on public.tournament_champion_predictions(competition_code, team_code);

create or replace function public.is_match_open_for_bonus_prediction(p_match_id uuid)
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
      and m.kickoff_at > now()
  );
$$;

create or replace function public.match_side_team_code(p_match_id uuid, p_team_side text)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_team_side = 'home' then public.resolve_team_code('WC2026', coalesce(m.home_country_code, m.home_team_code::text))
    when p_team_side = 'away' then public.resolve_team_code('WC2026', coalesce(m.away_country_code, m.away_team_code::text))
    else null
  end
  from public.matches m
  where m.id = p_match_id;
$$;

create or replace function public.is_team_code_for_match_side(p_match_id uuid, p_team_side text, p_team_code text)
returns boolean
language sql
stable
set search_path = public
as $$
  select public.match_side_team_code(p_match_id, p_team_side) = public.resolve_team_code('WC2026', p_team_code);
$$;

create or replace function public.is_player_in_match_squad(
  p_match_id uuid,
  p_player_id uuid,
  p_team_side text default null
)
returns boolean
language sql
stable
set search_path = public
as $$
  with match_teams as (
    select
      public.match_side_team_code(p_match_id, 'home') as home_team_code,
      public.match_side_team_code(p_match_id, 'away') as away_team_code
  )
  select exists (
    select 1
    from public.competition_team_players ctp
    cross join match_teams mt
    where ctp.player_id = p_player_id
      and ctp.competition_code = 'WC2026'
      and ctp.is_active
      and (
        (p_team_side = 'home' and ctp.team_code = mt.home_team_code)
        or (p_team_side = 'away' and ctp.team_code = mt.away_team_code)
        or (p_team_side is null and ctp.team_code in (mt.home_team_code, mt.away_team_code))
      )
  );
$$;

create or replace function public.player_match_team_code(p_match_id uuid, p_player_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  with match_teams as (
    select
      public.match_side_team_code(p_match_id, 'home') as home_team_code,
      public.match_side_team_code(p_match_id, 'away') as away_team_code
  )
  select ctp.team_code
  from public.competition_team_players ctp
  cross join match_teams mt
  where ctp.player_id = p_player_id
    and ctp.competition_code = 'WC2026'
    and ctp.is_active
    and ctp.team_code in (mt.home_team_code, mt.away_team_code)
  order by case when ctp.team_code = mt.home_team_code then 0 else 1 end
  limit 1;
$$;

create or replace function public.can_submit_champion_prediction(
  p_user_id uuid,
  p_competition_code text,
  p_pick_type text,
  p_team_code text
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles pr
    join public.tournament_prediction_config cfg
      on cfg.competition_code = upper(trim(p_competition_code))
    where pr.id = p_user_id
      and cfg.champion_picks_enabled
      and exists (
        select 1
        from public.competition_team_players ctp
        where ctp.competition_code = cfg.competition_code
          and ctp.team_code = public.resolve_team_code(cfg.competition_code, p_team_code)
          and ctp.is_active
      )
      and (
        (
          p_pick_type = 'A'
          and cfg.knockout_starts_at is not null
          and cfg.champion_pick_a_deadline is not null
          and pr.created_at < cfg.knockout_starts_at
          and now() < cfg.champion_pick_a_deadline
        )
        or (
          p_pick_type = 'B'
          and cfg.round_of_16_starts_at is not null
          and cfg.champion_pick_b_deadline is not null
          and pr.created_at < cfg.round_of_16_starts_at
          and now() < cfg.champion_pick_b_deadline
        )
      )
  );
$$;

create or replace function public.validate_prediction_scorer_row()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_team_code text;
begin
  if not public.is_match_open_for_bonus_prediction(new.match_id) then
    raise exception 'Scorer predictions can only be changed before kickoff for scheduled matches.';
  end if;

  v_team_code := public.player_match_team_code(new.match_id, new.player_id);
  if v_team_code is null then
    raise exception 'Selected scorer is not in either active match squad.';
  end if;

  new.team_code := v_team_code;
  return new;
end;
$$;

create or replace function public.validate_prediction_lineup_row()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_expected_team_code text;
  v_player_count integer;
begin
  if not public.is_match_open_for_bonus_prediction(new.match_id) then
    raise exception 'Lineup predictions can only be changed before kickoff for scheduled matches.';
  end if;

  v_expected_team_code := public.match_side_team_code(new.match_id, new.team_side);
  if v_expected_team_code is null then
    raise exception 'Match side is missing a team code.';
  end if;

  new.team_code := v_expected_team_code;

  if new.is_submitted and new.submitted_at is null then
    new.submitted_at := timezone('utc', now());
  elsif not new.is_submitted then
    new.submitted_at := null;
  end if;

  if new.is_submitted then
    select count(*)::integer
    into v_player_count
    from public.prediction_lineup_players plp
    where plp.prediction_lineup_id = new.id;

    if v_player_count <> 11 then
      raise exception 'Submitted lineup predictions must contain exactly 11 players.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validate_prediction_lineup_player_row()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_lineup public.prediction_lineups%rowtype;
  v_player_count integer;
begin
  select *
  into v_lineup
  from public.prediction_lineups
  where id = new.prediction_lineup_id;

  if not found then
    raise exception 'Prediction lineup not found.';
  end if;

  if v_lineup.is_submitted then
    raise exception 'Submitted lineup predictions cannot be edited. Mark the lineup as draft before changing players.';
  end if;

  if not public.is_match_open_for_bonus_prediction(v_lineup.match_id) then
    raise exception 'Lineup predictions can only be changed before kickoff for scheduled matches.';
  end if;

  if not public.is_player_in_match_squad(v_lineup.match_id, new.player_id, v_lineup.team_side) then
    raise exception 'Selected lineup player is not in the active squad for this match side.';
  end if;

  if tg_op = 'INSERT' then
    select count(*)::integer
    into v_player_count
    from public.prediction_lineup_players plp
    where plp.prediction_lineup_id = new.prediction_lineup_id;
  else
    select count(*)::integer
    into v_player_count
    from public.prediction_lineup_players plp
    where plp.prediction_lineup_id = new.prediction_lineup_id
      and plp.id <> new.id;
  end if;

  if v_player_count >= 11 then
    raise exception 'Lineup predictions can contain at most 11 players per side.';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_submitted_lineup_player_delete()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_lineup public.prediction_lineups%rowtype;
begin
  select *
  into v_lineup
  from public.prediction_lineups
  where id = old.prediction_lineup_id;

  if found and v_lineup.is_submitted then
    raise exception 'Submitted lineup predictions cannot be edited. Mark the lineup as draft before changing players.';
  end if;

  if found and not public.is_match_open_for_bonus_prediction(v_lineup.match_id) then
    raise exception 'Lineup predictions can only be changed before kickoff for scheduled matches.';
  end if;

  return old;
end;
$$;

create or replace function public.validate_champion_prediction_row()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.competition_code := upper(trim(new.competition_code));
  new.pick_type := upper(trim(new.pick_type));
  new.team_code := public.resolve_team_code(new.competition_code, new.team_code);

  if not public.can_submit_champion_prediction(new.user_id, new.competition_code, new.pick_type, new.team_code) then
    raise exception 'Champion pick is not eligible or the deadline has passed.';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_bonus_prediction_delete_after_lock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.is_match_open_for_bonus_prediction(old.match_id) then
    raise exception 'Bonus predictions can only be deleted before kickoff for scheduled matches.';
  end if;

  return old;
end;
$$;

drop trigger if exists prediction_scorers_validate on public.prediction_scorers;
create trigger prediction_scorers_validate
before insert or update on public.prediction_scorers
for each row execute function public.validate_prediction_scorer_row();

drop trigger if exists prediction_lineups_validate on public.prediction_lineups;
create trigger prediction_lineups_validate
before insert or update on public.prediction_lineups
for each row execute function public.validate_prediction_lineup_row();

drop trigger if exists prediction_lineup_players_validate on public.prediction_lineup_players;
create trigger prediction_lineup_players_validate
before insert or update on public.prediction_lineup_players
for each row execute function public.validate_prediction_lineup_player_row();

drop trigger if exists prediction_lineup_players_prevent_delete on public.prediction_lineup_players;
create trigger prediction_lineup_players_prevent_delete
before delete on public.prediction_lineup_players
for each row execute function public.prevent_submitted_lineup_player_delete();

drop trigger if exists tournament_champion_predictions_validate on public.tournament_champion_predictions;
create trigger tournament_champion_predictions_validate
before insert or update on public.tournament_champion_predictions
for each row execute function public.validate_champion_prediction_row();

drop trigger if exists prediction_possession_prevent_delete_after_lock on public.prediction_possession;
create trigger prediction_possession_prevent_delete_after_lock
before delete on public.prediction_possession
for each row execute function public.prevent_bonus_prediction_delete_after_lock();

drop trigger if exists prediction_scorers_prevent_delete_after_lock on public.prediction_scorers;
create trigger prediction_scorers_prevent_delete_after_lock
before delete on public.prediction_scorers
for each row execute function public.prevent_bonus_prediction_delete_after_lock();

-- Wire shared updated_at triggers where available.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'update_updated_at_column') then
    foreach table_name in array array[
      'prediction_possession',
      'prediction_scorers',
      'prediction_lineups',
      'prediction_lineup_players',
      'tournament_prediction_config',
      'tournament_champion_predictions'
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

alter table public.prediction_possession enable row level security;
alter table public.prediction_scorers enable row level security;
alter table public.prediction_lineups enable row level security;
alter table public.prediction_lineup_players enable row level security;
alter table public.tournament_prediction_config enable row level security;
alter table public.tournament_champion_predictions enable row level security;

drop policy if exists prediction_possession_select_own on public.prediction_possession;
create policy prediction_possession_select_own on public.prediction_possession
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists prediction_possession_insert_own_open_match on public.prediction_possession;
create policy prediction_possession_insert_own_open_match on public.prediction_possession
for insert to authenticated
with check (auth.uid() = user_id and public.is_match_open_for_bonus_prediction(match_id));

drop policy if exists prediction_possession_update_own_open_match on public.prediction_possession;
create policy prediction_possession_update_own_open_match on public.prediction_possession
for update to authenticated
using (auth.uid() = user_id and public.is_match_open_for_bonus_prediction(match_id))
with check (auth.uid() = user_id and public.is_match_open_for_bonus_prediction(match_id));

drop policy if exists prediction_possession_delete_own_open_match on public.prediction_possession;
create policy prediction_possession_delete_own_open_match on public.prediction_possession
for delete to authenticated
using (auth.uid() = user_id and public.is_match_open_for_bonus_prediction(match_id));

drop policy if exists prediction_scorers_select_own on public.prediction_scorers;
create policy prediction_scorers_select_own on public.prediction_scorers
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists prediction_scorers_insert_own_open_match_valid_player on public.prediction_scorers;
create policy prediction_scorers_insert_own_open_match_valid_player on public.prediction_scorers
for insert to authenticated
with check (
  auth.uid() = user_id
  and public.is_match_open_for_bonus_prediction(match_id)
  and public.is_player_in_match_squad(match_id, player_id)
);

drop policy if exists prediction_scorers_update_own_open_match_valid_player on public.prediction_scorers;
create policy prediction_scorers_update_own_open_match_valid_player on public.prediction_scorers
for update to authenticated
using (auth.uid() = user_id and public.is_match_open_for_bonus_prediction(match_id))
with check (
  auth.uid() = user_id
  and public.is_match_open_for_bonus_prediction(match_id)
  and public.is_player_in_match_squad(match_id, player_id)
);

drop policy if exists prediction_scorers_delete_own_open_match on public.prediction_scorers;
create policy prediction_scorers_delete_own_open_match on public.prediction_scorers
for delete to authenticated
using (auth.uid() = user_id and public.is_match_open_for_bonus_prediction(match_id));

drop policy if exists prediction_lineups_select_own on public.prediction_lineups;
create policy prediction_lineups_select_own on public.prediction_lineups
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists prediction_lineups_insert_own_open_match_valid_side on public.prediction_lineups;
create policy prediction_lineups_insert_own_open_match_valid_side on public.prediction_lineups
for insert to authenticated
with check (
  auth.uid() = user_id
  and public.is_match_open_for_bonus_prediction(match_id)
  and public.is_team_code_for_match_side(match_id, team_side, team_code)
);

drop policy if exists prediction_lineups_update_own_open_match_valid_side on public.prediction_lineups;
create policy prediction_lineups_update_own_open_match_valid_side on public.prediction_lineups
for update to authenticated
using (auth.uid() = user_id and public.is_match_open_for_bonus_prediction(match_id))
with check (
  auth.uid() = user_id
  and public.is_match_open_for_bonus_prediction(match_id)
  and public.is_team_code_for_match_side(match_id, team_side, team_code)
);

drop policy if exists prediction_lineups_delete_own_open_match on public.prediction_lineups;
create policy prediction_lineups_delete_own_open_match on public.prediction_lineups
for delete to authenticated
using (auth.uid() = user_id and public.is_match_open_for_bonus_prediction(match_id));

drop policy if exists prediction_lineup_players_select_own on public.prediction_lineup_players;
create policy prediction_lineup_players_select_own on public.prediction_lineup_players
for select to authenticated
using (
  exists (
    select 1
    from public.prediction_lineups pl
    where pl.id = prediction_lineup_id
      and pl.user_id = auth.uid()
  )
);

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
      and public.is_match_open_for_bonus_prediction(pl.match_id)
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
      and public.is_match_open_for_bonus_prediction(pl.match_id)
  )
)
with check (
  exists (
    select 1
    from public.prediction_lineups pl
    where pl.id = prediction_lineup_id
      and pl.user_id = auth.uid()
      and not pl.is_submitted
      and public.is_match_open_for_bonus_prediction(pl.match_id)
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
      and public.is_match_open_for_bonus_prediction(pl.match_id)
  )
);

drop policy if exists tournament_prediction_config_read_all on public.tournament_prediction_config;
create policy tournament_prediction_config_read_all on public.tournament_prediction_config
for select using (true);

drop policy if exists tournament_champion_predictions_select_own on public.tournament_champion_predictions;
create policy tournament_champion_predictions_select_own on public.tournament_champion_predictions
for select to authenticated
using (auth.uid() = user_id);

drop policy if exists tournament_champion_predictions_insert_own_eligible on public.tournament_champion_predictions;
create policy tournament_champion_predictions_insert_own_eligible on public.tournament_champion_predictions
for insert to authenticated
with check (
  auth.uid() = user_id
  and public.can_submit_champion_prediction(user_id, competition_code, pick_type, team_code)
);

drop policy if exists tournament_champion_predictions_update_own_eligible on public.tournament_champion_predictions;
create policy tournament_champion_predictions_update_own_eligible on public.tournament_champion_predictions
for update to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and public.can_submit_champion_prediction(user_id, competition_code, pick_type, team_code)
);

grant execute on function public.is_match_open_for_bonus_prediction(uuid) to anon, authenticated;
grant execute on function public.match_side_team_code(uuid, text) to anon, authenticated;
grant execute on function public.is_team_code_for_match_side(uuid, text, text) to anon, authenticated;
grant execute on function public.is_player_in_match_squad(uuid, uuid, text) to anon, authenticated;
grant execute on function public.player_match_team_code(uuid, uuid) to anon, authenticated;
grant execute on function public.can_submit_champion_prediction(uuid, text, text, text) to anon, authenticated;

comment on table public.prediction_possession is 'User possession bonus predictions. No user-controlled scoring columns.';
comment on table public.prediction_scorers is 'User scorer bonus predictions, limited to four selected players per match by slot constraints.';
comment on table public.prediction_lineups is 'Parent rows for user predicted starting XIs per match side.';
comment on table public.prediction_lineup_players is 'Selected players for predicted starting XIs; submitted lineups require exactly 11 players.';
comment on table public.tournament_champion_predictions is 'Tournament champion A/B picks. No scoring columns; eligibility is deadline/config based.';
comment on function public.is_player_in_match_squad(uuid, uuid, text) is 'Validates that a player belongs to an active normalized squad for either or one side of a match.';

notify pgrst, 'reload schema';
