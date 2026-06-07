-- 03_seed_countries.sql
-- Predict26: Seed a broad list of real countries.
-- Idempotent: uses ON CONFLICT DO UPDATE.

INSERT INTO countries (code, name, flag_emoji, confederation) VALUES
  -- North/Central America & Caribbean (CONCACAF)
  ('USA', 'United States', '🇺🇸', 'CONCACAF'),
  ('CAN', 'Canada', '🇨🇦', 'CONCACAF'),
  ('MEX', 'Mexico', '🇲🇽', 'CONCACAF'),
  ('CRC', 'Costa Rica', '🇨🇷', 'CONCACAF'),
  ('JAM', 'Jamaica', '🇯🇲', 'CONCACAF'),
  ('HON', 'Honduras', '🇭🇳', 'CONCACAF'),
  ('PAN', 'Panama', '🇵🇦', 'CONCACAF'),

  -- South America (CONMEBOL)
  ('BRA', 'Brazil', '🇧🇷', 'CONMEBOL'),
  ('ARG', 'Argentina', '🇦🇷', 'CONMEBOL'),
  ('URU', 'Uruguay', '🇺🇾', 'CONMEBOL'),
  ('COL', 'Colombia', '🇨🇴', 'CONMEBOL'),
  ('ECU', 'Ecuador', '🇪🇨', 'CONMEBOL'),
  ('CHI', 'Chile', '🇨🇱', 'CONMEBOL'),
  ('PAR', 'Paraguay', '🇵🇾', 'CONMEBOL'),
  ('PER', 'Peru', '🇵🇪', 'CONMEBOL'),
  ('VEN', 'Venezuela', '🇻🇪', 'CONMEBOL'),
  ('BOL', 'Bolivia', '🇧🇴', 'CONMEBOL'),

  -- Europe (UEFA)
  ('ENG', 'England', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'UEFA'),
  ('FRA', 'France', '🇫🇷', 'UEFA'),
  ('GER', 'Germany', '🇩🇪', 'UEFA'),
  ('ESP', 'Spain', '🇪🇸', 'UEFA'),
  ('POR', 'Portugal', '🇵🇹', 'UEFA'),
  ('ITA', 'Italy', '🇮🇹', 'UEFA'),
  ('NED', 'Netherlands', '🇳🇱', 'UEFA'),
  ('BEL', 'Belgium', '🇧🇪', 'UEFA'),
  ('CRO', 'Croatia', '🇭🇷', 'UEFA'),
  ('DEN', 'Denmark', '🇩🇰', 'UEFA'),
  ('SWE', 'Sweden', '🇸🇪', 'UEFA'),
  ('NOR', 'Norway', '🇳🇴', 'UEFA'),
  ('POL', 'Poland', '🇵🇱', 'UEFA'),
  ('UKR', 'Ukraine', '🇺🇦', 'UEFA'),
  ('TUR', 'Turkey', '🇹🇷', 'UEFA'),
  ('SRB', 'Serbia', '🇷🇸', 'UEFA'),
  ('SUI', 'Switzerland', '🇨🇭', 'UEFA'),
  ('AUT', 'Austria', '🇦🇹', 'UEFA'),
  ('SCO', 'Scotland', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'UEFA'),
  ('WAL', 'Wales', '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'UEFA'),
  ('CZE', 'Czech Republic', '🇨🇿', 'UEFA'),
  ('GRE', 'Greece', '🇬🇷', 'UEFA'),
  ('ROU', 'Romania', '🇷🇴', 'UEFA'),
  ('HUN', 'Hungary', '🇭🇺', 'UEFA'),
  ('SVK', 'Slovakia', '🇸🇰', 'UEFA'),
  ('FIN', 'Finland', '🇫🇮', 'UEFA'),
  ('IRL', 'Ireland', '🇮🇪', 'UEFA'),
  ('RUS', 'Russia', '🇷🇺', 'UEFA'),

  -- Africa (CAF)
  ('MAR', 'Morocco', '🇲🇦', 'CAF'),
  ('NGA', 'Nigeria', '🇳🇬', 'CAF'),
  ('SEN', 'Senegal', '🇸🇳', 'CAF'),
  ('GHA', 'Ghana', '🇬🇭', 'CAF'),
  ('EGY', 'Egypt', '🇪🇬', 'CAF'),
  ('TUN', 'Tunisia', '🇹🇳', 'CAF'),
  ('ALG', 'Algeria', '🇩🇿', 'CAF'),
  ('RSA', 'South Africa', '🇿🇦', 'CAF'),
  ('CIV', 'Côte d''Ivoire', '🇨🇮', 'CAF'),
  ('CMR', 'Cameroon', '🇨🇲', 'CAF'),
  ('MLI', 'Mali', '🇲🇱', 'CAF'),
  ('COD', 'DR Congo', '🇨🇩', 'CAF'),

  -- Asia (AFC)
  ('JPN', 'Japan', '🇯🇵', 'AFC'),
  ('KOR', 'South Korea', '🇰🇷', 'AFC'),
  ('IRN', 'Iran', '🇮🇷', 'AFC'),
  ('KSA', 'Saudi Arabia', '🇸🇦', 'AFC'),
  ('QAT', 'Qatar', '🇶🇦', 'AFC'),
  ('UAE', 'United Arab Emirates', '🇦🇪', 'AFC'),
  ('AUS', 'Australia', '🇦🇺', 'AFC'),
  ('KGZ', 'Kyrgyzstan', '🇰🇬', 'AFC'),
  ('KAZ', 'Kazakhstan', '🇰🇿', 'AFC'),
  ('UZB', 'Uzbekistan', '🇺🇿', 'AFC'),
  ('CHN', 'China', '🇨🇳', 'AFC'),
  ('IND', 'India', '🇮🇳', 'AFC'),
  ('IDN', 'Indonesia', '🇮🇩', 'AFC'),

  -- Oceania (OFC)
  ('NZL', 'New Zealand', '🇳🇿', 'OFC')

ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  flag_emoji = EXCLUDED.flag_emoji,
  confederation = EXCLUDED.confederation,
  is_active = TRUE;
