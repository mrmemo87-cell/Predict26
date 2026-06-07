-- 01_schema.sql
-- Predict26: Core schema for countries, competitions, matches, predictions, reports.
-- Idempotent: uses CREATE TABLE IF NOT EXISTS and safe ALTER statements.

-- =============================================================================
-- countries: Real user countries (nationality / home country)
-- =============================================================================
CREATE TABLE IF NOT EXISTS countries (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  flag_emoji TEXT,
  confederation TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_countries_confederation ON countries (confederation);
CREATE INDEX IF NOT EXISTS idx_countries_is_active ON countries (is_active);

-- =============================================================================
-- competitions: Tournaments (e.g. FIFA World Cup 2026)
-- =============================================================================
CREATE TABLE IF NOT EXISTS competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  year INT NOT NULL,
  host_country_codes TEXT[],
  starts_at DATE,
  ends_at DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_competitions_slug ON competitions (slug);
CREATE INDEX IF NOT EXISTS idx_competitions_year ON competitions (year);
CREATE INDEX IF NOT EXISTS idx_competitions_is_active ON competitions (is_active);

-- =============================================================================
-- competition_teams: Countries participating in a specific tournament
-- =============================================================================
CREATE TABLE IF NOT EXISTS competition_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL REFERENCES countries(code),
  group_name TEXT,
  qualified BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(competition_id, country_code)
);

CREATE INDEX IF NOT EXISTS idx_competition_teams_competition ON competition_teams (competition_id);
CREATE INDEX IF NOT EXISTS idx_competition_teams_country ON competition_teams (country_code);

-- =============================================================================
-- matches: Scheduled matches within a competition
-- =============================================================================
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  home_country_code TEXT NOT NULL REFERENCES countries(code),
  away_country_code TEXT NOT NULL REFERENCES countries(code),
  kickoff_at TIMESTAMPTZ,
  status TEXT DEFAULT 'scheduled',
  stage TEXT DEFAULT 'group',
  group_name TEXT,
  venue TEXT,
  city TEXT,
  home_score INT,
  away_score INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_match_status CHECK (status IN ('scheduled', 'live', 'finished', 'postponed', 'cancelled')),
  CONSTRAINT chk_match_scores CHECK ((home_score IS NULL OR home_score >= 0) AND (away_score IS NULL OR away_score >= 0)),
  CONSTRAINT chk_match_different_teams CHECK (home_country_code <> away_country_code)
);

CREATE INDEX IF NOT EXISTS idx_matches_competition ON matches (competition_id);
CREATE INDEX IF NOT EXISTS idx_matches_kickoff ON matches (kickoff_at);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches (status);
CREATE INDEX IF NOT EXISTS idx_matches_home_country ON matches (home_country_code);
CREATE INDEX IF NOT EXISTS idx_matches_away_country ON matches (away_country_code);

-- =============================================================================
-- predictions: User predictions for matches
-- =============================================================================
CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  home_score INT NOT NULL,
  away_score INT NOT NULL,
  points INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, match_id),
  CONSTRAINT chk_prediction_scores CHECK (home_score >= 0 AND away_score >= 0)
);

CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions (user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions (match_id);

-- =============================================================================
-- match_reports: User reports for wrong match data
-- =============================================================================
CREATE TABLE IF NOT EXISTS match_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_report_status CHECK (status IN ('pending', 'reviewed', 'fixed', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_match_reports_user ON match_reports (user_id);
CREATE INDEX IF NOT EXISTS idx_match_reports_match ON match_reports (match_id);
CREATE INDEX IF NOT EXISTS idx_match_reports_status ON match_reports (status);

-- =============================================================================
-- profiles: Safely add country_code column if profiles table exists
-- =============================================================================
DO $$
BEGIN
  -- Add country_code column to profiles if it doesn't exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'country_code'
    ) THEN
      ALTER TABLE profiles ADD COLUMN country_code TEXT;
    END IF;

    -- Add FK constraint if not already present
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_profiles_country_code' AND table_name = 'profiles'
    ) THEN
      ALTER TABLE profiles
        ADD CONSTRAINT fk_profiles_country_code
        FOREIGN KEY (country_code) REFERENCES countries(code);
    END IF;
  END IF;
END
$$;
