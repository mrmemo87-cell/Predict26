-- Champion Pick A/B official result confirmation and ledger scoring.
-- Additive-only: does not change match scoring, prediction saving, or leaderboard read paths.

create table if not exists public.tournament_results (
  id uuid primary key default gen_random_uuid(),
  competition_code text not null unique,
  competition_id uuid references public.competitions(id) on delete set null,
  champion_team_code text,
  champion_confirmed boolean not null default false,
  champion_confirmed_at timestamptz,
  champion_confirmed_by uuid references public.profiles(id) on delete set null,
  champion_source text,
  champion_notes text,
  result_version integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (length(trim(competition_code)) > 0),
  check (result_version > 0),
  check (not champion_confirmed or champion_team_code is not null),
  check (not champion_confirmed or champion_confirmed_at is not null)
);

create index if not exists idx_tournament_results_champion_confirmed
  on public.tournament_results(competition_code, champion_confirmed);

create or replace function public.validate_tournament_result_row()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_previous_team_code text;
  v_previous_confirmed boolean;
begin
  new.competition_code := upper(trim(new.competition_code));

  if new.competition_code = '' then
    raise exception 'Competition code is required.';
  end if;

  if new.champion_team_code is not null and length(trim(new.champion_team_code)) > 0 then
    new.champion_team_code := public.resolve_team_code(new.competition_code, new.champion_team_code);

    if not exists (
      select 1
      from public.competition_team_players ctp
      where ctp.competition_code = new.competition_code
        and ctp.team_code = new.champion_team_code
        and ctp.is_active
    ) then
      raise exception 'Champion team code % is not active for competition %.', new.champion_team_code, new.competition_code;
    end if;
  else
    new.champion_team_code := null;
  end if;

  if new.champion_confirmed and new.champion_team_code is null then
    raise exception 'Confirmed champion result requires a champion team.';
  end if;

  if new.champion_confirmed and new.champion_confirmed_at is null then
    new.champion_confirmed_at := timezone('utc', now());
  end if;

  if not new.champion_confirmed then
    new.champion_confirmed_at := null;
    new.champion_confirmed_by := null;
  end if;

  if tg_op = 'INSERT' then
    new.result_version := greatest(coalesce(new.result_version, 1), 1);
  else
    v_previous_team_code := old.champion_team_code;
    v_previous_confirmed := coalesce(old.champion_confirmed, false);

    new.result_version := greatest(coalesce(new.result_version, old.result_version, 1), 1);

    if v_previous_team_code is distinct from new.champion_team_code
      or v_previous_confirmed is distinct from coalesce(new.champion_confirmed, false)
    then
      new.result_version := greatest(coalesce(old.result_version, 1) + 1, new.result_version);
    end if;
  end if;

  new.updated_at := timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists tournament_results_validate on public.tournament_results;
create trigger tournament_results_validate
before insert or update on public.tournament_results
for each row execute function public.validate_tournament_result_row();

alter table public.tournament_results enable row level security;

-- No public/authenticated write policies are created. Official tournament results are
-- managed only through server-side admin actions using the service-role client.

create or replace function public.score_tournament_champion(
  p_competition_code text default 'WC2026',
  p_triggered_by uuid default null
)
returns table (
  competition_code text,
  champion_team_code text,
  picks_evaluated integer,
  ledger_rows_upserted integer,
  stale_ledger_rows_voided integer,
  profiles_updated integer,
  leaderboards_upserted integer,
  total_points_awarded integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_competition_code text := upper(trim(coalesce(p_competition_code, 'WC2026')));
  v_result public.tournament_results%rowtype;
  v_competition_id uuid;
  v_run_id uuid;
  v_categories_requested text[] := array['champion_pick_a', 'champion_pick_b'];
  v_categories_completed text[] := array[]::text[];
  v_categories_skipped jsonb := '{}'::jsonb;
  v_run_status text := 'started';
  v_picks_evaluated integer := 0;
  v_ledger_rows_upserted integer := 0;
  v_stale_rows_voided integer := 0;
  v_profiles_updated integer := 0;
  v_leaderboards_upserted integer := 0;
  v_total_points_awarded integer := 0;
  v_pick_a_entity_key text;
  v_pick_b_entity_key text;
begin
  if v_competition_code = '' then
    raise exception 'Competition code is required.';
  end if;

  v_pick_a_entity_key := 'competition:' || v_competition_code || ':champion_pick_a';
  v_pick_b_entity_key := 'competition:' || v_competition_code || ':champion_pick_b';

  select *
  into v_result
  from public.tournament_results tr
  where tr.competition_code = v_competition_code;

  v_competition_id := v_result.competition_id;

  if v_competition_id is null then
    select cfg.competition_id
    into v_competition_id
    from public.tournament_prediction_config cfg
    where cfg.competition_code = v_competition_code;
  end if;

  if v_competition_id is null and v_competition_code = 'WC2026' then
    select c.id
    into v_competition_id
    from public.competitions c
    where c.slug = 'world-cup-2026'
    limit 1;
  end if;

  if v_competition_id is null then
    raise exception 'Competition % must exist before champion scoring.', v_competition_code;
  end if;

  insert into public.scoring_runs (
    scope_type,
    competition_id,
    categories_requested,
    categories_completed,
    categories_skipped,
    status,
    triggered_by,
    source,
    metadata
  ) values (
    'competition',
    v_competition_id,
    v_categories_requested,
    array[]::text[],
    '{}'::jsonb,
    'started',
    p_triggered_by,
    'score_tournament_champion',
    jsonb_build_object(
      'phase', 'champion_pick_ledger_scoring',
      'competition_code', v_competition_code,
      'result_version', v_result.result_version,
      'champion_team_code', v_result.champion_team_code,
      'champion_confirmed', coalesce(v_result.champion_confirmed, false),
      'recalculates_profile_points_from_active_ledger', true,
      'refreshes_leaderboards_from_profiles', true
    )
  ) returning id into v_run_id;

  if not coalesce(v_result.champion_confirmed, false)
    or v_result.champion_team_code is null
  then
    update public.scoring_ledger sl
    set
      voided_at = timezone('utc', now()),
      void_reason = 'champion_result_not_confirmed',
      scoring_run_id = v_run_id,
      metadata = sl.metadata || jsonb_build_object(
        'phase', 'champion_pick_ledger_scoring',
        'voided_by', 'score_tournament_champion',
        'reason', 'champion_result_not_confirmed',
        'competition_code', v_competition_code
      )
    where sl.category in ('champion_pick_a', 'champion_pick_b')
      and sl.entity_key in (v_pick_a_entity_key, v_pick_b_entity_key)
      and sl.voided_at is null;

    get diagnostics v_stale_rows_voided = row_count;

    v_profiles_updated := public.refresh_profile_points_from_active_ledger();
    v_leaderboards_upserted := public.refresh_leaderboards_from_profiles();
    v_categories_skipped := jsonb_build_object(
      'champion_pick_a', 'champion_result_not_confirmed',
      'champion_pick_b', 'champion_result_not_confirmed'
    );
    v_run_status := 'skipped';

    update public.scoring_runs sr
    set
      categories_completed = array[]::text[],
      categories_skipped = v_categories_skipped,
      status = v_run_status,
      finished_at = timezone('utc', now()),
      metadata = sr.metadata || jsonb_build_object(
        'picks_evaluated', v_picks_evaluated,
        'ledger_rows_upserted', v_ledger_rows_upserted,
        'stale_ledger_rows_voided', v_stale_rows_voided,
        'profiles_updated', v_profiles_updated,
        'leaderboards_upserted', v_leaderboards_upserted,
        'total_points_awarded', v_total_points_awarded,
        'skip_reason', 'champion_result_not_confirmed'
      )
    where sr.id = v_run_id;

    return query select
      v_competition_code,
      v_result.champion_team_code,
      v_picks_evaluated,
      v_ledger_rows_upserted,
      v_stale_rows_voided,
      v_profiles_updated,
      v_leaderboards_upserted,
      v_total_points_awarded;
    return;
  end if;

  with evaluated as (
    select
      tcp.id,
      tcp.user_id,
      tcp.competition_id,
      upper(trim(tcp.competition_code)) as competition_code,
      upper(trim(tcp.pick_type)) as pick_type,
      public.resolve_team_code(upper(trim(tcp.competition_code)), tcp.team_code) as predicted_team_code,
      case
        when upper(trim(tcp.pick_type)) = 'A' then 'champion_pick_a'
        else 'champion_pick_b'
      end as category,
      case
        when upper(trim(tcp.pick_type)) = 'A' then v_pick_a_entity_key
        else v_pick_b_entity_key
      end as entity_key,
      case
        when public.resolve_team_code(upper(trim(tcp.competition_code)), tcp.team_code) = v_result.champion_team_code
          then case when upper(trim(tcp.pick_type)) = 'A' then 20 else 15 end
        else 0
      end::integer as next_points,
      case when public.resolve_team_code(upper(trim(tcp.competition_code)), tcp.team_code) = v_result.champion_team_code then 'hit' else 'miss' end as scoring_outcome
    from public.tournament_champion_predictions tcp
    where upper(trim(tcp.competition_code)) = v_competition_code
      and upper(trim(tcp.pick_type)) in ('A', 'B')
    for update of tcp
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
      coalesce(e.competition_id, v_competition_id),
      null,
      null,
      e.category,
      e.entity_key,
      e.next_points,
      'tournament_champion_predictions',
      e.id,
      v_run_id,
      jsonb_build_object(
        'phase', 'champion_pick_ledger_scoring',
        'result_version', v_result.result_version,
        'pick_type', e.pick_type,
        'predicted_team_code', e.predicted_team_code,
        'official_champion_team_code', v_result.champion_team_code,
        'scoring_outcome', e.scoring_outcome,
        'points_rule', case when e.pick_type = 'A' then '20_for_correct_champion_pick_a' else '15_for_correct_champion_pick_b' end,
        'champion_confirmed_at', v_result.champion_confirmed_at,
        'competition_code', v_competition_code
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
      void_reason = 'champion_prediction_no_longer_exists',
      scoring_run_id = v_run_id,
      metadata = sl.metadata || jsonb_build_object(
        'phase', 'champion_pick_ledger_scoring',
        'voided_by', 'score_tournament_champion',
        'reason', 'champion_prediction_no_longer_exists',
        'competition_code', v_competition_code
      )
    where sl.category in ('champion_pick_a', 'champion_pick_b')
      and sl.entity_key in (v_pick_a_entity_key, v_pick_b_entity_key)
      and sl.voided_at is null
      and not exists (
        select 1
        from evaluated e
        where e.user_id = sl.user_id
          and e.category = sl.category
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
    v_picks_evaluated,
    v_ledger_rows_upserted,
    v_stale_rows_voided,
    v_total_points_awarded;

  v_profiles_updated := public.refresh_profile_points_from_active_ledger();
  v_leaderboards_upserted := public.refresh_leaderboards_from_profiles();
  v_categories_completed := v_categories_requested;
  v_run_status := 'completed';

  update public.scoring_runs sr
  set
    categories_completed = v_categories_completed,
    categories_skipped = v_categories_skipped,
    status = v_run_status,
    finished_at = timezone('utc', now()),
    metadata = sr.metadata || jsonb_build_object(
      'picks_evaluated', v_picks_evaluated,
      'ledger_rows_upserted', v_ledger_rows_upserted,
      'stale_ledger_rows_voided', v_stale_rows_voided,
      'profiles_updated', v_profiles_updated,
      'leaderboards_upserted', v_leaderboards_upserted,
      'total_points_awarded', v_total_points_awarded,
      'official_champion_team_code', v_result.champion_team_code,
      'result_version', v_result.result_version
    )
  where sr.id = v_run_id;

  return query select
    v_competition_code,
    v_result.champion_team_code,
    v_picks_evaluated,
    v_ledger_rows_upserted,
    v_stale_rows_voided,
    v_profiles_updated,
    v_leaderboards_upserted,
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
          'phase', 'champion_pick_ledger_scoring',
          'competition_code', v_competition_code
        )
      where sr.id = v_run_id;
    end if;
    raise;
end;
$$;

revoke all on function public.validate_tournament_result_row() from public;
revoke all on function public.validate_tournament_result_row() from anon;
revoke all on function public.validate_tournament_result_row() from authenticated;

revoke all on function public.score_tournament_champion(text, uuid) from public;
revoke all on function public.score_tournament_champion(text, uuid) from anon;
revoke all on function public.score_tournament_champion(text, uuid) from authenticated;
grant execute on function public.score_tournament_champion(text, uuid) to service_role;


-- Keep the existing ledger reconciliation aware that Champion Pick A/B rows are
-- now valid active ledger categories. This does not change match scoring.
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
  v_allowed_active_categories constant text[] := array['match_exact_result', 'match_possession', 'match_scorer', 'match_lineup', 'champion_pick_a', 'champion_pick_b'];
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


revoke all on function public.reconcile_exact_result_scoring_ledger() from public;
revoke all on function public.reconcile_exact_result_scoring_ledger() from anon;
revoke all on function public.reconcile_exact_result_scoring_ledger() from authenticated;
grant execute on function public.reconcile_exact_result_scoring_ledger() to service_role;

comment on function public.reconcile_exact_result_scoring_ledger() is 'Service-role-only all-active-ledger reconciliation summary. Allows active exact-result, possession, scorer, lineup, and Champion Pick A/B rows while validating exact-result compatibility, duplicate active ledger rows, and profile point totals.';

comment on table public.tournament_results is 'Official tournament-level results, including confirmed champion, managed through server-side admin tools.';
comment on function public.score_tournament_champion(text, uuid) is 'Service-role-only Champion Pick A/B ledger scorer. Scores saved picks only after official champion confirmation; wrong saved picks receive active 0-point rows.';

notify pgrst, 'reload schema';
