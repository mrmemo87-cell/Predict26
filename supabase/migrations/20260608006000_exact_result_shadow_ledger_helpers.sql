-- Exact-result shadow ledger helpers.
-- Additive-only: does not change score_finished_match, profiles.points, leaderboards,
-- prediction saving, or bonus category scoring.

create or replace function public.backfill_exact_result_scoring_ledger(p_dry_run boolean default true)
returns table (
  scoring_run_id uuid,
  dry_run boolean,
  scored_predictions_count integer,
  existing_ledger_rows_count integer,
  rows_to_insert_count integer,
  inserted_ledger_rows_count integer,
  predictions_points_sum integer,
  inserted_points_sum integer,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_scored_predictions_count integer := 0;
  v_existing_ledger_rows_count integer := 0;
  v_rows_to_insert_count integer := 0;
  v_inserted_ledger_rows_count integer := 0;
  v_predictions_points_sum integer := 0;
  v_inserted_points_sum integer := 0;
begin
  with scored_predictions as (
    select
      p.id,
      p.user_id,
      p.match_id,
      coalesce(p.points_awarded, p.points, 0)::integer as points_awarded
    from public.predictions p
    where coalesce(p.result_points_applied, false) = true
  ), existing_active_ledger as (
    select sl.id
    from scored_predictions p
    join public.scoring_ledger sl
      on sl.user_id = p.user_id
     and sl.category = 'match_exact_result'
     and sl.entity_key = 'match:' || p.match_id::text || ':exact_result:' || p.id::text
     and sl.voided_at is null
  ), missing_predictions as (
    select p.*
    from scored_predictions p
    where not exists (
      select 1
      from public.scoring_ledger sl
      where sl.user_id = p.user_id
        and sl.category = 'match_exact_result'
        and sl.entity_key = 'match:' || p.match_id::text || ':exact_result:' || p.id::text
        and sl.voided_at is null
    )
  )
  select
    coalesce((select count(*)::integer from scored_predictions), 0),
    coalesce((select count(*)::integer from existing_active_ledger), 0),
    coalesce((select count(*)::integer from missing_predictions), 0),
    coalesce((select sum(points_awarded)::integer from scored_predictions), 0),
    coalesce((select sum(points_awarded)::integer from missing_predictions), 0)
  into
    v_scored_predictions_count,
    v_existing_ledger_rows_count,
    v_rows_to_insert_count,
    v_predictions_points_sum,
    v_inserted_points_sum;

  if not p_dry_run then
    insert into public.scoring_runs (
      scope_type,
      competition_id,
      categories_requested,
      categories_completed,
      status,
      source,
      metadata
    )
    select
      'competition',
      c.id,
      array['match_exact_result']::text[],
      array[]::text[],
      'started',
      'exact_result_ledger_backfill',
      jsonb_build_object(
        'phase', '5A',
        'dry_run', false,
        'backfill_marker', 'exact_result_shadow_ledger_backfill',
        'does_not_update_profiles_points', true
      )
    from public.competitions c
    where c.slug = 'world-cup-2026'
    order by c.created_at asc
    limit 1
    returning id into v_run_id;

    if v_run_id is null then
      insert into public.scoring_runs (
        scope_type,
        competition_id,
        categories_requested,
        categories_completed,
        status,
        source,
        metadata
      )
      values (
        'competition',
        (select id from public.competitions order by created_at asc limit 1),
        array['match_exact_result']::text[],
        array[]::text[],
        'started',
        'exact_result_ledger_backfill',
        jsonb_build_object(
          'phase', '5A',
          'dry_run', false,
          'backfill_marker', 'exact_result_shadow_ledger_backfill',
          'does_not_update_profiles_points', true
        )
      )
      returning id into v_run_id;
    end if;

    with rows_to_insert as (
      select
        p.user_id,
        m.competition_id,
        p.match_id,
        p.id as prediction_id,
        'match:' || p.match_id::text || ':exact_result:' || p.id::text as entity_key,
        coalesce(p.points_awarded, p.points, 0)::integer as points,
        jsonb_build_object(
          'phase', '5A',
          'backfill', true,
          'backfill_marker', 'exact_result_shadow_ledger_backfill',
          'scoring_outcome', p.scoring_outcome,
          'predicted_home_score', p.home_score,
          'predicted_away_score', p.away_score,
          'official_home_score', m.home_score,
          'official_away_score', m.away_score,
          'result_points_applied', p.result_points_applied,
          'prediction_scored_at', p.scored_at,
          'does_not_update_profiles_points', true
        ) as metadata
      from public.predictions p
      join public.matches m on m.id = p.match_id
      where coalesce(p.result_points_applied, false) = true
        and not exists (
          select 1
          from public.scoring_ledger sl
          where sl.user_id = p.user_id
            and sl.category = 'match_exact_result'
            and sl.entity_key = 'match:' || p.match_id::text || ':exact_result:' || p.id::text
            and sl.voided_at is null
        )
    ), inserted as (
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
        user_id,
        competition_id,
        match_id,
        prediction_id,
        'match_exact_result',
        entity_key,
        points,
        'predictions',
        prediction_id,
        v_run_id,
        metadata
      from rows_to_insert
      on conflict (user_id, category, entity_key) where voided_at is null do nothing
      returning points
    )
    select
      coalesce(count(*)::integer, 0),
      coalesce(sum(points)::integer, 0)
    into v_inserted_ledger_rows_count, v_inserted_points_sum
    from inserted;

    update public.scoring_runs
    set
      categories_completed = array['match_exact_result']::text[],
      status = 'completed',
      finished_at = timezone('utc', now()),
      metadata = metadata || jsonb_build_object(
        'scored_predictions_count', v_scored_predictions_count,
        'existing_ledger_rows_count', v_existing_ledger_rows_count,
        'rows_to_insert_count', v_rows_to_insert_count,
        'inserted_ledger_rows_count', v_inserted_ledger_rows_count,
        'predictions_points_sum', v_predictions_points_sum,
        'inserted_points_sum', v_inserted_points_sum
      )
    where id = v_run_id;
  end if;

  return query select
    v_run_id,
    p_dry_run,
    v_scored_predictions_count,
    v_existing_ledger_rows_count,
    v_rows_to_insert_count,
    case when p_dry_run then 0 else v_inserted_ledger_rows_count end,
    v_predictions_points_sum,
    case when p_dry_run then v_inserted_points_sum else v_inserted_points_sum end,
    case
      when p_dry_run then 'dry_run'
      when v_inserted_ledger_rows_count = v_rows_to_insert_count then 'completed'
      else 'partial'
    end;
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
  ), ledger_points_by_user as (
    select user_id, sum(points)::integer as ledger_points
    from active_exact_ledger
    group by user_id
  ), users_to_compare as (
    select user_id from prediction_points_by_user
    union
    select user_id from ledger_points_by_user
    union
    select id as user_id from public.profiles
  ), mismatched_users as (
    select
      u.user_id,
      coalesce(pp.predictions_points, 0)::integer as predictions_points,
      coalesce(lp.ledger_points, 0)::integer as ledger_points,
      coalesce(pr.points, 0)::integer as profile_points
    from users_to_compare u
    left join prediction_points_by_user pp on pp.user_id = u.user_id
    left join ledger_points_by_user lp on lp.user_id = u.user_id
    left join public.profiles pr on pr.id = u.user_id
    where coalesce(pp.predictions_points, 0) <> coalesce(lp.ledger_points, 0)
       or coalesce(pp.predictions_points, 0) <> coalesce(pr.points, 0)
  ), mismatch_sample as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', user_id,
          'predictions_points', predictions_points,
          'ledger_points', ledger_points,
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
      coalesce((select count(*)::integer from duplicate_active_ledger), 0) as duplicate_active_ledger_rows_count
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
    case
      when s.predictions_points_sum = s.ledger_points_sum
       and s.predictions_points_sum = s.profiles_points_sum
       and s.users_with_mismatch_count = 0
       and s.missing_ledger_rows_count = 0
       and s.duplicate_active_ledger_rows_count = 0
      then 'pass'
      else 'fail'
    end as status
  from summary s;
end;
$$;

revoke all on function public.backfill_exact_result_scoring_ledger(boolean) from public;
revoke all on function public.backfill_exact_result_scoring_ledger(boolean) from anon;
revoke all on function public.backfill_exact_result_scoring_ledger(boolean) from authenticated;
grant execute on function public.backfill_exact_result_scoring_ledger(boolean) to service_role;

revoke all on function public.reconcile_exact_result_scoring_ledger() from public;
revoke all on function public.reconcile_exact_result_scoring_ledger() from anon;
revoke all on function public.reconcile_exact_result_scoring_ledger() from authenticated;
grant execute on function public.reconcile_exact_result_scoring_ledger() to service_role;

comment on function public.backfill_exact_result_scoring_ledger(boolean) is 'Service-role-only exact/result shadow ledger backfill. Idempotently inserts missing match_exact_result rows from already-scored predictions and never updates profiles.points.';
comment on function public.reconcile_exact_result_scoring_ledger() is 'Service-role-only exact/result ledger reconciliation summary. Compares active match_exact_result ledger rows, already-scored prediction points, and profiles.points without mutating user totals.';

notify pgrst, 'reload schema';
