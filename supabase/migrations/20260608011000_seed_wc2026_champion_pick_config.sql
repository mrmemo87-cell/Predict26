-- Seed/fix WC2026 Champion Pick availability configuration only.
-- This migration does not score picks, touch scoring functions, or mutate ledgers.

insert into public.tournament_prediction_config (
  competition_code,
  competition_id,
  knockout_starts_at,
  round_of_16_starts_at,
  champion_pick_a_deadline,
  champion_pick_b_deadline,
  champion_picks_enabled
)
values (
  'WC2026',
  (select c.id from public.competitions c where c.slug = 'world-cup-2026' limit 1),
  '2026-06-28 00:00:00+00'::timestamptz,
  '2026-07-04 00:00:00+00'::timestamptz,
  '2026-06-28 00:00:00+00'::timestamptz,
  '2026-07-04 00:00:00+00'::timestamptz,
  true
)
on conflict (competition_code) do update
set
  competition_id = coalesce(
    public.tournament_prediction_config.competition_id,
    excluded.competition_id
  ),
  knockout_starts_at = coalesce(
    public.tournament_prediction_config.knockout_starts_at,
    excluded.knockout_starts_at
  ),
  round_of_16_starts_at = coalesce(
    public.tournament_prediction_config.round_of_16_starts_at,
    excluded.round_of_16_starts_at
  ),
  champion_pick_a_deadline = coalesce(
    public.tournament_prediction_config.champion_pick_a_deadline,
    excluded.champion_pick_a_deadline
  ),
  champion_pick_b_deadline = coalesce(
    public.tournament_prediction_config.champion_pick_b_deadline,
    excluded.champion_pick_b_deadline
  ),
  champion_picks_enabled = true,
  updated_at = timezone('utc', now());
