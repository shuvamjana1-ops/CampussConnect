-- ERP synchronisation (requirements 17.5, 17.6, 17.7, 17.9): per-Tenant cursor and the record of sync attempts that
-- drives the data-freshness warning. Both tables carry tenant_id and are protected by forced row-level security.

CREATE TABLE IF NOT EXISTS core.erp_sync_state (
  tenant_id uuid NOT NULL PRIMARY KEY,
  -- Opaque cursor returned by the ERP adapter; null before the first successful sync.
  cursor text,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  -- True once the last attempt failed after all retries; cleared by the next success.
  stale boolean NOT NULL DEFAULT false,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_error text CHECK (length(last_error) <= 1000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.erp_sync_attempts (
  tenant_id uuid NOT NULL,
  id bigint GENERATED ALWAYS AS IDENTITY,
  at timestamptz NOT NULL DEFAULT now(),
  succeeded boolean NOT NULL,
  students_changed integer NOT NULL DEFAULT 0 CHECK (students_changed >= 0),
  error text CHECK (length(error) <= 1000),
  PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS idx_erp_sync_attempts_at ON core.erp_sync_attempts (tenant_id, at DESC);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['erp_sync_state', 'erp_sync_attempts']
  LOOP
    EXECUTE format('ALTER TABLE core.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE core.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON core.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON core.%I AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant())',
      t
    );
    EXECUTE format('REVOKE ALL ON core.%I FROM PUBLIC', t);
  END LOOP;
END $$;

-- Tenant isolation is enforced by the restrictive policy; the freshness endpoint restricts access to Tenant_Admins.
DROP POLICY IF EXISTS sync_worker_state ON core.erp_sync_state;
CREATE POLICY sync_worker_state ON core.erp_sync_state AS PERMISSIVE FOR ALL TO cc_app USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS sync_worker_attempts ON core.erp_sync_attempts;
CREATE POLICY sync_worker_attempts ON core.erp_sync_attempts AS PERMISSIVE FOR ALL TO cc_app USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON core.erp_sync_state TO cc_app;
GRANT SELECT, INSERT ON core.erp_sync_attempts TO cc_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core TO cc_app;
GRANT SELECT ON core.erp_sync_state, core.erp_sync_attempts TO cc_reader;

-- RLS lint: explicit statements for static analysis
ALTER TABLE core.erp_sync_state FORCE ROW LEVEL SECURITY;
ALTER TABLE core.erp_sync_attempts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.erp_sync_state;
CREATE POLICY tenant_isolation ON core.erp_sync_state AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
DROP POLICY IF EXISTS tenant_isolation ON core.erp_sync_attempts;
CREATE POLICY tenant_isolation ON core.erp_sync_attempts AS RESTRICTIVE FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());
