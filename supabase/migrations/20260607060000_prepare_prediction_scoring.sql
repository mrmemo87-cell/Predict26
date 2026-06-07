-- Prepare server-only prediction scoring without wiring automatic execution.

-- Support the requested finished status while keeping existing historical statuses usable.
do $$
begin
  if exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'match_status') then
    alter type public.match_status add value if not exists 'finished';
  end if;
end $$;

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
      check (status::text in ('scheduled', 'upcoming', 'live', 'in_progress', 'completed', 'finished', 'postponed', 'cancelled'));
  end if;
end $$;

-- Keep score nullability rules compatible with finished matches.
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
        or (status::text in ('live', 'in_progress', 'completed', 'finished') and home_score is not null and away_score is not null)
      );
  end if;
end $$;

alter table public.predictions
  add column if not exists home_score integer check (home_score >= 0),
  add column if not exists away_score integer check (away_score >= 0),
  add column if not exists points integer not null default 0,
  add column if not exists points_awarded integer not null default 0,
  add column if not exists scoring_outcome text check (scoring_outcome in ('exact', 'result', 'miss')),
  add column if not exists scored_at timestamptz,
  add column if not exists result_points_applied boolean not null default false;

-- If an older schema used predicted_* names, hydrate the canonical scoring columns once.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'predictions' and column_name = 'predicted_home_score'
  ) then
    update public.predictions
    set home_score = predicted_home_score
    where home_score is null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'predictions' and column_name = 'predicted_away_score'
  ) then
    update public.predictions
    set away_score = predicted_away_score
    where away_score is null;
  end if;
end $$;

-- Existing points_awarded constraints may still reflect the old 10-point scoring model.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'predictions'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%points_awarded%'
  loop
    execute format('alter table public.predictions drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table public.predictions
  drop constraint if exists predictions_points_allowed,
  drop constraint if exists predictions_points_awarded_allowed,
  add constraint predictions_points_allowed check (points in (0, 2, 5)) not valid,
  add constraint predictions_points_awarded_allowed check (points_awarded in (0, 2, 5)) not valid;

alter table public.profiles
  add column if not exists total_predictions integer not null default 0 check (total_predictions >= 0),
  add column if not exists correct_predictions integer not null default 0 check (correct_predictions >= 0),
  add column if not exists prediction_count integer not null default 0 check (prediction_count >= 0),
  add column if not exists correct_prediction_count integer not null default 0 check (correct_prediction_count >= 0),
  add column if not exists accuracy numeric(5,2) not null default 0;

-- Preserve existing aggregate counts when migrating from earlier profile column names.
update public.profiles
set total_predictions = prediction_count
where total_predictions = 0 and prediction_count > 0;

update public.profiles
set correct_predictions = correct_prediction_count
where correct_predictions = 0 and correct_prediction_count > 0;

create index if not exists idx_predictions_match_scoring_pending
  on public.predictions(match_id)
  where result_points_applied = false;

create or replace function public.score_finished_match(p_match_id uuid)
returns table (
  match_id uuid,
  predictions_scored integer,
  profiles_updated integer,
  total_points_awarded integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
begin
  select *
  into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match % not found', p_match_id;
  end if;

  if v_match.status::text <> 'finished' then
    raise exception 'Match % must have status finished before scoring', p_match_id;
  end if;

  if v_match.home_score is null or v_match.away_score is null then
    raise exception 'Match % must have both home_score and away_score before scoring', p_match_id;
  end if;

  return query
  with scored as (
    select
      p.id,
      p.user_id,
      coalesce(p.points, p.points_awarded, 0) as previous_points,
      coalesce(p.result_points_applied, false) as previously_applied,
      case
        when p.home_score = v_match.home_score and p.away_score = v_match.away_score then 5
        when sign(p.home_score - p.away_score) = sign(v_match.home_score - v_match.away_score) then 2
        else 0
      end as next_points,
      case
        when p.home_score = v_match.home_score and p.away_score = v_match.away_score then 'exact'
        when sign(p.home_score - p.away_score) = sign(v_match.home_score - v_match.away_score) then 'result'
        else 'miss'
      end as next_outcome
    from public.predictions p
    where p.match_id = p_match_id
      and p.home_score is not null
      and p.away_score is not null
    for update of p
  ), updated_predictions as (
    update public.predictions p
    set
      points = s.next_points,
      points_awarded = s.next_points,
      scoring_outcome = s.next_outcome,
      result_points_applied = true,
      scored_at = coalesce(p.scored_at, timezone('utc', now()))
    from scored s
    where p.id = s.id
    returning
      p.user_id,
      s.previously_applied,
      s.previous_points,
      s.next_points
  ), profile_deltas as (
    select
      user_id,
      sum(case when previously_applied then next_points - previous_points else next_points end)::integer as points_delta,
      sum(case when previously_applied then 0 else 1 end)::integer as total_delta,
      sum(
        case
          when previously_applied then
            case when next_points > 0 then 1 else 0 end - case when previous_points > 0 then 1 else 0 end
          else case when next_points > 0 then 1 else 0 end
        end
      )::integer as correct_delta
    from updated_predictions
    group by user_id
  ), updated_profiles as (
    update public.profiles pr
    set
      points = greatest(0, pr.points + d.points_delta),
      total_predictions = greatest(0, pr.total_predictions + d.total_delta),
      correct_predictions = greatest(0, pr.correct_predictions + d.correct_delta),
      prediction_count = greatest(0, pr.prediction_count + d.total_delta),
      correct_prediction_count = greatest(0, pr.correct_prediction_count + d.correct_delta),
      accuracy = case
        when greatest(0, pr.total_predictions + d.total_delta) = 0 then 0
        else round(
          greatest(0, pr.correct_predictions + d.correct_delta)::numeric
          / greatest(1, pr.total_predictions + d.total_delta)::numeric
          * 100,
          2
        )
      end
    from profile_deltas d
    where pr.id = d.user_id
    returning pr.id
  )
  select
    p_match_id,
    coalesce((select count(*)::integer from updated_predictions), 0),
    coalesce((select count(*)::integer from updated_profiles), 0),
    coalesce((select sum(next_points)::integer from updated_predictions), 0);
end;
$$;

revoke all on function public.score_finished_match(uuid) from public;
revoke all on function public.score_finished_match(uuid) from anon;
revoke all on function public.score_finished_match(uuid) from authenticated;
grant execute on function public.score_finished_match(uuid) to service_role;

comment on function public.score_finished_match(uuid) is 'Server-only scoring function. Scores a finished match exactly once per prediction and applies profile deltas idempotently.';
