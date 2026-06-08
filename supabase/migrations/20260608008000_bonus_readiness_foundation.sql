-- Phase 5C.1: bonus official-data readiness/certification foundation.
-- Additive-only: no bonus scoring, no score_finished_match changes, no profile or leaderboard updates.

create table if not exists public.match_bonus_scoring_readiness (
  match_id uuid primary key references public.matches(id) on delete cascade,
  possession_status text not null default 'unreviewed' check (possession_status in ('unreviewed', 'ready', 'missing', 'ambiguous', 'untrusted', 'incomplete')),
  goal_events_status text not null default 'unreviewed' check (goal_events_status in ('unreviewed', 'ready', 'missing', 'ambiguous', 'untrusted', 'incomplete')),
  lineup_home_status text not null default 'unreviewed' check (lineup_home_status in ('unreviewed', 'ready', 'missing', 'ambiguous', 'untrusted', 'incomplete')),
  lineup_away_status text not null default 'unreviewed' check (lineup_away_status in ('unreviewed', 'ready', 'missing', 'ambiguous', 'untrusted', 'incomplete')),
  possession_notes text,
  goal_events_notes text,
  lineup_home_notes text,
  lineup_away_notes text,
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_match_bonus_scoring_readiness_confirmed_at
  on public.match_bonus_scoring_readiness(confirmed_at desc);

alter table public.match_bonus_scoring_readiness enable row level security;

-- No public/authenticated RLS policies: readiness certification is managed only by server-side admin tools.

-- Wire updated_at trigger where the shared trigger function exists.
do $$
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'update_updated_at_column') then
    drop trigger if exists match_bonus_scoring_readiness_updated_at on public.match_bonus_scoring_readiness;
    create trigger match_bonus_scoring_readiness_updated_at
      before update on public.match_bonus_scoring_readiness
      for each row execute function public.update_updated_at_column();
  end if;
end $$;

create or replace function public.get_match_bonus_scoring_readiness(p_match_id uuid)
returns table (
  match_id uuid,
  possession_ready boolean,
  possession_skip_reason text,
  scorers_ready boolean,
  scorers_skip_reason text,
  lineup_home_ready boolean,
  lineup_home_skip_reason text,
  lineup_away_ready boolean,
  lineup_away_skip_reason text,
  possession_home_rows integer,
  possession_away_rows integer,
  possession_home_percent numeric,
  possession_away_percent numeric,
  normal_goal_events_count integer,
  official_home_starters_count integer,
  official_away_starters_count integer,
  metadata jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_exists boolean := false;
  v_readiness public.match_bonus_scoring_readiness%rowtype;
  v_has_readiness boolean := false;
  v_possession_home_rows integer := 0;
  v_possession_away_rows integer := 0;
  v_possession_home_percent numeric;
  v_possession_away_percent numeric;
  v_normal_goal_events_count integer := 0;
  v_ambiguous_goal_events_count integer := 0;
  v_normal_goal_events_missing_player_count integer := 0;
  v_home_starters_with_player_count integer := 0;
  v_away_starters_with_player_count integer := 0;
  v_home_starters_total_count integer := 0;
  v_away_starters_total_count integer := 0;
  v_duplicate_home_starters_count integer := 0;
  v_duplicate_away_starters_count integer := 0;
  v_possession_ready boolean := false;
  v_scorers_ready boolean := false;
  v_lineup_home_ready boolean := false;
  v_lineup_away_ready boolean := false;
  v_possession_skip_reason text;
  v_scorers_skip_reason text;
  v_lineup_home_skip_reason text;
  v_lineup_away_skip_reason text;
begin
  select exists(select 1 from public.matches m where m.id = p_match_id)
  into v_match_exists;

  if not v_match_exists then
    raise exception 'Match % not found', p_match_id;
  end if;

  select *
  into v_readiness
  from public.match_bonus_scoring_readiness r
  where r.match_id = p_match_id;

  v_has_readiness := found;

  select
    count(*) filter (where ms.team_side = 'home' and ms.possession_percent is not null)::integer,
    count(*) filter (where ms.team_side = 'away' and ms.possession_percent is not null)::integer,
    max(ms.possession_percent) filter (where ms.team_side = 'home' and ms.possession_percent is not null),
    max(ms.possession_percent) filter (where ms.team_side = 'away' and ms.possession_percent is not null)
  into
    v_possession_home_rows,
    v_possession_away_rows,
    v_possession_home_percent,
    v_possession_away_percent
  from public.match_stats ms
  where ms.match_id = p_match_id;

  select
    count(*) filter (
      where lower(me.event_type) in ('goal', 'penalty_goal')
        and me.player_id is not null
    )::integer,
    count(*) filter (
      where lower(me.event_type) like '%goal%'
        and lower(me.event_type) not in ('goal', 'penalty_goal', 'own_goal')
    )::integer,
    count(*) filter (
      where lower(me.event_type) in ('goal', 'penalty_goal')
        and me.player_id is null
    )::integer
  into
    v_normal_goal_events_count,
    v_ambiguous_goal_events_count,
    v_normal_goal_events_missing_player_count
  from public.match_events me
  where me.match_id = p_match_id;

  select
    count(*) filter (where ml.team_side = 'home' and ml.is_starter and ml.player_id is not null)::integer,
    count(*) filter (where ml.team_side = 'away' and ml.is_starter and ml.player_id is not null)::integer,
    count(*) filter (where ml.team_side = 'home' and ml.is_starter)::integer,
    count(*) filter (where ml.team_side = 'away' and ml.is_starter)::integer
  into
    v_home_starters_with_player_count,
    v_away_starters_with_player_count,
    v_home_starters_total_count,
    v_away_starters_total_count
  from public.match_lineups ml
  where ml.match_id = p_match_id;

  select count(*)::integer
  into v_duplicate_home_starters_count
  from (
    select ml.player_id
    from public.match_lineups ml
    where ml.match_id = p_match_id
      and ml.team_side = 'home'
      and ml.is_starter
      and ml.player_id is not null
    group by ml.player_id
    having count(*) > 1
  ) duplicate_home_starters;

  select count(*)::integer
  into v_duplicate_away_starters_count
  from (
    select ml.player_id
    from public.match_lineups ml
    where ml.match_id = p_match_id
      and ml.team_side = 'away'
      and ml.is_starter
      and ml.player_id is not null
    group by ml.player_id
    having count(*) > 1
  ) duplicate_away_starters;

  if not v_has_readiness then
    v_possession_skip_reason := 'unreviewed';
    v_scorers_skip_reason := 'unreviewed';
    v_lineup_home_skip_reason := 'unreviewed';
    v_lineup_away_skip_reason := 'unreviewed';
  else
    if v_readiness.possession_status <> 'ready' then
      v_possession_skip_reason := v_readiness.possession_status;
    elsif v_possession_home_rows <> 1 or v_possession_away_rows <> 1 then
      v_possession_skip_reason := 'possession_rows_invalid';
    elsif v_possession_home_percent is null or v_possession_away_percent is null then
      v_possession_skip_reason := 'possession_missing_percent';
    elsif coalesce(v_possession_home_percent, 0) + coalesce(v_possession_away_percent, 0) <= 0 then
      v_possession_skip_reason := 'possession_total_invalid';
    else
      v_possession_ready := true;
    end if;

    if v_readiness.goal_events_status <> 'ready' then
      v_scorers_skip_reason := v_readiness.goal_events_status;
    elsif v_ambiguous_goal_events_count > 0 then
      v_scorers_skip_reason := 'goal_event_taxonomy_ambiguous';
    elsif v_normal_goal_events_missing_player_count > 0 then
      v_scorers_skip_reason := 'goal_event_player_missing';
    else
      v_scorers_ready := true;
    end if;

    if v_readiness.lineup_home_status <> 'ready' then
      v_lineup_home_skip_reason := v_readiness.lineup_home_status;
    elsif v_home_starters_total_count <> 11 then
      v_lineup_home_skip_reason := 'home_starter_count_invalid';
    elsif v_home_starters_with_player_count <> 11 then
      v_lineup_home_skip_reason := 'home_starter_player_mapping_incomplete';
    elsif v_duplicate_home_starters_count > 0 then
      v_lineup_home_skip_reason := 'home_duplicate_starters';
    else
      v_lineup_home_ready := true;
    end if;

    if v_readiness.lineup_away_status <> 'ready' then
      v_lineup_away_skip_reason := v_readiness.lineup_away_status;
    elsif v_away_starters_total_count <> 11 then
      v_lineup_away_skip_reason := 'away_starter_count_invalid';
    elsif v_away_starters_with_player_count <> 11 then
      v_lineup_away_skip_reason := 'away_starter_player_mapping_incomplete';
    elsif v_duplicate_away_starters_count > 0 then
      v_lineup_away_skip_reason := 'away_duplicate_starters';
    else
      v_lineup_away_ready := true;
    end if;
  end if;

  return query select
    p_match_id,
    v_possession_ready,
    v_possession_skip_reason,
    v_scorers_ready,
    v_scorers_skip_reason,
    v_lineup_home_ready,
    v_lineup_home_skip_reason,
    v_lineup_away_ready,
    v_lineup_away_skip_reason,
    v_possession_home_rows,
    v_possession_away_rows,
    v_possession_home_percent,
    v_possession_away_percent,
    v_normal_goal_events_count,
    v_home_starters_with_player_count,
    v_away_starters_with_player_count,
    jsonb_build_object(
      'has_readiness_row', v_has_readiness,
      'readiness_statuses', jsonb_build_object(
        'possession', coalesce(v_readiness.possession_status, 'unreviewed'),
        'goal_events', coalesce(v_readiness.goal_events_status, 'unreviewed'),
        'lineup_home', coalesce(v_readiness.lineup_home_status, 'unreviewed'),
        'lineup_away', coalesce(v_readiness.lineup_away_status, 'unreviewed')
      ),
      'notes', jsonb_build_object(
        'possession', v_readiness.possession_notes,
        'goal_events', v_readiness.goal_events_notes,
        'lineup_home', v_readiness.lineup_home_notes,
        'lineup_away', v_readiness.lineup_away_notes
      ),
      'event_diagnostics', jsonb_build_object(
        'ambiguous_goal_events_count', v_ambiguous_goal_events_count,
        'normal_goal_events_missing_player_count', v_normal_goal_events_missing_player_count,
        'normal_goal_event_types', jsonb_build_array('goal', 'penalty_goal'),
        'excluded_goal_event_types', jsonb_build_array('own_goal')
      ),
      'lineup_diagnostics', jsonb_build_object(
        'home_starters_total_count', v_home_starters_total_count,
        'away_starters_total_count', v_away_starters_total_count,
        'home_starters_with_player_count', v_home_starters_with_player_count,
        'away_starters_with_player_count', v_away_starters_with_player_count,
        'duplicate_home_starters_count', v_duplicate_home_starters_count,
        'duplicate_away_starters_count', v_duplicate_away_starters_count
      ),
      'confirmed_by', v_readiness.confirmed_by,
      'confirmed_at', v_readiness.confirmed_at,
      'metadata', coalesce(v_readiness.metadata, '{}'::jsonb)
    );
end;
$$;

create or replace function public.set_match_bonus_scoring_readiness(
  p_match_id uuid,
  p_possession_status text default null,
  p_goal_events_status text default null,
  p_lineup_home_status text default null,
  p_lineup_away_status text default null,
  p_possession_notes text default null,
  p_goal_events_notes text default null,
  p_lineup_home_notes text default null,
  p_lineup_away_notes text default null,
  p_confirmed_by uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.match_bonus_scoring_readiness
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed_statuses constant text[] := array['unreviewed', 'ready', 'missing', 'ambiguous', 'untrusted', 'incomplete'];
  v_row public.match_bonus_scoring_readiness%rowtype;
  v_confirmed_by uuid;
begin
  if not exists (select 1 from public.matches m where m.id = p_match_id) then
    raise exception 'Match % not found', p_match_id;
  end if;

  if p_possession_status is not null and p_possession_status <> all(v_allowed_statuses) then
    raise exception 'Invalid possession status: %', p_possession_status;
  end if;

  if p_goal_events_status is not null and p_goal_events_status <> all(v_allowed_statuses) then
    raise exception 'Invalid goal events status: %', p_goal_events_status;
  end if;

  if p_lineup_home_status is not null and p_lineup_home_status <> all(v_allowed_statuses) then
    raise exception 'Invalid home lineup status: %', p_lineup_home_status;
  end if;

  if p_lineup_away_status is not null and p_lineup_away_status <> all(v_allowed_statuses) then
    raise exception 'Invalid away lineup status: %', p_lineup_away_status;
  end if;

  if p_metadata is null then
    p_metadata := '{}'::jsonb;
  end if;

  v_confirmed_by := coalesce(p_confirmed_by, auth.uid());

  insert into public.match_bonus_scoring_readiness (
    match_id,
    possession_status,
    goal_events_status,
    lineup_home_status,
    lineup_away_status,
    possession_notes,
    goal_events_notes,
    lineup_home_notes,
    lineup_away_notes,
    confirmed_by,
    confirmed_at,
    metadata
  ) values (
    p_match_id,
    coalesce(p_possession_status, 'unreviewed'),
    coalesce(p_goal_events_status, 'unreviewed'),
    coalesce(p_lineup_home_status, 'unreviewed'),
    coalesce(p_lineup_away_status, 'unreviewed'),
    p_possession_notes,
    p_goal_events_notes,
    p_lineup_home_notes,
    p_lineup_away_notes,
    v_confirmed_by,
    timezone('utc', now()),
    p_metadata
  )
  on conflict (match_id) do update
  set
    possession_status = coalesce(p_possession_status, match_bonus_scoring_readiness.possession_status),
    goal_events_status = coalesce(p_goal_events_status, match_bonus_scoring_readiness.goal_events_status),
    lineup_home_status = coalesce(p_lineup_home_status, match_bonus_scoring_readiness.lineup_home_status),
    lineup_away_status = coalesce(p_lineup_away_status, match_bonus_scoring_readiness.lineup_away_status),
    possession_notes = coalesce(p_possession_notes, match_bonus_scoring_readiness.possession_notes),
    goal_events_notes = coalesce(p_goal_events_notes, match_bonus_scoring_readiness.goal_events_notes),
    lineup_home_notes = coalesce(p_lineup_home_notes, match_bonus_scoring_readiness.lineup_home_notes),
    lineup_away_notes = coalesce(p_lineup_away_notes, match_bonus_scoring_readiness.lineup_away_notes),
    confirmed_by = v_confirmed_by,
    confirmed_at = timezone('utc', now()),
    metadata = match_bonus_scoring_readiness.metadata || p_metadata
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on table public.match_bonus_scoring_readiness from public;
revoke all on table public.match_bonus_scoring_readiness from anon;
revoke all on table public.match_bonus_scoring_readiness from authenticated;

revoke all on function public.get_match_bonus_scoring_readiness(uuid) from public;
revoke all on function public.get_match_bonus_scoring_readiness(uuid) from anon;
revoke all on function public.get_match_bonus_scoring_readiness(uuid) from authenticated;
grant execute on function public.get_match_bonus_scoring_readiness(uuid) to service_role;

revoke all on function public.set_match_bonus_scoring_readiness(uuid, text, text, text, text, text, text, text, text, uuid, jsonb) from public;
revoke all on function public.set_match_bonus_scoring_readiness(uuid, text, text, text, text, text, text, text, text, uuid, jsonb) from anon;
revoke all on function public.set_match_bonus_scoring_readiness(uuid, text, text, text, text, text, text, text, text, uuid, jsonb) from authenticated;
grant execute on function public.set_match_bonus_scoring_readiness(uuid, text, text, text, text, text, text, text, text, uuid, jsonb) to service_role;

comment on table public.match_bonus_scoring_readiness is 'Admin-certified official data readiness for future bonus match scoring. Phase 5C.1 only; does not award points.';
comment on function public.get_match_bonus_scoring_readiness(uuid) is 'Diagnostic-only bonus official-data readiness summary. Does not award points or mutate scoring state.';
comment on function public.set_match_bonus_scoring_readiness(uuid, text, text, text, text, text, text, text, text, uuid, jsonb) is 'Service-role-only admin readiness setter. Does not award points or mutate ledger/profile/leaderboard state.';

notify pgrst, 'reload schema';
