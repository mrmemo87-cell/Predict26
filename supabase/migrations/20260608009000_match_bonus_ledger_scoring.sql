-- Phase 5C.2: score match bonus predictions through the authoritative scoring ledger.
-- Additive/non-destructive: no Champion Pick scoring, no prediction-saving changes,
-- no leaderboard read-path changes, and exact-result 5/2/0 behavior is preserved.

create or replace function public.refresh_profile_points_from_active_ledger()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profiles_updated integer := 0;
begin
  with ledger_totals as (
    select
      pr.id as user_id,
      coalesce(sum(sl.points) filter (where sl.voided_at is null), 0)::integer as ledger_points
    from public.profiles pr
    left join public.scoring_ledger sl
      on sl.user_id = pr.id
     and sl.voided_at is null
    group by pr.id
  ), updated_profile_points as (
    update public.profiles pr
    set points = greatest(0, lt.ledger_points)
    from ledger_totals lt
    where pr.id = lt.user_id
      and pr.points is distinct from greatest(0, lt.ledger_points)
    returning pr.id
  )
  select coalesce(count(*)::integer, 0)
  into v_profiles_updated
  from updated_profile_points;

  return v_profiles_updated;
end;
$$;

create or replace function public.refresh_leaderboards_from_profiles()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leaderboards_upserted integer := 0;
begin
  with referral_totals as (
    select
      referrer_id as user_id,
      count(*)::integer as referral_count
    from public.referrals
    group by referrer_id
  ), ranked_profiles as (
    select
      pr.id as user_id,
      row_number() over (order by pr.points desc, pr.created_at asc, pr.id asc)::integer as global_rank,
      row_number() over (partition by pr.country_code order by pr.points desc, pr.created_at asc, pr.id asc)::integer as country_rank,
      row_number() over (order by coalesce(rt.referral_count, 0) desc, pr.created_at asc, pr.id asc)::integer as referral_rank,
      coalesce(rt.referral_count, 0) as referral_count
    from public.profiles pr
    left join referral_totals rt on rt.user_id = pr.id
  ), upserted_leaderboards as (
    insert into public.leaderboards (
      user_id,
      global_rank,
      country_rank,
      referral_rank,
      referral_count,
      calculated_at
    )
    select
      user_id,
      global_rank,
      country_rank,
      referral_rank,
      referral_count,
      timezone('utc', now())
    from ranked_profiles
    on conflict (user_id) do update
    set
      global_rank = excluded.global_rank,
      country_rank = excluded.country_rank,
      referral_rank = excluded.referral_rank,
      referral_count = excluded.referral_count,
      calculated_at = excluded.calculated_at
    returning user_id
  )
  select coalesce(count(*)::integer, 0)
  into v_leaderboards_upserted
  from upserted_leaderboards;

  return v_leaderboards_upserted;
end;
$$;

create or replace function public.score_match_possession_bonus(
  p_match_id uuid,
  p_competition_id uuid,
  p_scoring_run_id uuid
)
returns table (
  category_key text,
  completed boolean,
  skip_reason text,
  predictions_evaluated integer,
  ledger_rows_upserted integer,
  stale_ledger_rows_voided integer,
  points_awarded integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ready boolean := false;
  v_skip_reason text;
  v_home_percent numeric;
  v_away_percent numeric;
  v_winner text;
  v_predictions_evaluated integer := 0;
  v_ledger_rows_upserted integer := 0;
  v_stale_rows_voided integer := 0;
  v_points_awarded integer := 0;
begin
  select
    readiness.possession_ready,
    readiness.possession_skip_reason,
    readiness.possession_home_percent,
    readiness.possession_away_percent
  into
    v_ready,
    v_skip_reason,
    v_home_percent,
    v_away_percent
  from public.get_match_bonus_scoring_readiness(p_match_id) readiness;

  if not coalesce(v_ready, false) then
    update public.scoring_ledger sl
    set
      voided_at = timezone('utc', now()),
      void_reason = 'match_possession_official_data_not_ready',
      scoring_run_id = p_scoring_run_id,
      metadata = sl.metadata || jsonb_build_object(
        'phase', '5C.2',
        'voided_by', 'score_finished_match',
        'reason', coalesce(v_skip_reason, 'not_ready')
      )
    where sl.match_id = p_match_id
      and sl.category = 'match_possession'
      and sl.voided_at is null;

    get diagnostics v_stale_rows_voided = row_count;

    return query select
      'match_possession'::text,
      false,
      coalesce(v_skip_reason, 'not_ready'),
      0,
      0,
      v_stale_rows_voided,
      0;
    return;
  end if;

  v_winner := case
    when v_home_percent > v_away_percent then 'home_more'
    when v_away_percent > v_home_percent then 'away_more'
    else 'equal_50_50'
  end;

  with evaluated as (
    select
      pp.id,
      pp.user_id,
      pp.match_id,
      pp.choice,
      'match:' || pp.match_id::text || ':possession' as entity_key,
      case when pp.choice = v_winner then 1 else 0 end::integer as next_points
    from public.prediction_possession pp
    where pp.match_id = p_match_id
    for update of pp
  ), upserted_ledger as (
    insert into public.scoring_ledger (
      user_id,
      competition_id,
      match_id,
      prediction_id,
      category,
      entity_key,
      points,
      source_table,
      source_id,
      scoring_run_id,
      metadata
    )
    select
      e.user_id,
      p_competition_id,
      e.match_id,
      null,
      'match_possession',
      e.entity_key,
      e.next_points,
      'prediction_possession',
      e.id,
      p_scoring_run_id,
      jsonb_build_object(
        'phase', '5C.2',
        'category_result', 'evaluated',
        'scoring_outcome', case when e.next_points = 1 then 'hit' else 'miss' end,
        'predicted_choice', e.choice,
        'official_possession_home', v_home_percent,
        'official_possession_away', v_away_percent,
        'official_possession_winner', v_winner,
        'points_rule', '1_for_correct_possession_direction'
      )
    from evaluated e
    on conflict (user_id, category, entity_key) where voided_at is null do update
    set
      competition_id = excluded.competition_id,
      match_id = excluded.match_id,
      prediction_id = excluded.prediction_id,
      points = excluded.points,
      source_table = excluded.source_table,
      source_id = excluded.source_id,
      scoring_run_id = excluded.scoring_run_id,
      metadata = scoring_ledger.metadata || excluded.metadata
    returning id, points
  ), voided_stale as (
    update public.scoring_ledger sl
    set
      voided_at = timezone('utc', now()),
      void_reason = 'match_possession_prediction_no_longer_eligible',
      scoring_run_id = p_scoring_run_id,
      metadata = sl.metadata || jsonb_build_object(
        'phase', '5C.2',
        'voided_by', 'score_finished_match',
        'reason', 'match_possession_prediction_no_longer_eligible'
      )
    where sl.match_id = p_match_id
      and sl.category = 'match_possession'
      and sl.voided_at is null
      and not exists (
        select 1
        from evaluated e
        where e.user_id = sl.user_id
          and e.entity_key = sl.entity_key
          and e.id = sl.source_id
      )
    returning sl.id
  )
  select
    coalesce((select count(*)::integer from evaluated), 0),
    coalesce((select count(*)::integer from upserted_ledger), 0),
    coalesce((select count(*)::integer from voided_stale), 0),
    coalesce((select sum(points)::integer from upserted_ledger), 0)
  into
    v_predictions_evaluated,
    v_ledger_rows_upserted,
    v_stale_rows_voided,
    v_points_awarded;

  return query select
    'match_possession'::text,
    true,
    null::text,
    v_predictions_evaluated,
    v_ledger_rows_upserted,
    v_stale_rows_voided,
    v_points_awarded;
end;
$$;

create or replace function public.score_match_scorer_bonus(
  p_match_id uuid,
  p_competition_id uuid,
  p_scoring_run_id uuid
)
returns table (
  category_key text,
  completed boolean,
  skip_reason text,
  predictions_evaluated integer,
  ledger_rows_upserted integer,
  stale_ledger_rows_voided integer,
  points_awarded integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ready boolean := false;
  v_skip_reason text;
  v_predictions_evaluated integer := 0;
  v_ledger_rows_upserted integer := 0;
  v_stale_rows_voided integer := 0;
  v_points_awarded integer := 0;
begin
  select
    readiness.scorers_ready,
    readiness.scorers_skip_reason
  into
    v_ready,
    v_skip_reason
  from public.get_match_bonus_scoring_readiness(p_match_id) readiness;

  if not coalesce(v_ready, false) then
    update public.scoring_ledger sl
    set
      voided_at = timezone('utc', now()),
      void_reason = 'match_scorer_official_data_not_ready',
      scoring_run_id = p_scoring_run_id,
      metadata = sl.metadata || jsonb_build_object(
        'phase', '5C.2',
        'voided_by', 'score_finished_match',
        'reason', coalesce(v_skip_reason, 'not_ready')
      )
    where sl.match_id = p_match_id
      and sl.category = 'match_scorer'
      and sl.voided_at is null;

    get diagnostics v_stale_rows_voided = row_count;

    return query select
      'match_scorer'::text,
      false,
      coalesce(v_skip_reason, 'not_ready'),
      0,
      0,
      v_stale_rows_voided,
      0;
    return;
  end if;

  with official_scorers as (
    select distinct me.player_id
    from public.match_events me
    where me.match_id = p_match_id
      and lower(me.event_type) in ('goal', 'penalty_goal')
      and me.player_id is not null
  ), evaluated as (
    select
      ps.id,
      ps.user_id,
      ps.match_id,
      ps.player_id,
      ps.team_code,
      ps.slot,
      'match:' || ps.match_id::text || ':scorer:' || ps.player_id::text as entity_key,
      case when os.player_id is not null then 1 else 0 end::integer as next_points
    from public.prediction_scorers ps
    left join official_scorers os on os.player_id = ps.player_id
    where ps.match_id = p_match_id
    for update of ps
  ), upserted_ledger as (
    insert into public.scoring_ledger (
      user_id,
      competition_id,
      match_id,
      prediction_id,
      category,
      entity_key,
      points,
      source_table,
      source_id,
      scoring_run_id,
      metadata
    )
    select
      e.user_id,
      p_competition_id,
      e.match_id,
      null,
      'match_scorer',
      e.entity_key,
      e.next_points,
      'prediction_scorers',
      e.id,
      p_scoring_run_id,
      jsonb_build_object(
        'phase', '5C.2',
        'category_result', 'evaluated',
        'scoring_outcome', case when e.next_points = 1 then 'hit' else 'miss' end,
        'selected_player_id', e.player_id,
        'selected_player_scored', e.next_points = 1,
        'selected_team_code', e.team_code,
        'slot', e.slot,
        'normal_goal_event_types', jsonb_build_array('goal', 'penalty_goal'),
        'excluded_goal_event_types', jsonb_build_array('own_goal'),
        'points_rule', '1_per_selected_player_who_scores_at_least_once'
      )
    from evaluated e
    on conflict (user_id, category, entity_key) where voided_at is null do update
    set
      competition_id = excluded.competition_id,
      match_id = excluded.match_id,
      prediction_id = excluded.prediction_id,
      points = excluded.points,
      source_table = excluded.source_table,
      source_id = excluded.source_id,
      scoring_run_id = excluded.scoring_run_id,
      metadata = scoring_ledger.metadata || excluded.metadata
    returning id, points
  ), voided_stale as (
    update public.scoring_ledger sl
    set
      voided_at = timezone('utc', now()),
      void_reason = 'match_scorer_prediction_no_longer_eligible',
      scoring_run_id = p_scoring_run_id,
      metadata = sl.metadata || jsonb_build_object(
        'phase', '5C.2',
        'voided_by', 'score_finished_match',
        'reason', 'match_scorer_prediction_no_longer_eligible'
      )
    where sl.match_id = p_match_id
      and sl.category = 'match_scorer'
      and sl.voided_at is null
      and not exists (
        select 1
        from evaluated e
        where e.user_id = sl.user_id
          and e.entity_key = sl.entity_key
          and e.id = sl.source_id
      )
    returning sl.id
  )
  select
    coalesce((select count(*)::integer from evaluated), 0),
    coalesce((select count(*)::integer from upserted_ledger), 0),
    coalesce((select count(*)::integer from voided_stale), 0),
    coalesce((select sum(points)::integer from upserted_ledger), 0)
  into
    v_predictions_evaluated,
    v_ledger_rows_upserted,
    v_stale_rows_voided,
    v_points_awarded;

  return query select
    'match_scorer'::text,
    true,
    null::text,
    v_predictions_evaluated,
    v_ledger_rows_upserted,
    v_stale_rows_voided,
    v_points_awarded;
end;
$$;

create or replace function public.score_match_lineup_bonus_side(
  p_match_id uuid,
  p_competition_id uuid,
  p_team_side text,
  p_scoring_run_id uuid
)
returns table (
  category_key text,
  completed boolean,
  skip_reason text,
  predictions_evaluated integer,
  ledger_rows_upserted integer,
  stale_ledger_rows_voided integer,
  points_awarded integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ready boolean := false;
  v_skip_reason text;
  v_category_key text;
  v_predictions_evaluated integer := 0;
  v_ledger_rows_upserted integer := 0;
  v_stale_rows_voided integer := 0;
  v_points_awarded integer := 0;
begin
  if p_team_side not in ('home', 'away') then
    raise exception 'Invalid lineup team side: %', p_team_side;
  end if;

  v_category_key := 'match_lineup_' || p_team_side;

  select
    case when p_team_side = 'home' then readiness.lineup_home_ready else readiness.lineup_away_ready end,
    case when p_team_side = 'home' then readiness.lineup_home_skip_reason else readiness.lineup_away_skip_reason end
  into
    v_ready,
    v_skip_reason
  from public.get_match_bonus_scoring_readiness(p_match_id) readiness;

  if not coalesce(v_ready, false) then
    update public.scoring_ledger sl
    set
      voided_at = timezone('utc', now()),
      void_reason = 'match_lineup_' || p_team_side || '_official_data_not_ready',
      scoring_run_id = p_scoring_run_id,
      metadata = sl.metadata || jsonb_build_object(
        'phase', '5C.2',
        'voided_by', 'score_finished_match',
        'team_side', p_team_side,
        'reason', coalesce(v_skip_reason, 'not_ready')
      )
    where sl.match_id = p_match_id
      and sl.category = 'match_lineup'
      and sl.voided_at is null
      and sl.metadata->>'team_side' = p_team_side;

    get diagnostics v_stale_rows_voided = row_count;

    return query select
      v_category_key,
      false,
      coalesce(v_skip_reason, 'not_ready'),
      0,
      0,
      v_stale_rows_voided,
      0;
    return;
  end if;

  with official_starters as (
    select distinct ml.player_id
    from public.match_lineups ml
    where ml.match_id = p_match_id
      and ml.team_side = p_team_side
      and ml.is_starter
      and ml.player_id is not null
  ), predicted_lineups as (
    select
      pl.id,
      pl.user_id,
      pl.match_id,
      pl.team_side,
      pl.team_code,
      'match:' || pl.match_id::text || ':lineup:' || pl.team_side as entity_key
    from public.prediction_lineups pl
    where pl.match_id = p_match_id
      and pl.team_side = p_team_side
      and pl.is_submitted
    for update of pl
  ), evaluated as (
    select
      pl.id,
      pl.user_id,
      pl.match_id,
      pl.team_side,
      pl.team_code,
      pl.entity_key,
      count(distinct plp.player_id) filter (where os.player_id is not null)::integer as correct_starters_count,
      case
        when count(distinct plp.player_id) filter (where os.player_id is not null) = 11 then 3
        when count(distinct plp.player_id) filter (where os.player_id is not null) between 9 and 10 then 2
        when count(distinct plp.player_id) filter (where os.player_id is not null) between 7 and 8 then 1
        else 0
      end::integer as next_points
    from predicted_lineups pl
    left join public.prediction_lineup_players plp on plp.prediction_lineup_id = pl.id
    left join official_starters os on os.player_id = plp.player_id
    group by pl.id, pl.user_id, pl.match_id, pl.team_side, pl.team_code, pl.entity_key
  ), upserted_ledger as (
    insert into public.scoring_ledger (
      user_id,
      competition_id,
      match_id,
      prediction_id,
      category,
      entity_key,
      points,
      source_table,
      source_id,
      scoring_run_id,
      metadata
    )
    select
      e.user_id,
      p_competition_id,
      e.match_id,
      null,
      'match_lineup',
      e.entity_key,
      e.next_points,
      'prediction_lineups',
      e.id,
      p_scoring_run_id,
      jsonb_build_object(
        'phase', '5C.2',
        'category_result', 'evaluated',
        'team_side', e.team_side,
        'team_code', e.team_code,
        'correct_starters_count', e.correct_starters_count,
        'points_rule', '3_for_11_2_for_9_or_10_1_for_7_or_8_0_for_fewer_than_7'
      )
    from evaluated e
    on conflict (user_id, category, entity_key) where voided_at is null do update
    set
      competition_id = excluded.competition_id,
      match_id = excluded.match_id,
      prediction_id = excluded.prediction_id,
      points = excluded.points,
      source_table = excluded.source_table,
      source_id = excluded.source_id,
      scoring_run_id = excluded.scoring_run_id,
      metadata = scoring_ledger.metadata || excluded.metadata
    returning id, points
  ), voided_stale as (
    update public.scoring_ledger sl
    set
      voided_at = timezone('utc', now()),
      void_reason = 'match_lineup_' || p_team_side || '_prediction_no_longer_eligible',
      scoring_run_id = p_scoring_run_id,
      metadata = sl.metadata || jsonb_build_object(
        'phase', '5C.2',
        'voided_by', 'score_finished_match',
        'team_side', p_team_side,
        'reason', 'match_lineup_' || p_team_side || '_prediction_no_longer_eligible'
      )
    where sl.match_id = p_match_id
      and sl.category = 'match_lineup'
      and sl.voided_at is null
      and sl.metadata->>'team_side' = p_team_side
      and not exists (
        select 1
        from evaluated e
        where e.user_id = sl.user_id
          and e.entity_key = sl.entity_key
          and e.id = sl.source_id
      )
    returning sl.id
  )
  select
    coalesce((select count(*)::integer from evaluated), 0),
    coalesce((select count(*)::integer from upserted_ledger), 0),
    coalesce((select count(*)::integer from voided_stale), 0),
    coalesce((select sum(points)::integer from upserted_ledger), 0)
  into
    v_predictions_evaluated,
    v_ledger_rows_upserted,
    v_stale_rows_voided,
    v_points_awarded;

  return query select
    v_category_key,
    true,
    null::text,
    v_predictions_evaluated,
    v_ledger_rows_upserted,
    v_stale_rows_voided,
    v_points_awarded;
end;
$$;

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
  v_run_id uuid;
  v_predictions_scored integer := 0;
  v_total_points_awarded integer := 0;
  v_exact_points_awarded integer := 0;
  v_bonus_points_awarded integer := 0;
  v_ledger_rows_upserted integer := 0;
  v_exact_ledger_rows_upserted integer := 0;
  v_bonus_ledger_rows_upserted integer := 0;
  v_stale_ledger_rows_voided integer := 0;
  v_exact_stale_rows_voided integer := 0;
  v_bonus_stale_rows_voided integer := 0;
  v_profiles_points_updated integer := 0;
  v_profiles_accuracy_updated integer := 0;
  v_leaderboards_upserted integer := 0;
  v_categories_requested text[] := array['match_exact_result', 'match_possession', 'match_scorer', 'match_lineup_home', 'match_lineup_away']::text[];
  v_categories_completed text[] := array[]::text[];
  v_categories_skipped jsonb := '{}'::jsonb;
  v_bonus_result record;
  v_run_status text := 'completed';
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

  insert into public.scoring_runs (
    scope_type,
    match_id,
    competition_id,
    categories_requested,
    categories_completed,
    categories_skipped,
    status,
    source,
    metadata
  ) values (
    'match',
    p_match_id,
    v_match.competition_id,
    v_categories_requested,
    array[]::text[],
    '{}'::jsonb,
    'started',
    'score_finished_match',
    jsonb_build_object(
      'phase', '5C.2',
      'cutover', 'match_bonus_ledger_scoring',
      'official_home_score', v_match.home_score,
      'official_away_score', v_match.away_score,
      'recalculates_profile_points_from_active_ledger', true,
      'preserves_prediction_compatibility_fields', true,
      'champion_pick_scoring_included', false
    )
  ) returning id into v_run_id;

  with scored as (
    select
      p.id,
      p.user_id,
      p.match_id,
      v_match.competition_id as competition_id,
      p.home_score as predicted_home_score,
      p.away_score as predicted_away_score,
      coalesce(p.points, p.points_awarded, 0)::integer as previous_points,
      p.scoring_outcome as previous_outcome,
      coalesce(p.result_points_applied, false) as previously_applied,
      p.scored_at as previous_scored_at,
      'match:' || p.match_id::text || ':exact_result:' || p.id::text as entity_key,
      case
        when p.home_score = v_match.home_score and p.away_score = v_match.away_score then 5
        when sign(p.home_score - p.away_score) = sign(v_match.home_score - v_match.away_score) then 2
        else 0
      end::integer as next_points,
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
      p.id,
      p.user_id,
      p.match_id,
      s.competition_id,
      s.predicted_home_score,
      s.predicted_away_score,
      s.previous_points,
      s.previous_outcome,
      s.previously_applied,
      s.previous_scored_at,
      s.entity_key,
      s.next_points,
      s.next_outcome,
      p.scored_at
  ), upserted_ledger as (
    insert into public.scoring_ledger (
      user_id,
      competition_id,
      match_id,
      prediction_id,
      category,
      entity_key,
      points,
      source_table,
      source_id,
      scoring_run_id,
      metadata
    )
    select
      up.user_id,
      up.competition_id,
      up.match_id,
      up.id,
      'match_exact_result',
      up.entity_key,
      up.next_points,
      'predictions',
      up.id,
      v_run_id,
      jsonb_build_object(
        'phase', '5C.2',
        'cutover', 'match_bonus_ledger_scoring',
        'scoring_outcome', up.next_outcome,
        'predicted_home_score', up.predicted_home_score,
        'predicted_away_score', up.predicted_away_score,
        'official_home_score', v_match.home_score,
        'official_away_score', v_match.away_score,
        'previous_points', up.previous_points,
        'previous_scoring_outcome', up.previous_outcome,
        'previously_applied', up.previously_applied,
        'previous_scored_at', up.previous_scored_at,
        'prediction_scored_at', up.scored_at,
        'rescore', up.previously_applied
      )
    from updated_predictions up
    on conflict (user_id, category, entity_key) where voided_at is null do update
    set
      competition_id = excluded.competition_id,
      match_id = excluded.match_id,
      prediction_id = excluded.prediction_id,
      points = excluded.points,
      source_table = excluded.source_table,
      source_id = excluded.source_id,
      scoring_run_id = excluded.scoring_run_id,
      metadata = scoring_ledger.metadata || excluded.metadata
    returning id, user_id, points
  ), voided_stale_ledger as (
    update public.scoring_ledger sl
    set
      voided_at = timezone('utc', now()),
      void_reason = 'match_exact_result_rescore_no_longer_eligible',
      scoring_run_id = v_run_id,
      metadata = sl.metadata || jsonb_build_object(
        'phase', '5C.2',
        'voided_by', 'score_finished_match',
        'reason', 'match_exact_result_rescore_no_longer_eligible',
        'official_home_score', v_match.home_score,
        'official_away_score', v_match.away_score
      )
    where sl.match_id = p_match_id
      and sl.category = 'match_exact_result'
      and sl.voided_at is null
      and not exists (
        select 1
        from scored s
        where s.user_id = sl.user_id
          and s.id = sl.prediction_id
          and s.entity_key = sl.entity_key
      )
    returning sl.id, sl.user_id, sl.points
  )
  select
    coalesce((select count(*)::integer from updated_predictions), 0),
    coalesce((select sum(next_points)::integer from updated_predictions), 0),
    coalesce((select count(*)::integer from upserted_ledger), 0),
    coalesce((select count(*)::integer from voided_stale_ledger), 0)
  into
    v_predictions_scored,
    v_exact_points_awarded,
    v_exact_ledger_rows_upserted,
    v_exact_stale_rows_voided;

  v_categories_completed := array_append(v_categories_completed, 'match_exact_result');

  for v_bonus_result in
    select * from public.score_match_possession_bonus(p_match_id, v_match.competition_id, v_run_id)
    union all
    select * from public.score_match_scorer_bonus(p_match_id, v_match.competition_id, v_run_id)
    union all
    select * from public.score_match_lineup_bonus_side(p_match_id, v_match.competition_id, 'home', v_run_id)
    union all
    select * from public.score_match_lineup_bonus_side(p_match_id, v_match.competition_id, 'away', v_run_id)
  loop
    v_bonus_points_awarded := v_bonus_points_awarded + coalesce(v_bonus_result.points_awarded, 0);
    v_bonus_ledger_rows_upserted := v_bonus_ledger_rows_upserted + coalesce(v_bonus_result.ledger_rows_upserted, 0);
    v_bonus_stale_rows_voided := v_bonus_stale_rows_voided + coalesce(v_bonus_result.stale_ledger_rows_voided, 0);

    if v_bonus_result.completed then
      v_categories_completed := array_append(v_categories_completed, v_bonus_result.category_key);
    else
      v_categories_skipped := v_categories_skipped || jsonb_build_object(
        v_bonus_result.category_key,
        jsonb_build_object(
          'reason', coalesce(v_bonus_result.skip_reason, 'not_ready'),
          'stale_rows_voided', coalesce(v_bonus_result.stale_ledger_rows_voided, 0),
          'predictions_evaluated', coalesce(v_bonus_result.predictions_evaluated, 0),
          'ledger_rows_upserted', coalesce(v_bonus_result.ledger_rows_upserted, 0)
        )
      );
    end if;
  end loop;

  v_total_points_awarded := v_exact_points_awarded + v_bonus_points_awarded;
  v_ledger_rows_upserted := v_exact_ledger_rows_upserted + v_bonus_ledger_rows_upserted;
  v_stale_ledger_rows_voided := v_exact_stale_rows_voided + v_bonus_stale_rows_voided;

  v_profiles_points_updated := public.refresh_profile_points_from_active_ledger();

  with profile_prediction_stats as (
    select
      pr.id as user_id,
      count(p.id) filter (
        where coalesce(p.result_points_applied, false)
          or p.scoring_outcome is not null
          or p.scored_at is not null
          or p.result::text <> 'pending'
      )::integer as scored_predictions,
      count(p.id) filter (
        where (
          coalesce(p.result_points_applied, false)
          or p.scoring_outcome is not null
          or p.scored_at is not null
          or p.result::text <> 'pending'
        ) and (
          coalesce(p.points, 0) > 0
          or coalesce(p.points_awarded, 0) > 0
          or coalesce(p.points_earned, 0) > 0
          or p.scoring_outcome in ('exact', 'result')
          or p.result::text = 'correct'
        )
      )::integer as correct_predictions
    from public.profiles pr
    left join public.predictions p on p.user_id = pr.id
    group by pr.id
  ), updated_profile_accuracy as (
    update public.profiles pr
    set
      total_predictions = stats.scored_predictions,
      prediction_count = stats.scored_predictions,
      correct_predictions = stats.correct_predictions,
      correct_prediction_count = stats.correct_predictions,
      accuracy = case
        when stats.scored_predictions = 0 then 0
        else round(stats.correct_predictions::numeric / stats.scored_predictions::numeric * 100, 2)
      end
    from profile_prediction_stats stats
    where pr.id = stats.user_id
      and (
        pr.total_predictions is distinct from stats.scored_predictions
        or pr.prediction_count is distinct from stats.scored_predictions
        or pr.correct_predictions is distinct from stats.correct_predictions
        or pr.correct_prediction_count is distinct from stats.correct_predictions
        or pr.accuracy is distinct from case
          when stats.scored_predictions = 0 then 0
          else round(stats.correct_predictions::numeric / stats.scored_predictions::numeric * 100, 2)
        end
      )
    returning pr.id
  )
  select coalesce(count(*)::integer, 0)
  into v_profiles_accuracy_updated
  from updated_profile_accuracy;

  v_leaderboards_upserted := public.refresh_leaderboards_from_profiles();
  v_run_status := case when v_categories_skipped = '{}'::jsonb then 'completed' else 'partial' end;

  update public.scoring_runs sr
  set
    categories_completed = v_categories_completed,
    categories_skipped = v_categories_skipped,
    status = v_run_status,
    finished_at = timezone('utc', now()),
    metadata = sr.metadata || jsonb_build_object(
      'predictions_scored', v_predictions_scored,
      'ledger_rows_upserted', v_ledger_rows_upserted,
      'exact_ledger_rows_upserted', v_exact_ledger_rows_upserted,
      'bonus_ledger_rows_upserted', v_bonus_ledger_rows_upserted,
      'stale_ledger_rows_voided', v_stale_ledger_rows_voided,
      'exact_stale_rows_voided', v_exact_stale_rows_voided,
      'bonus_stale_rows_voided', v_bonus_stale_rows_voided,
      'profiles_points_updated', v_profiles_points_updated,
      'profiles_accuracy_updated', v_profiles_accuracy_updated,
      'leaderboards_upserted', v_leaderboards_upserted,
      'exact_points_awarded', v_exact_points_awarded,
      'bonus_points_awarded', v_bonus_points_awarded,
      'total_points_awarded', v_total_points_awarded
    )
  where sr.id = v_run_id;

  return query select
    p_match_id,
    v_predictions_scored,
    v_profiles_points_updated,
    v_total_points_awarded;
exception
  when others then
    if v_run_id is not null then
      update public.scoring_runs sr
      set
        status = 'failed',
        finished_at = timezone('utc', now()),
        metadata = sr.metadata || jsonb_build_object(
          'error', sqlerrm,
          'sqlstate', sqlstate,
          'phase', '5C.2'
        )
      where sr.id = v_run_id;
    end if;
    raise;
end;
$$;

create or replace function public.reconcile_exact_result_scoring_ledger()
returns table (
  scored_predictions_count integer,
  exact_result_ledger_rows_count integer,
  predictions_points_sum integer,
  ledger_points_sum integer,
  profiles_points_sum integer,
  users_with_mismatch_count integer,
  users_with_mismatch jsonb,
  missing_ledger_rows_count integer,
  duplicate_active_ledger_rows_count integer,
  unexpected_active_non_exact_ledger_rows_count integer,
  active_ledger_points_sum integer,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed_active_categories constant text[] := array['match_exact_result', 'match_possession', 'match_scorer', 'match_lineup'];
begin
  return query
  with scored_predictions as (
    select
      p.id,
      p.user_id,
      p.match_id,
      coalesce(p.points_awarded, p.points, 0)::integer as points_awarded,
      'match:' || p.match_id::text || ':exact_result:' || p.id::text as expected_entity_key
    from public.predictions p
    where coalesce(p.result_points_applied, false) = true
  ), active_exact_ledger as (
    select
      sl.id,
      sl.user_id,
      sl.match_id,
      sl.prediction_id,
      sl.entity_key,
      sl.points
    from public.scoring_ledger sl
    where sl.category = 'match_exact_result'
      and sl.voided_at is null
  ), unexpected_active_categories as (
    select sl.id, sl.user_id, sl.points, sl.category
    from public.scoring_ledger sl
    where sl.category <> all(v_allowed_active_categories)
      and sl.voided_at is null
  ), active_ledger_totals_by_user as (
    select user_id, sum(points)::integer as ledger_points
    from public.scoring_ledger
    where voided_at is null
    group by user_id
  ), missing_or_mismatched_exact_ledger as (
    select p.id
    from scored_predictions p
    where not exists (
      select 1
      from active_exact_ledger sl
      where sl.user_id = p.user_id
        and sl.prediction_id = p.id
        and sl.entity_key = p.expected_entity_key
        and sl.points = p.points_awarded
    )
  ), duplicate_active_ledger as (
    select user_id, category, entity_key, count(*)::integer as row_count
    from public.scoring_ledger
    where voided_at is null
    group by user_id, category, entity_key
    having count(*) > 1
  ), prediction_points_by_user as (
    select user_id, sum(points_awarded)::integer as predictions_points
    from scored_predictions
    group by user_id
  ), exact_ledger_points_by_user as (
    select user_id, sum(points)::integer as exact_ledger_points
    from active_exact_ledger
    group by user_id
  ), users_to_compare as (
    select user_id from prediction_points_by_user
    union
    select user_id from exact_ledger_points_by_user
    union
    select user_id from active_ledger_totals_by_user
    union
    select id as user_id from public.profiles
  ), mismatched_users as (
    select
      u.user_id,
      coalesce(pp.predictions_points, 0)::integer as predictions_points,
      coalesce(elp.exact_ledger_points, 0)::integer as ledger_points,
      coalesce(alt.ledger_points, 0)::integer as active_ledger_points,
      coalesce(pr.points, 0)::integer as profile_points
    from users_to_compare u
    left join prediction_points_by_user pp on pp.user_id = u.user_id
    left join exact_ledger_points_by_user elp on elp.user_id = u.user_id
    left join active_ledger_totals_by_user alt on alt.user_id = u.user_id
    left join public.profiles pr on pr.id = u.user_id
    where coalesce(pp.predictions_points, 0) <> coalesce(elp.exact_ledger_points, 0)
       or coalesce(alt.ledger_points, 0) <> coalesce(pr.points, 0)
  ), mismatch_sample as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', user_id,
          'predictions_points', predictions_points,
          'ledger_points', ledger_points,
          'active_ledger_points', active_ledger_points,
          'profile_points', profile_points
        )
        order by user_id
      ),
      '[]'::jsonb
    ) as users
    from (
      select *
      from mismatched_users
      order by user_id
      limit 50
    ) limited_mismatches
  ), summary as (
    select
      coalesce((select count(*)::integer from scored_predictions), 0) as scored_predictions_count,
      coalesce((select count(*)::integer from active_exact_ledger), 0) as exact_result_ledger_rows_count,
      coalesce((select sum(points_awarded)::integer from scored_predictions), 0) as predictions_points_sum,
      coalesce((select sum(points)::integer from active_exact_ledger), 0) as ledger_points_sum,
      coalesce((select sum(points)::integer from public.profiles), 0) as profiles_points_sum,
      coalesce((select count(*)::integer from mismatched_users), 0) as users_with_mismatch_count,
      (select users from mismatch_sample) as users_with_mismatch,
      coalesce((select count(*)::integer from missing_or_mismatched_exact_ledger), 0) as missing_ledger_rows_count,
      coalesce((select count(*)::integer from duplicate_active_ledger), 0) as duplicate_active_ledger_rows_count,
      coalesce((select count(*)::integer from unexpected_active_categories), 0) as unexpected_active_non_exact_ledger_rows_count,
      coalesce((select sum(points)::integer from public.scoring_ledger where voided_at is null), 0) as active_ledger_points_sum
  )
  select
    s.scored_predictions_count,
    s.exact_result_ledger_rows_count,
    s.predictions_points_sum,
    s.ledger_points_sum,
    s.profiles_points_sum,
    s.users_with_mismatch_count,
    s.users_with_mismatch,
    s.missing_ledger_rows_count,
    s.duplicate_active_ledger_rows_count,
    s.unexpected_active_non_exact_ledger_rows_count,
    s.active_ledger_points_sum,
    case
      when s.predictions_points_sum = s.ledger_points_sum
       and s.active_ledger_points_sum = s.profiles_points_sum
       and s.users_with_mismatch_count = 0
       and s.missing_ledger_rows_count = 0
       and s.duplicate_active_ledger_rows_count = 0
       and s.unexpected_active_non_exact_ledger_rows_count = 0
      then 'pass'
      else 'fail'
    end as status
  from summary s;
end;
$$;

revoke all on function public.refresh_profile_points_from_active_ledger() from public;
revoke all on function public.refresh_profile_points_from_active_ledger() from anon;
revoke all on function public.refresh_profile_points_from_active_ledger() from authenticated;
grant execute on function public.refresh_profile_points_from_active_ledger() to service_role;

revoke all on function public.refresh_leaderboards_from_profiles() from public;
revoke all on function public.refresh_leaderboards_from_profiles() from anon;
revoke all on function public.refresh_leaderboards_from_profiles() from authenticated;
grant execute on function public.refresh_leaderboards_from_profiles() to service_role;

revoke all on function public.score_match_possession_bonus(uuid, uuid, uuid) from public;
revoke all on function public.score_match_possession_bonus(uuid, uuid, uuid) from anon;
revoke all on function public.score_match_possession_bonus(uuid, uuid, uuid) from authenticated;
grant execute on function public.score_match_possession_bonus(uuid, uuid, uuid) to service_role;

revoke all on function public.score_match_scorer_bonus(uuid, uuid, uuid) from public;
revoke all on function public.score_match_scorer_bonus(uuid, uuid, uuid) from anon;
revoke all on function public.score_match_scorer_bonus(uuid, uuid, uuid) from authenticated;
grant execute on function public.score_match_scorer_bonus(uuid, uuid, uuid) to service_role;

revoke all on function public.score_match_lineup_bonus_side(uuid, uuid, text, uuid) from public;
revoke all on function public.score_match_lineup_bonus_side(uuid, uuid, text, uuid) from anon;
revoke all on function public.score_match_lineup_bonus_side(uuid, uuid, text, uuid) from authenticated;
grant execute on function public.score_match_lineup_bonus_side(uuid, uuid, text, uuid) to service_role;

revoke all on function public.score_finished_match(uuid) from public;
revoke all on function public.score_finished_match(uuid) from anon;
revoke all on function public.score_finished_match(uuid) from authenticated;
grant execute on function public.score_finished_match(uuid) to service_role;

revoke all on function public.reconcile_exact_result_scoring_ledger() from public;
revoke all on function public.reconcile_exact_result_scoring_ledger() from anon;
revoke all on function public.reconcile_exact_result_scoring_ledger() from authenticated;
grant execute on function public.reconcile_exact_result_scoring_ledger() to service_role;

comment on function public.refresh_profile_points_from_active_ledger() is 'Service-role-only helper. Recalculates profiles.points from all active scoring_ledger rows.';
comment on function public.refresh_leaderboards_from_profiles() is 'Service-role-only helper. Refreshes leaderboard rank rows from profiles.points without changing read paths.';
comment on function public.score_match_possession_bonus(uuid, uuid, uuid) is 'Service-role-only Phase 5C.2 helper. Scores possession bonus predictions or voids stale rows when official data is not ready.';
comment on function public.score_match_scorer_bonus(uuid, uuid, uuid) is 'Service-role-only Phase 5C.2 helper. Scores normal goal/penalty scorer bonus predictions or voids stale rows when official data is not ready.';
comment on function public.score_match_lineup_bonus_side(uuid, uuid, text, uuid) is 'Service-role-only Phase 5C.2 helper. Scores one side of submitted lineup predictions or voids stale side-specific rows when official data is not ready.';
comment on function public.score_finished_match(uuid) is 'Server-only scoring function. Scores or rescores a finished match by upserting authoritative exact-result and Phase 5C.2 bonus ledger rows, recalculating profile points from active ledger rows, preserving prediction compatibility fields, and refreshing leaderboards.';
comment on function public.reconcile_exact_result_scoring_ledger() is 'Service-role-only all-active-ledger reconciliation summary. Allows active exact-result, possession, scorer, and lineup rows while validating exact-result compatibility, duplicate active ledger rows, and profile point totals.';

notify pgrst, 'reload schema';
