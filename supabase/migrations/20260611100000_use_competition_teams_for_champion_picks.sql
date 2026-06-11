-- Champion pick teams must come from the tournament participant list, not squad-player imports.
-- This keeps Champion Pick A/B available for all qualified teams even when a squad list is partial.

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
        from public.competition_teams ct
        join public.competitions c on c.id = ct.competition_id
        where (
            ct.competition_id = cfg.competition_id
            or (
              cfg.competition_id is null
              and cfg.competition_code = 'WC2026'
              and c.slug = 'world-cup-2026'
            )
          )
          and coalesce(ct.qualified, true)
          and public.resolve_team_code(cfg.competition_code, ct.country_code)
            = public.resolve_team_code(cfg.competition_code, p_team_code)
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
      from public.tournament_prediction_config cfg
      join public.competition_teams ct
        on ct.competition_id = cfg.competition_id
      where cfg.competition_code = new.competition_code
        and coalesce(ct.qualified, true)
        and public.resolve_team_code(cfg.competition_code, ct.country_code) = new.champion_team_code
    ) then
      raise exception 'Champion team code % is not a qualified team for competition %.', new.champion_team_code, new.competition_code;
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

  if tg_op = 'UPDATE' then
    v_previous_team_code := old.champion_team_code;
    v_previous_confirmed := old.champion_confirmed;
    new.result_version := greatest(coalesce(old.result_version, 1), coalesce(new.result_version, 1));

    if v_previous_team_code is distinct from new.champion_team_code
      or v_previous_confirmed is distinct from new.champion_confirmed then
      new.result_version := new.result_version + 1;
    end if;
  end if;

  new.updated_at := timezone('utc', now());
  return new;
end;
$$;
