-- 05_seed_sample_matches.sql
-- Predict26: clean sample/dev-safe matches.
-- Supports old + new matches columns.

DO $$
DECLARE
  v_competition_id UUID;
BEGIN
  SELECT id INTO v_competition_id
  FROM competitions
  WHERE slug = 'world-cup-2026';

  IF v_competition_id IS NULL THEN
    RAISE NOTICE 'Competition world-cup-2026 not found. Skipping sample matches.';
    RETURN;
  END IF;

  INSERT INTO matches (
    match_number,
    competition_id,
    home_team_code,
    away_team_code,
    home_team_name,
    away_team_name,
    home_country_code,
    away_country_code,
    kickoff_at,
    status,
    stage,
    group_name,
    venue,
    city
  )
  VALUES
    (1, v_competition_id, 'USA', 'CAN', 'United States', 'Canada', 'USA', 'CAN', '2026-06-11 18:00:00+00', 'scheduled', 'group', 'D', 'Sample Stadium', 'Sample City'),
    (2, v_competition_id, 'MEX', 'RSA', 'Mexico', 'South Africa', 'MEX', 'RSA', '2026-06-12 18:00:00+00', 'scheduled', 'group', 'A', 'Sample Stadium', 'Sample City'),
    (3, v_competition_id, 'BRA', 'MAR', 'Brazil', 'Morocco', 'BRA', 'MAR', '2026-06-13 18:00:00+00', 'scheduled', 'group', 'C', 'Sample Stadium', 'Sample City'),
    (4, v_competition_id, 'FRA', 'SEN', 'France', 'Senegal', 'FRA', 'SEN', '2026-06-14 18:00:00+00', 'scheduled', 'group', 'I', 'Sample Stadium', 'Sample City')
  ON CONFLICT DO NOTHING;
END
$$;
