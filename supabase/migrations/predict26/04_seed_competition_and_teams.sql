-- 04_seed_competition_and_teams.sql
-- Predict26: FIFA World Cup 2026 competition + teams/groups.
-- Uses existing app country codes where needed, especially UZ for Uzbekistan.
-- No auth.users triggers.

INSERT INTO competitions (
  slug, name, year, host_country_codes, starts_at, ends_at, is_active
)
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

INSERT INTO countries (code, name, flag_emoji, confederation, is_active)
VALUES
  ('MEX','Mexico','🇲🇽','CONCACAF',TRUE),
  ('RSA','South Africa','🇿🇦','CAF',TRUE),
  ('KOR','South Korea','🇰🇷','AFC',TRUE),
  ('CZE','Czechia','🇨🇿','UEFA',TRUE),
  ('CAN','Canada','🇨🇦','CONCACAF',TRUE),
  ('BIH','Bosnia and Herzegovina','🇧🇦','UEFA',TRUE),
  ('QAT','Qatar','🇶🇦','AFC',TRUE),
  ('SUI','Switzerland','🇨🇭','UEFA',TRUE),
  ('BRA','Brazil','🇧🇷','CONMEBOL',TRUE),
  ('MAR','Morocco','🇲🇦','CAF',TRUE),
  ('HAI','Haiti','🇭🇹','CONCACAF',TRUE),
  ('SCO','Scotland','🏴','UEFA',TRUE),
  ('USA','United States','🇺🇸','CONCACAF',TRUE),
  ('PAR','Paraguay','🇵🇾','CONMEBOL',TRUE),
  ('AUS','Australia','🇦🇺','AFC',TRUE),
  ('TUR','Turkey','🇹🇷','UEFA',TRUE),
  ('GER','Germany','🇩🇪','UEFA',TRUE),
  ('CUW','Curaçao','🇨🇼','CONCACAF',TRUE),
  ('CIV','Côte d''Ivoire','🇨🇮','CAF',TRUE),
  ('ECU','Ecuador','🇪🇨','CONMEBOL',TRUE),
  ('NED','Netherlands','🇳🇱','UEFA',TRUE),
  ('JPN','Japan','🇯🇵','AFC',TRUE),
  ('SWE','Sweden','🇸🇪','UEFA',TRUE),
  ('TUN','Tunisia','🇹🇳','CAF',TRUE),
  ('BEL','Belgium','🇧🇪','UEFA',TRUE),
  ('IRN','Iran','🇮🇷','AFC',TRUE),
  ('NZL','New Zealand','🇳🇿','OFC',TRUE),
  ('EGY','Egypt','🇪🇬','CAF',TRUE),
  ('ESP','Spain','🇪🇸','UEFA',TRUE),
  ('CPV','Cabo Verde','🇨🇻','CAF',TRUE),
  ('KSA','Saudi Arabia','🇸🇦','AFC',TRUE),
  ('URU','Uruguay','🇺🇾','CONMEBOL',TRUE),
  ('FRA','France','🇫🇷','UEFA',TRUE),
  ('SEN','Senegal','🇸🇳','CAF',TRUE),
  ('IRQ','Iraq','🇮🇶','AFC',TRUE),
  ('NOR','Norway','🇳🇴','UEFA',TRUE),
  ('ARG','Argentina','🇦🇷','CONMEBOL',TRUE),
  ('ALG','Algeria','🇩🇿','CAF',TRUE),
  ('AUT','Austria','🇦🇹','UEFA',TRUE),
  ('JOR','Jordan','🇯🇴','AFC',TRUE),
  ('POR','Portugal','🇵🇹','UEFA',TRUE),
  ('UZ','Uzbekistan','🇺🇿','AFC',TRUE),
  ('COL','Colombia','🇨🇴','CONMEBOL',TRUE),
  ('COD','DR Congo','🇨🇩','CAF',TRUE),
  ('ENG','England','🏴','UEFA',TRUE),
  ('CRO','Croatia','🇭🇷','UEFA',TRUE),
  ('GHA','Ghana','🇬🇭','CAF',TRUE),
  ('PAN','Panama','🇵🇦','CONCACAF',TRUE)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  flag_emoji = EXCLUDED.flag_emoji,
  confederation = EXCLUDED.confederation,
  is_active = TRUE;

INSERT INTO competition_teams (
  competition_id,
  country_code,
  group_name,
  qualified
)
SELECT c.id, t.country_code, t.group_name, TRUE
FROM competitions c
CROSS JOIN (VALUES
  ('MEX','A'), ('RSA','A'), ('KOR','A'), ('CZE','A'),
  ('CAN','B'), ('BIH','B'), ('QAT','B'), ('SUI','B'),
  ('BRA','C'), ('MAR','C'), ('HAI','C'), ('SCO','C'),
  ('USA','D'), ('PAR','D'), ('AUS','D'), ('TUR','D'),
  ('GER','E'), ('CUW','E'), ('CIV','E'), ('ECU','E'),
  ('NED','F'), ('JPN','F'), ('SWE','F'), ('TUN','F'),
  ('BEL','G'), ('IRN','G'), ('NZL','G'), ('EGY','G'),
  ('ESP','H'), ('CPV','H'), ('KSA','H'), ('URU','H'),
  ('FRA','I'), ('SEN','I'), ('IRQ','I'), ('NOR','I'),
  ('ARG','J'), ('ALG','J'), ('AUT','J'), ('JOR','J'),
  ('POR','K'), ('UZ','K'), ('COL','K'), ('COD','K'),
  ('ENG','L'), ('CRO','L'), ('GHA','L'), ('PAN','L')
) AS t(country_code, group_name)
WHERE c.slug = 'world-cup-2026'
ON CONFLICT (competition_id, country_code) DO UPDATE SET
  group_name = EXCLUDED.group_name,
  qualified = TRUE;
