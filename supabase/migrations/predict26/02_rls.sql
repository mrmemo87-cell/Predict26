-- 02_rls.sql
-- Predict26: Row Level Security policies.
-- Idempotent: drops policies before recreating them.

-- =============================================================================
-- Enable RLS on all tables
-- =============================================================================
ALTER TABLE countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_reports ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- countries: Public read access
-- =============================================================================
DROP POLICY IF EXISTS "countries_select_public" ON countries;
CREATE POLICY "countries_select_public" ON countries
  FOR SELECT
  USING (true);

-- =============================================================================
-- competitions: Public read access
-- =============================================================================
DROP POLICY IF EXISTS "competitions_select_public" ON competitions;
CREATE POLICY "competitions_select_public" ON competitions
  FOR SELECT
  USING (true);

-- =============================================================================
-- competition_teams: Public read access
-- =============================================================================
DROP POLICY IF EXISTS "competition_teams_select_public" ON competition_teams;
CREATE POLICY "competition_teams_select_public" ON competition_teams
  FOR SELECT
  USING (true);

-- =============================================================================
-- matches: Public read access
-- =============================================================================
DROP POLICY IF EXISTS "matches_select_public" ON matches;
CREATE POLICY "matches_select_public" ON matches
  FOR SELECT
  USING (true);

-- =============================================================================
-- predictions: Authenticated users can read their own predictions
-- =============================================================================
DROP POLICY IF EXISTS "predictions_select_own" ON predictions;
CREATE POLICY "predictions_select_own" ON predictions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- =============================================================================
-- predictions: Authenticated users can insert their own predictions
-- (only for scheduled matches with future kickoff)
-- =============================================================================
DROP POLICY IF EXISTS "predictions_insert_own" ON predictions;
CREATE POLICY "predictions_insert_own" ON predictions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_id
        AND matches.status = 'scheduled'
        AND matches.kickoff_at > now()
    )
  );

-- =============================================================================
-- predictions: Authenticated users can update their own predictions
-- (only for scheduled matches with future kickoff)
-- =============================================================================
DROP POLICY IF EXISTS "predictions_update_own" ON predictions;
CREATE POLICY "predictions_update_own" ON predictions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM matches
      WHERE matches.id = match_id
        AND matches.status = 'scheduled'
        AND matches.kickoff_at > now()
    )
  );

-- =============================================================================
-- match_reports: Authenticated users can insert their own reports
-- =============================================================================
DROP POLICY IF EXISTS "match_reports_insert_own" ON match_reports;
CREATE POLICY "match_reports_insert_own" ON match_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- match_reports: Authenticated users can read their own reports
-- =============================================================================
DROP POLICY IF EXISTS "match_reports_select_own" ON match_reports;
CREATE POLICY "match_reports_select_own" ON match_reports
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
