-- Migration 006: Scout company profiles + updated plan names
-- Adds enriched company profile cache and updates plan enum to include prospector/dealmaker

-- ── Enriched company profiles (Companies House cache) ─────────────────────────
CREATE TABLE IF NOT EXISTS company_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_number  text NOT NULL UNIQUE,
  name            text NOT NULL,
  sic_codes       text[],
  incorporation_date date,
  age_years       numeric(4,1),
  status          text,
  address         text,
  score           integer DEFAULT 0,
  sell_signals    text[],
  enriched_at     timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_profiles_score ON company_profiles(score DESC);
CREATE INDEX IF NOT EXISTS idx_company_profiles_name  ON company_profiles(name);

-- ── Scout saved searches ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scout_searches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query       text NOT NULL,
  sector      text DEFAULT 'all',
  result_count integer,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scout_searches_user ON scout_searches(user_id, created_at DESC);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE company_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE scout_searches   ENABLE ROW LEVEL SECURITY;

-- company_profiles: readable by all authenticated users (shared cache)
DROP POLICY IF EXISTS "auth_read_company_profiles" ON company_profiles;
CREATE POLICY "auth_read_company_profiles" ON company_profiles
  FOR SELECT TO authenticated USING (true);

-- scout_searches: users own their searches
DROP POLICY IF EXISTS "own_scout_searches" ON scout_searches;
CREATE POLICY "own_scout_searches" ON scout_searches
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Update webhook plan map to include prospector / dealmaker ─────────────
-- (No DB changes needed — plan names are stored as text)

-- ── Backfill: add prospector/dealmaker as valid plan values ────────────────
-- user_profiles.plan is text, so new values work automatically
