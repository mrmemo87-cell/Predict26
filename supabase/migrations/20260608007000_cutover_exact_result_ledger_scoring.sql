-- Phase 5B: cut over exact-result match scoring to the scoring ledger.
-- Non-destructive: keeps prediction compatibility fields and user-facing read paths intact.

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
  v_ledger_rows_upserted integer := 0;
  v_stale_ledger_rows_voided integer := 0;
  v_profiles_points_updated integer := 0;
  v_profiles_accuracy_updated integer := 0;
  v_leaderboards_upserted integer := 0;
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
    status,
    source,
    metadata
  ) values (
    'match',
    p_match_id,
    v_match.competition_id,
    array['match_exact_result']::text[],
    array[]::text[],
    'started',
    'score_finished_match',
    jsonb_build_object(
      'phase', '5B',
      'cutover', 'exact_result_ledger_authoritative',
      'official_home_score', v_match.home_score,
      'official_away_score', v_match.away_score,
      'recalculates_profile_points_from_active_ledger', true,
      'preserves_prediction_compatibility_fields', true
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
        'phase', '5B',
        'cutover', 'exact_result_ledger_authoritative',
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
        'phase', '5B',
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
    v_total_points_awarded,
    v_ledger_rows_upserted,
    v_stale_ledger_rows_voided;

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
  into v_profiles_points_updated
  from updated_profile_points;

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

  update public.scoring_runs sr
  set
    categories_completed = array['match_exact_result']::text[],
    status = 'completed',
    finished_at = timezone('utc', now()),
    metadata = sr.metadata || jsonb_build_object(
      'predictions_scored', v_predictions_scored,
      'ledger_rows_upserted', v_ledger_rows_upserted,
      'stale_ledger_rows_voided', v_stale_ledger_rows_voided,
      'profiles_points_updated', v_profiles_points_updated,
      'profiles_accuracy_updated', v_profiles_accuracy_updated,
      'leaderboards_upserted', v_leaderboards_upserted,
      'total_points_awarded', v_total_points_awarded
    )
  where sr.id = v_run_id;

  return query select
    p_match_id,
    v_predictions_scored,
    v_profiles_points_updated,
    v_total_points_awarded;
end;
$$;

revoke all on function public.score_finished_match(uuid) from public;
revoke all on function public.score_finished_match(uuid) from anon;
revoke all on function public.score_finished_match(uuid) from authenticated;
grant execute on function public.score_finished_match(uuid) to service_role;

comment on function public.score_finished_match(uuid) is 'Server-only scoring function. Scores or rescores a finished match by upserting authoritative match_exact_result ledger rows, recalculating profile points from active ledger rows, preserving prediction compatibility fields, and refreshing leaderboards.';

drop function if exists public.reconcile_exact_result_scoring_ledger();

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
  ), active_non_exact_ledger as (
    select sl.id, sl.user_id, sl.points
    from public.scoring_ledger sl
    where sl.category <> 'match_exact_result'
      and sl.voided_at is null
  ), active_ledger_totals_by_user as (
    select user_id, sum(points)::integer as ledger_points
    from public.scoring_ledger
    where voided_at is null
    group by user_id
  ), missing_ledger as (
    select p.id
    from scored_predictions p
    where not exists (
      select 1
      from active_exact_ledger sl
      where sl.user_id = p.user_id
        and sl.prediction_id = p.id
        and sl.entity_key = p.expected_entity_key
    )
  ), duplicate_active_ledger as (
    select user_id, category, entity_key, count(*)::integer as row_count
    from public.scoring_ledger
    where category = 'match_exact_result'
      and voided_at is null
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
      coalesce((select count(*)::integer from missing_ledger), 0) as missing_ledger_rows_count,
      coalesce((select count(*)::integer from duplicate_active_ledger), 0) as duplicate_active_ledger_rows_count,
      coalesce((select count(*)::integer from active_non_exact_ledger), 0) as unexpected_active_non_exact_ledger_rows_count,
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

revoke all on function public.reconcile_exact_result_scoring_ledger() from public;
revoke all on function public.reconcile_exact_result_scoring_ledger() from anon;
revoke all on function public.reconcile_exact_result_scoring_ledger() from authenticated;
grant execute on function public.reconcile_exact_result_scoring_ledger() to service_role;

comment on function public.reconcile_exact_result_scoring_ledger() is 'Service-role-only exact/result ledger reconciliation summary for Phase 5B. Compares exact-result prediction points to active match_exact_result ledger rows, compares profile points to all active ledger rows, and fails if active non-exact ledger rows exist before bonus scoring phases.';

notify pgrst, 'reload schema';
