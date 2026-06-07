-- 05_seed_sample_matches.sql
-- Predict26: Seed a few sample/dev-safe matches with real teams.
-- Idempotent: checks for existing matches to avoid duplicates.

-- Use a DO block to insert sample matches only if they don't already exist.
DO $$
DECLARE
  v_competition_id UUID;
BEGIN
  -- Get the World Cup 2026 competition ID
  SELECT id INTO v_competition_id FROM competitions WHERE slug = 'world-cup-2026';

  IF v_competition_id IS NULL THEN
    RAISE NOTICE 'Competition world-cup-2026 not found. Skipping sample matches.';
    RETURN;
  END IF;

  -- USA vs CAN (Group A opener)
  IF NOT EXISTS (
    SELECT 1 FROM matches
    WHERE competition_id = v_competition_id
      AND home_country_code = 'USA' AND away_country_code = 'CAN'
  ) THEN
    INSERT INTO matches (competition_id, home_country_code, away_country_code, kickoff_at, status, stage, group_name, venue, city)
    VALUES (
      v_competition_id, 'USA', 'CAN',
      '2026-06-11 18:00:00+00',
      'scheduled', 'group', 'A',
      'MetLife Stadium (Sample)', 'East Rutherford, NJ'
    );
  END IF;

  -- MEX vs BRA (Group B)
  IF NOT EXISTS (
    SELECT 1 FROM matches
    WHERE competition_id = v_competition_id
      AND home_country_code = 'MEX' AND away_country_code = 'BRA'
  ) THEN
    INSERT INTO matches (competition_id, home_country_code, away_country_code, kickoff_at, status, stage, group_name, venue, city)
    VALUES (
      v_competition_id, 'MEX', 'BRA',
      '2026-06-12 20:00:00+00',
      'scheduled', 'group', 'B',
      'Estadio Azteca (Sample)', 'Mexico City'
    );
  END IF;

  -- JPN vs KOR (Group G/H)
  IF NOT EXISTS (
    SELECT 1 FROM matches
    WHERE competition_id = v_competition_id
      AND home_country_code = 'JPN' AND away_country_code = 'KOR'
  ) THEN
    INSERT INTO matches (competition_id, home_country_code, away_country_code, kickoff_at, status, stage, group_name, venue, city)
    VALUES (
      v_competition_id, 'JPN', 'KOR',
      '2026-06-13 15:00:00+00',
      'scheduled', 'group', 'G',
      'SoFi Stadium (Sample)', 'Los Angeles, CA'
    );
  END IF;

  -- FRA vs GER (Group H)
  IF NOT EXISTS (
    SELECT 1 FROM matches
    WHERE competition_id = v_competition_id
      AND home_country_code = 'FRA' AND away_country_code = 'GER'
  ) THEN
    INSERT INTO matches (competition_id, home_country_code, away_country_code, kickoff_at, status, stage, group_name, venue, city)
    VALUES (
      v_competition_id, 'FRA', 'GER',
      '2026-06-14 21:00:00+00',
      'scheduled', 'group', 'H',
      'AT&T Stadium (Sample)', 'Arlington, TX'
    );
  END IF;

END
$$;
