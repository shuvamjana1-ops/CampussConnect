-- Opportunity_Service tables (requirements 10.1 to 10.9, 10.13, 19.3, 19.4): Student profiles with per-field source
-- and embedding, and Opportunities with embeddings. Every table carries tenant_id, leads its indexes with it and is
-- protected by forced row-level security with a restrictive tenant policy. Embedding columns have HNSW indexes.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS opps;
GRANT USAGE ON SCHEMA opps TO cc_owner, cc_app, cc_reader, cc_definer;

CREATE TABLE IF NOT EXISTS opps.student_profiles (
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  -- { "<field>": { "value": ..., "source": "erp" | "student", "updatedAt": <epoch ms> } } (10.1, 10.3, 10.4).
  fields jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fields) = 'object'),
  -- Prefill state: 'prefilled' once ERP data is in, 'pending' while retries remain, 'unavailable' when they are used up (10.2).
  prefill_status text NOT NULL DEFAULT 'pending' CHECK (prefill_status IN ('prefilled', 'pending', 'unavailable')),
  prefill_attempts integer NOT NULL DEFAULT 0 CHECK (prefill_attempts >= 0),
  prefill_next_at timestamptz,
  prefill_notice boolean NOT NULL DEFAULT false,
  -- Profile embedding (10.7, 10.8). The previous vector is kept when regeneration fails.
  embedding vector(1024),
  embedding_stale boolean NOT NULL DEFAULT false,
  embedding_updated_at timestamptz,
  embedding_attempts integer NOT NULL DEFAULT 0 CHECK (embedding_attempts >= 0),
  embedding_next_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES core.users (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_student_profiles_prefill_retry
  ON opps.student_profiles (tenant_id, prefill_next_at) WHERE prefill_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_student_profiles_embedding_retry
  ON opps.student_profiles (tenant_id, embedding_next_at) WHERE embedding_next_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_student_profiles_embedding_hnsw
  ON opps.student_profiles USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS opps.opportunities (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 5000),
  eligibility_rules jsonb NOT NULL,
  required_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  deadline timestamptz NOT NULL,
  apply_link text CHECK (length(apply_link) <= 2048),
  apply_instructions text CHECK (length(apply_instructions) <= 5000),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'expired', 'withdrawn')),
  created_by uuid,
  embedding vector(1024),
  embedding_stale boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  CHECK (apply_link IS NOT NULL OR apply_instructions IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_opportunities_open ON opps.opportunities (tenant_id, deadline) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_opportunities_embedding_hnsw
  ON opps.opportunities USING hnsw (embedding vector_cosine_ops);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['student_profiles', 'opportunities']
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

GRANT SELECT, INSERT, UPDATE, DELETE ON opps.student_profiles TO cc_app;
GRANT SELECT, INSERT, UPDATE ON opps.opportunities TO cc_app;
GRANT SELECT ON ALL TABLES IN SCHEMA opps TO cc_reader;

-- RLS lint: explicit statements for static analysis
ALTER TABLE opps.student_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE opps.opportunities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON opps.student_profiles;
CREATE POLICY tenant_isolation ON opps.student_profiles AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON opps.opportunities;
CREATE POLICY tenant_isolation ON opps.opportunities AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
