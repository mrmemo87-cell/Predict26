-- 04_seed_competition_and_teams.sql
-- Predict26: Seed FIFA World Cup 2026 competition and participating teams.
-- Idempotent: uses ON CONFLICT DO UPDATE/NOTHING.

-- =============================================================================
-- Insert the competition
-- =============================================================================
INSERT INTO competitions (slug, name, year, host_country_codes, starts_at, ends_at, is_active)
VALUES (
  'world-cup-2026',
  'FIFA World Cup 2026',
  2026,
  ARRAY['USA', 'CAN', 'MEX'],
  '2026-06-11',
  '2026-07-19',
  TRUE
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  year = EXCLUDED.year,
  host_country_codes = EXCLUDED.host_country_codes,
  starts_at = EXCLUDED.starts_at,
  ends_at = EXCLUDED.ends_at,
  is_active = EXCLUDED.is_active;

-- =============================================================================
-- Insert competition teams (broad list of known/placeholder qualified teams)
-- =============================================================================
INSERT INTO competition_teams (competition_id, country_code, group_name, qualified)
SELECT c.id, t.country_code, t.group_name, TRUE
FROM competitions c
CROSS JOIN (VALUES
  -- Hosts (auto-qualified)
  ('USA', 'A'),
  ('CAN', 'A'),
  ('MEX', 'B'),

  -- South America
  ('BRA', 'B'),
  ('ARG', 'C'),
  ('URU', 'C'),
  ('COL', 'D'),
  ('ECU', 'D'),
  ('PAR', 'E'),
  ('CHI', 'E'),
  ('PER', 'F'),
  ('VEN', 'F'),
  ('BOL', 'G'),

  -- Europe
  ('ENG', 'G'),
  ('FRA', 'H'),
  ('GER', 'H'),
  ('ESP', 'I'),
  ('POR', 'I'),
  ('ITA', 'J'),
  ('NED', 'J'),
  ('BEL', 'K'),
  ('CRO', 'K'),
  ('DEN', 'L'),
  ('SRB', 'L'),
  ('POL', 'A'),
  ('UKR', 'B'),
  ('TUR', 'C'),
  ('SUI', 'D'),
  ('AUT', 'E'),
  ('NOR', 'F'),
  ('SWE', 'G'),
  ('SCO', 'H'),

  -- Africa
  ('MAR', 'I'),
  ('NGA', 'J'),
  ('SEN', 'K'),
  ('GHA', 'L'),
  ('EGY', 'A'),
  ('TUN', 'B'),
  ('ALG', 'C'),
  ('RSA', 'D'),
  ('CIV', 'E'),
  ('CMR', 'F'),

  -- Asia
  ('JPN', 'G'),
  ('KOR', 'H'),
  ('IRN', 'I'),
  ('KSA', 'J'),
  ('QAT', 'K'),
  ('AUS', 'L'),
  ('UZB', 'L'),

  -- Oceania
  ('NZL', 'K'),

  -- CONCACAF
  ('CRC', 'I'),
  ('JAM', 'J'),
  ('HON', 'H')
) AS t(country_code, group_name)
WHERE c.slug = 'world-cup-2026'
ON CONFLICT (competition_id, country_code) DO UPDATE SET
  group_name = EXCLUDED.group_name,
  qualified = TRUE;
