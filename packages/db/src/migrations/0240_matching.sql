-- Match_Engine tables (requirements 11.1 to 11.4, 11.7, 11.8, 11.10): stored matches with criteria, score and
-- explanation, and Student feedback on Opportunities. Every table carries tenant_id, leads its indexes with it and is
-- protected by forced row-level security with a restrictive tenant policy.

CREATE TABLE IF NOT EXISTS opps.matches (
  tenant_id uuid NOT NULL,
  student_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  -- Integer 0 to 100 (11.1).
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  -- Overall eligibility: 'met', or 'unknown' when criteria are flagged for the Student. 'not_met' is never stored (11.2).
  result text NOT NULL CHECK (result IN ('met', 'unknown')),
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(criteria) = 'array'),
  -- 1 to 5 attributes shown as "why recommended" (11.3).
  explanation jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(explanation) = 'array'),
  matched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, student_id, opportunity_id),
  FOREIGN KEY (tenant_id, opportunity_id) REFERENCES opps.opportunities (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, student_id) REFERENCES core.users (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_matches_opportunity ON opps.matches (tenant_id, opportunity_id);
CREATE INDEX IF NOT EXISTS idx_matches_student_score ON opps.matches (tenant_id, student_id, score DESC);

CREATE TABLE IF NOT EXISTS opps.match_feedback (
  tenant_id uuid NOT NULL,
  student_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  feedback text NOT NULL CHECK (feedback IN ('relevant', 'not_relevant', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, student_id, opportunity_id),
  FOREIGN KEY (tenant_id, opportunity_id) REFERENCES opps.opportunities (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, student_id) REFERENCES core.users (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_match_feedback_student ON opps.match_feedback (tenant_id, student_id, feedback);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['matches', 'match_feedback']
  LOOP
    EXECUTE format('ALTER TABLE opps.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE opps.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON opps.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON opps.%I AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant())',
      t
    );
    EXECUTE format('DROP POLICY IF EXISTS app_access ON opps.%I', t);
    EXECUTE format('CREATE POLICY app_access ON opps.%I AS PERMISSIVE FOR ALL TO cc_app USING (true) WITH CHECK (true)', t);
    EXECUTE format('REVOKE ALL ON opps.%I FROM PUBLIC', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON opps.matches TO cc_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON opps.match_feedback TO cc_app;
GRANT SELECT ON opps.matches, opps.match_feedback TO cc_reader;

-- RLS lint: explicit statements for static analysis
ALTER TABLE opps.matches FORCE ROW LEVEL SECURITY;
ALTER TABLE opps.match_feedback FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON opps.matches;
CREATE POLICY tenant_isolation ON opps.matches AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON opps.match_feedback;
CREATE POLICY tenant_isolation ON opps.match_feedback AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
