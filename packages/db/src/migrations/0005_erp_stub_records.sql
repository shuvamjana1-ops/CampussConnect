-- Phase 1 ERP stub (requirement 17.2): Tenant-scoped records read by StubErpAdapter, seeded from fixtures and
-- editable by Tenant_Admins in non-production environments. The adapter itself only ever reads.

CREATE TABLE IF NOT EXISTS core.erp_stub_records (
  tenant_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('student', 'course')),
  external_id text NOT NULL CHECK (length(external_id) BETWEEN 1 AND 128),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, kind, external_id)
);

CREATE INDEX IF NOT EXISTS idx_erp_stub_records_changed
  ON core.erp_stub_records (tenant_id, kind, updated_at, external_id);

ALTER TABLE core.erp_stub_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY erp_stub_records_tenant ON core.erp_stub_records
  FOR ALL TO cc_app USING (tenant_id = app.tenant()) WITH CHECK (tenant_id = app.tenant());

REVOKE ALL ON core.erp_stub_records FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.erp_stub_records TO cc_app;

-- RLS lint: explicit statements for static analysis
ALTER TABLE core.erp_stub_records FORCE ROW LEVEL SECURITY;
