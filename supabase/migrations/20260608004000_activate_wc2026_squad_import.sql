-- Activate normalized WC2026 squad rows when trusted staging data is already present.
-- This is intentionally data-only: it does not change scoring, leaderboards, exact-score
-- prediction storage, service-role exposure, or RLS policy strength.

do $$
begin
  if to_regprocedure('public.import_wc2026_squad_from_staging(text, boolean)') is null then
    raise notice 'Skipping WC2026 squad activation: import function is not available.';
    return;
  end if;

  if to_regclass('public.wc2026_squad_players_seed') is null
    or to_regclass('public.wc2026_squad_imports') is null
    or not exists (
      select 1
      from public.wc2026_squad_players_seed
      where competition_code = 'WC2026'
    ) then
    raise notice 'Skipping WC2026 squad activation: staging rows are not available.';
    return;
  end if;

  if to_regclass('public.competition_team_players') is not null
    and exists (
      select 1
      from public.competition_team_players
      where competition_code = 'WC2026'
        and is_active
    ) then
    raise notice 'Skipping WC2026 squad activation: active normalized squad rows already exist.';
    return;
  end if;

  perform * from public.import_wc2026_squad_from_staging(null, true);
end $$;

notify pgrst, 'reload schema';
